"""The public task log behind the Checking screen, saved on `Check.progress`.

Each entry is a call that really started or finished, so nothing here is estimated or simulated. Entries hold statuses,
model and service names, and finished public explanations, never a model's private reasoning.

Only the check thread may save, because saving uses the check's database session. Chart jobs on other threads get a
`TaskLog` that queues their updates for it (`_run_visuals` in `run.py`).
"""

from collections.abc import Callable
from dataclasses import dataclass

from config.settings import Settings
from database.models import utcnow

TAVILY = "Tavily"
# Shown when a service answered, but what it gave wasn't enough to draw anything.
NOT_ENOUGH_DATA = "Not enough data to draw this chart."
NOT_ENOUGH_VERIFIED = "Too few figures could be verified in the sources, so nothing was drawn."
NO_READABLE_SOURCE = "No candidate page could be read."
CHART_NOT_DRAWN = "The claim's own words did not fit what this chart needs, so it was not drawn."
CHART_INCOMPLETE = "The sources did not cover the whole chart, so it is not shown."
ONLY_OLDER_PAGES = "Only reports published before the claimed event were found."

Save = Callable[[dict], None]


def _discard(_: dict) -> None:
    pass


def closed_tasks(events: list[dict] | None, message: str) -> list[dict]:
    """Nothing is still running once a check has ended, so its unfinished tasks end with it."""
    return [
        {**event, "status": "failed", "summary": message, "finishedAt": utcnow().isoformat()}
        if event["status"] == "running" else event
        for event in events or []
    ]


@dataclass
class Task:
    id: str
    save: Save

    def update(self, **fields) -> None:
        self.save({"id": self.id, **fields})

    def finish(self, **fields) -> None:
        self.update(status="completed", finishedAt=utcnow().isoformat(), **fields)

    def finish_model(self, reported_model: str, settings: Settings, **fields) -> None:
        """`reported_model` is what the provider says answered. It stays empty if the provider doesn't say."""
        self.finish(
            actualModel=reported_model or None,
            actualModelName=settings.model_display_name(reported_model) if reported_model else None,
            **fields,
        )

    def fail(self, message: str, **fields) -> None:
        self.update(status="failed", summary=message, finishedAt=utcnow().isoformat(), **fields)


@dataclass
class TaskLog:
    save: Save = _discard
    claim_position: int | None = None

    def for_claim(self, position: int) -> "TaskLog":
        return TaskLog(self.save, position)

    def _start(self, name: str, kind: str, task: str, **fields) -> Task:
        event_id = f"claim-{self.claim_position}:{name}" if self.claim_position else name
        self.save({
            "id": event_id,
            "kind": kind,
            "task": task,
            "claimPosition": self.claim_position,
            "status": "running",
            "startedAt": utcnow().isoformat(),
            **fields,
        })
        return Task(event_id, self.save)

    def model(self, name: str, task: str, model: str, settings: Settings) -> Task:
        """A call to an AI model through OpenRouter."""
        return self._start(name, "ai", task, modelName=settings.model_display_name(model), requestedModel=model)

    def search(self, name: str, task: str, **fields) -> Task:
        """Tavily looking for sources, and the server reading the pages it found."""
        return self._start(name, "search", task, service=TAVILY, **fields)

    def chart_skipped(self, chart: str, reason: str = CHART_NOT_DRAWN) -> None:
        """A chart was asked for, but nothing was called, so the screen still says what happened."""
        self._start(f"{chart}-skipped", "data", "chart_data", service="ClaimTrace", chart=chart).finish(summary=reason)

    def chart_data(self, chart: str, service: str) -> Task:
        """A data service supplying a chart's values, with no model involved."""
        return self._start(f"{chart}-data", "data", "chart_data", service=service, chart=chart)


NO_TASKS = TaskLog()
