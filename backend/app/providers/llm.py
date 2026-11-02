"""One OpenAI-compatible client pointed at OpenRouter. Every answer is validated before it is used."""

import json
import re
from collections.abc import Callable
from typing import Protocol, TypeVar

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from ..core.config import Settings

Answer = TypeVar("Answer", bound=BaseModel)


class LLMError(Exception):
    pass


class LLM(Protocol):
    def complete(
        self,
        model: str,
        system: str,
        user: str,
        schema: type[Answer],
        check: Callable[[Answer], None] | None = None,
    ) -> tuple[Answer, str]:
        """Returns the validated answer and the model that actually answered."""
        ...


def parse_answer(raw: str, schema: type[Answer], check: Callable[[Answer], None] | None) -> Answer:
    # Some models wrap JSON in a code fence even when asked not to.
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    answer = schema.model_validate(json.loads(cleaned))
    if check:
        check(answer)
    return answer


class OpenRouterLLM:
    def __init__(self, settings: Settings):
        # No automatic retries: a timeout may still have been billed.
        self.client = OpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
        )
        self.fallback = settings.fallback_model

    def complete(self, model, system, user, schema, check=None):
        format_note = f"Reply with JSON only, matching this schema:\n{json.dumps(schema.model_json_schema())}"
        messages = [{"role": "system", "content": f"{system}\n\n{format_note}"}, {"role": "user", "content": user}]
        last_error = "no answer"
        for _ in range(2):  # The first attempt, then one repair.
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0,
                    # Judges only see the evidence we give them, so no web plugins.
                    extra_body={"models": [model, self.fallback] if model != self.fallback else [model]},
                )
            except OpenAIError as error:
                raise LLMError(f"The model call failed: {type(error).__name__}") from error
            if not response.choices or not response.choices[0].message.content:
                raise LLMError("The model returned no answer.")
            raw = response.choices[0].message.content
            try:
                return parse_answer(raw, schema, check), response.model or model
            except (ValueError, ValidationError) as error:
                last_error = str(error)[:500]
                messages += [
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": f"That was not valid: {last_error}\nReply again with corrected JSON only."},
                ]
        raise LLMError(f"The model's answer was invalid: {last_error}")
