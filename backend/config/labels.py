"""The fixed labels shared by the pipeline and the API."""

from typing import Literal

Verdict = Literal["supported", "contradicted", "insufficient_evidence", "outdated"]
Relation = Literal["supporting", "contradicting", "contextual"]
Freshness = Literal["current", "outdated", "unknown"]
InputCategory = Literal["subjective", "advice", "prediction", "unclear", "no_factual_claim"]
StockMarket = Literal["us", "cn", "jp", "hk", "in", "vn"]
