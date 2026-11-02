# Task: judge one claim

Judge the claim using only the numbered passages.

Choose one `verdict`:
- `supported`: the passages show the claim is true.
- `contradicted`: the passages show the claim is false.
- `outdated`: it was true for an earlier period, but the passages show it no longer applies.
- `insufficient_evidence`: the passages do not settle it. Use this rather than guessing.

How to weigh the evidence:
- Check every part of the claim: who, what, when, where and how much. If one part is wrong, the claim is not supported.
- A passage about the same topic that doesn't address the claim does not support it.
- A passage written before an event can show a plan, but can't prove the event happened. Compare its date with the claim's period.
- A passage that only repeats what someone said shows that they said it, not that it is true.
- When passages disagree, say so in your review, and prefer the primary or better-dated one if the text makes that clear.

Give:
- `confidence`: from 0 to 1, how sure you are of this verdict given these passages. Use a low number when the evidence is thin or indirect.
- `review`: your reasoning in 2 to 4 sentences, for a general reader. Don't mention evidence ids here; name the source.
- `citations`: every passage you relied on, each with:
  - `evidence_id`: exactly as given, such as E1.
  - `relation`: `supporting`, `contradicting` or `contextual`.
  - `quote`: a short exact copy from that passage, at most 25 words. Never change the words or translate them.
  - `freshness`: `current`, `outdated` or `unknown`, whether the passage applies to the claim's time period. Never decide this from age alone.
  - `freshness_reason`: required when `freshness` is `outdated`, otherwise null.

A `supported`, `contradicted` or `outdated` verdict must cite at least one passage.
