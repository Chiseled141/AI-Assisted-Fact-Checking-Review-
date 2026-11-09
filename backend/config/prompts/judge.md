<!-- Judge models: give one claim its verdict from the sources. -->
# Task: judge one claim

Judge the claim using only the numbered passages and any supplied data. Review every source for its relevance to the claim's subject, scope and period.

## Verdict

Choose one `verdict`:

- `supported`: the passages show the claim is true.
- `contradicted`: the passages show the claim is false.
- `outdated`: it was true for an earlier period, but the passages show it no longer applies.
- `insufficient_evidence`: the passages do not settle it. Use this rather than guessing, but never as a safe default.

## Be decisive when the sources settle it

- When reliable, dated passages address the claim's subject, scope and period, give `supported` or `contradicted`. Reliable means an official body, or an established outlet reporting directly rather than repeating what someone said. Do not fall back to `insufficient_evidence` because no passage repeats the claim word for word, or because another source might exist.
- A claim about a period still in progress, such as "this month" or "this year", is about the part that has passed up to the latest passage date. Judge that part, and say in the review that the period is not over. If the passages show the opposite during that part, such as a price rising when the claim says it fell sharply, use `contradicted`. If they show it clearly happening, use `supported`.
- Use `insufficient_evidence` only when the passages miss a material part of the claim, conflict with no clearly better source, or cover a different period, place or subject.
- A historical snapshot can settle a claim about that period. For an undated claim about a changing total, use the latest applicable official figures; mark earlier snapshots as context when they cannot establish the current total.

## Completed match results

- A `<match_result>` block summarizes the final score verified against its numbered passage. If the teams, competition and date match the claim, use that score for a claim about the outcome. Cite the verbatim score from the numbered passage. Compare a stated score in the same team order, and keep the final match score separate from a penalty shootout or series aggregate.
- A result from a different match or a preview is context only. For a claim that specifies a date or stage, use evidence that establishes that match.

## How to weigh the evidence

- Check every material part of the claim: who, what, when, where and how much, using its ordinary meaning in context. A material falsehood prevents support; an omitted qualification is not automatically a falsehood.
- For an informal statement of a penalty, fee or other variable amount, a stated upper endpoint can be shorthand for the maximum. If the passages establish the same subject, scope and period, and the claim does not explicitly assert a fixed or universal amount, use `supported` with the full range and the maximum-versus-fixed distinction clearly stated in the review. For example, a claim saying a fine "is 20 million" can be supported with a qualification when the passages say "18–20 million". A claim saying "everyone pays exactly 20 million" is contradicted by that range. Do not apply this rule merely because an arbitrary number falls somewhere inside a range, or to exact counts, measurements, market prices or explicit minimums, maximums and thresholds.
- Distinguish a rule applying on a date from a rule first taking effect on that date. Evidence that it took effect earlier can support its application later only when the passages establish that it still applies then. If the claim explicitly states the effective date or date of a change, verify that date as stated. If the intended meaning remains ambiguous and affects the verdict, use `insufficient_evidence` and explain the ambiguity.
- A passage about the same topic that doesn't address the claim does not support it.
- For claims about named people, verify the same identity and the specific assertion. Namesakes and general topic pages are not evidence about the person. For sensitive personal traits such as sexual orientation or religion, require explicit public self-disclosure or reliable direct reporting of that disclosure; never infer them from appearance, behaviour, relationships, stereotypes or population studies. A lack of public disclosure does not establish the opposite trait. If identity or appropriate evidence is missing, use `insufficient_evidence` and explain the gap without speculating.
- A passage written before an event can show a plan, but can't prove the event happened. Compare its date with the claim's period.
- A passage that only repeats what someone said shows that they said it, not that it is true.
- Compare explicitly reported counts, scores or prices directly when their units, scope and dates match. When units differ, convert to compare them and give both figures in your review. Do not infer missing figures.
- When passages disagree, say so in your review, and prefer the primary or better-dated one if the text makes that clear.

## Price data

- A claim about a price may come with a `<data>` block of dated prices, from market data or from SJC prices verified in the news. Treat it as reliable, dated evidence of how that price moved, and cite it with its `evidence_id`, such as D1, like a passage. Quote one relevant line exactly.
- Compare the prices on the days that match the claim's period, and give the figures and dates in your review. Say whether a move is sharp from the size of the change, such as a few percent in days for gold, and state the percentage.
- A closing price settles a claim about that close. A close below an intraday threshold or a missing trading day does not disprove an intraday move. Do not infer today's price from an older observation, and keep buy, sell, market, intraday and closing quotes separate.
- The data measures one price, named in its first line. World gold in USD and SJC gold in VND can move differently. If the claim names a different price than the data, say so, and use the data only as context unless the passages bridge the gap. A claim about "giá vàng" with no other detail can be judged on either one.

## What to give

- `confidence`: from 0 to 1, how sure you are of this verdict given these passages. Use a low number when the evidence is thin or indirect.
- `review`: your reasoning in 2 to 4 sentences, for a general reader. Don't mention evidence ids here; name the source.
- `review_en`: the same review in English, saying exactly the same thing. Keep names, figures and dates as they are.
- `review_vi`: the same review in Vietnamese, saying exactly the same thing. Keep names, figures and dates as they are.
- `citations`: exactly one entry for every numbered web source, even when it is irrelevant, outdated or inconclusive. Mark sources that do not establish either side as `contextual` and quote the part that shows their topic or period. Include the `<data>` block if you relied on it. A decisive verdict must have a citation that supports that verdict for the claim's period. Each citation has:
  - `evidence_id`: exactly as given, such as E1.
  - `relation`: `supporting`, `contradicting` or `contextual`.
  - `quote`: a short exact, contiguous copy from the supplied text for that id, at most 25 words. Never change the words, use ellipses or translate them. An exact table row is useful when it gives the figure.
  - `quote_en`: an English translation of the quote, or null if the quote is already in English. Keep every figure.
  - `quote_vi`: a Vietnamese translation of the quote, or null if the quote is already in Vietnamese. Keep every figure.
  - `freshness`: `current`, `outdated` or `unknown`, whether the passage applies to the claim's time period. Never decide this from age alone.
  - `freshness_reason`: required when `freshness` is `outdated`, otherwise null.
