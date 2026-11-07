"""One OpenAI-compatible client pointed at OpenRouter. Every answer is validated before it is used."""

import json
import re
from collections.abc import Callable
from typing import Protocol, TypeVar

from openai import NOT_GIVEN, APITimeoutError, OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from ..core.config import Settings

Answer = TypeVar("Answer", bound=BaseModel)


RATE_LIMITED = "This model is temporarily rate-limited. Please try again later."
TIMED_OUT = "The model timed out. Please try again later."
CALL_FAILED = "The model call failed."
NEVER_CHOSE = "The model kept searching and never chose its sources."


class LLMError(Exception):
    """`str(error)` has the detail for logs. `public_message` is what the Checking screen may show."""

    def __init__(self, message: str, public_message: str | None = None):
        super().__init__(message)
        self.public_message = public_message or message


class LLM(Protocol):
    def complete(
        self,
        model: str,
        system: str,
        user: str,
        schema: type[Answer],
        check: Callable[[Answer], None] | None = None,
    ) -> tuple[Answer, str]:
        """Returns the validated answer and the model the provider says answered, empty if it doesn't say."""
        ...


def parse_answer(raw: str, schema: type[Answer], check: Callable[[Answer], None] | None) -> Answer:
    # Some models wrap JSON in a code fence even when asked not to.
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    answer = schema.model_validate(json.loads(cleaned))
    if check:
        check(answer)
    return answer


def _failure_for_code(code: object) -> str:
    """OpenRouter passes upstream failures on as HTTP statuses, or as an error code inside a 200 response."""
    return RATE_LIMITED if code == 429 else TIMED_OUT if code == 408 else CALL_FAILED


SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_sources",
        "description": "Searches the project's approved sources. Returns each page's address, title, date and opening text.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "A short, neutral search query."},
                "election_results_only": {
                    "type": "boolean",
                    "description": "Search only official election bodies and outlets with results desks.",
                },
            },
            "required": ["query"],
        },
    },
}


class OpenRouterLLM:
    def __init__(self, settings: Settings):
        # No automatic retries: a timeout may still have been billed.
        self.client = OpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
        )
        self.research_model, self.research_timeout = settings.research_model, settings.research_timeout_seconds
        self.without_json_mode = {option.model for option in settings.judges.values() if not option.supports_json_mode}

    def _failure(self, model: str, error: OpenAIError) -> LLMError:
        status = getattr(error, "status_code", None)
        public = TIMED_OUT if isinstance(error, APITimeoutError) else _failure_for_code(status)
        return LLMError(f"{model}: {public} ({type(error).__name__})", public)

    def research(self, model, system, user, schema, run_search, max_searches):
        """Lets a model search until it answers. Returns the validated answer and the model the provider says answered."""
        shape = json.dumps(schema.model_json_schema())
        format_note = f"When you have finished searching, reply with JSON only, matching this schema:\n{shape}"
        messages = [{"role": "system", "content": f"{system}\n\n{format_note}"}, {"role": "user", "content": user}]
        searches = 0
        # Each search is one turn at most, then an answer, and one repair of it. Once the searches are used up, the
        # model can't ask for another, so it has to answer.
        for _ in range(max_searches + 2):
            choice = "auto" if searches < max_searches else "none"
            try:
                response = self.client.with_options(timeout=self.research_timeout).chat.completions.create(
                    model=model, messages=messages, tools=[SEARCH_TOOL], tool_choice=choice, temperature=0,
                )
            except OpenAIError as error:
                raise self._failure(model, error) from error
            reported_error = getattr(response, "error", None)
            if isinstance(reported_error, dict):
                public = _failure_for_code(reported_error.get("code"))
                raise LLMError(f"{model}: {public} (code {reported_error.get('code')})", public)
            if not response.choices:
                raise LLMError("The model returned no answer.")
            message = response.choices[0].message
            calls = getattr(message, "tool_calls", None)
            if calls:
                messages.append({
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {"name": call.function.name, "arguments": call.function.arguments},
                        }
                        for call in calls
                    ],
                })
                for call in calls:
                    if searches >= max_searches:
                        reply = "The search limit has been reached. Choose from what you have."
                    else:
                        try:
                            arguments = json.loads(call.function.arguments)
                            query = str(arguments["query"])
                        except (ValueError, KeyError, TypeError):
                            reply = "That search was not valid. It needs a query."
                        else:
                            searches += 1
                            reply = run_search(query, bool(arguments.get("election_results_only")))
                    messages.append({"role": "tool", "tool_call_id": call.id, "content": reply})
                continue
            raw = message.content or ""
            try:
                return parse_answer(raw, schema, None), response.model or ""
            except (ValueError, ValidationError) as error:
                messages += [
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": f"That was not valid: {str(error)[:500]}\nReply again with corrected JSON only."},
                ]
        raise LLMError(f"{model}: research did not finish", NEVER_CHOSE)

    def complete(self, model, system, user, schema, check=None):
        format_note = f"Reply with JSON only, matching this schema:\n{json.dumps(schema.model_json_schema())}"
        messages = [{"role": "system", "content": f"{system}\n\n{format_note}"}, {"role": "user", "content": user}]
        last_error = "no answer"
        for _ in range(2):  # The first attempt, then one repair.
            try:
                client = self.client.with_options(timeout=self.research_timeout) if model == self.research_model else self.client
                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    # Some models require prompt-only JSON. Their answers still get the same local validation and repair.
                    response_format=NOT_GIVEN if model in self.without_json_mode else {"type": "json_object"},
                    temperature=0,
                )
            except OpenAIError as error:
                raise self._failure(model, error) from error
            reported_error = getattr(response, "error", None)
            if isinstance(reported_error, dict):
                public = _failure_for_code(reported_error.get("code"))
                raise LLMError(f"{model}: {public} (code {reported_error.get('code')})", public)
            if not response.choices or not response.choices[0].message.content:
                raise LLMError("The model returned no answer.")
            raw = response.choices[0].message.content
            try:
                return parse_answer(raw, schema, check), response.model or ""
            except (ValueError, ValidationError) as error:
                last_error = str(error)[:500]
                messages += [
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": f"That was not valid: {last_error}\nReply again with corrected JSON only."},
                ]
        raise LLMError(f"The model's answer was invalid: {last_error}", "The model's answer was invalid, even after one repair.")
