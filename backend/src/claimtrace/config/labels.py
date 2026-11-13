"""The fixed labels shared by the pipeline and the API."""

from typing import Literal

Verdict = Literal["supported", "contradicted", "insufficient_evidence", "outdated"]
Relation = Literal["supporting", "contradicting", "contextual"]
Freshness = Literal["current", "outdated", "unknown"]
InputCategory = Literal[
    "subjective", "advice", "prediction", "unclear", "no_factual_claim", "prompt_injection", "spam", "out_of_scope",
]
DECLINED_INPUT_CATEGORIES = frozenset({"prompt_injection", "spam", "out_of_scope"})
StockMarket = Literal["us", "cn", "jp", "hk", "in", "vn"]
