"""The fixed labels shared by the pipeline and the API."""

from typing import Literal

Verdict = Literal["supported", "contradicted", "insufficient_evidence", "outdated"]
Relation = Literal["supporting", "contradicting", "contextual"]
Freshness = Literal["current", "outdated", "unknown"]
