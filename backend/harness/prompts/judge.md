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

- When reliable evidence addresses the claim's subject, scope and period, give `supported` or `contradicted`. Prefer an official body, an established data publisher's own table, or an established outlet reporting directly. Do not fall back to `insufficient_evidence` because no passage repeats the claim word for word, or because another source might exist.
- Read an ordinary present-tense claim about an ongoing period as a claim about that period so far. This includes a named calendar year that contains the supplied current date. Require a final result only when the claim expressly says the result is final or refers to the end of the period.
- Judge an ongoing ranking or total using the newest applicable table or dated observation with the same scope. Give `supported` or `contradicted` when it settles the claim at that cutoff, and state the cutoff in the review. A later report about a narrower metric, such as a weekend box-office chart, does not update a year-to-date ranking. If the only applicable evidence is a dated snapshot and the claim gives no exact as-of date, limit the verdict to that snapshot. If the claim explicitly requires a newer date, use `insufficient_evidence` when the passages cannot establish the result then.
- Use `insufficient_evidence` only when the passages miss a material part of the claim, conflict with no clearly better source, or cover a different period, place or subject.
- A historical snapshot can settle a claim about its own period. For a completed period, a snapshot from before the period ended does not settle its final ranking or total. For an undated claim about a current value, mark older observations as context when they cannot establish that value.
- For statistics, use the observation period or reference date, which can differ from the publication or update date. Compare the same definition, unit, population and coverage. State the latest verified period, and identify a preliminary figure, estimate, or projection as such. For a certified record, use the exact category and ratifying body. A dated entry establishes the record reported there, and a newer attempt establishes a change only if the required ratification is shown.
- For a car or product price, match the seller or manufacturer, market, currency, configuration and period. A live store price may differ from a launch price or a promotion. A starting price, monthly installment or estimated on-road cost settles only that price type. Keep a published range or qualifying conditions visible in the review.
- If a publisher's live table gives no observation date, describe it as the table consulted on the `retrieved` date. For a fixed snapshot, the retrieval date never extends its coverage. Set the cutoff using evidence for the same metric and scope, even when an unrelated article is newer.

## Completed match results

- A `<match_result>` block summarizes the final score verified against its numbered passage. If the teams, competition and date match the claim, use that score for a claim about the outcome. Cite the verbatim score from the numbered passage. Compare a stated score in the same team order, and keep the final match score separate from a penalty shootout or series aggregate.
- A result from a different match or a preview is context only. For a claim that specifies a date or stage, use evidence that establishes that match.

## How to weigh the evidence

- Check every material part of the claim: who, what, when, where and how much, using its ordinary meaning in context. A material falsehood prevents support; an omitted qualification is not automatically a falsehood.
- For an informal statement of a penalty, fee or other variable amount, a stated upper endpoint can be shorthand for the maximum. If the passages establish the same subject, scope and period, and the claim does not explicitly assert a fixed or universal amount, use `supported` with the full range and the maximum-versus-fixed distinction clearly stated in the review. For example, a claim saying a fine "is 20 million" can be supported with a qualification when the passages say "18–20 million". A claim saying "everyone pays exactly 20 million" is contradicted by that range. Do not apply this rule merely because an arbitrary number falls somewhere inside a range, or to exact counts, measurements, market prices or explicit minimums, maximums and thresholds.
- Distinguish a rule applying on a date from a rule first taking effect on that date. Evidence that it took effect earlier can support its application later only when the passages establish that it still applies then. If the claim explicitly states the effective date or date of a change, verify that date as stated. If the intended meaning remains ambiguous and affects the verdict, use `insufficient_evidence` and explain the ambiguity.
- A passage about the same topic that doesn't address the claim does not support it.
- For claims about named people, verify the same identity and the specific assertion. Namesakes and general topic pages are not evidence about the person. For sensitive personal traits such as sexual orientation or religion, require explicit public self-disclosure or reliable direct reporting of that disclosure; never infer them from appearance, behaviour, relationships, stereotypes or population studies. A lack of public disclosure does not establish the opposite trait. If identity or appropriate evidence is missing, use `insufficient_evidence` and explain the gap without speculating.
- For a public figure's city of residence, use explicit self-disclosure or credible reporting that places their home in that city. A workplace, hometown, filming location or visit provides context. State the date of the latest relevant report. If the claim is about their current residence and the evidence establishes only a past residence, use `insufficient_evidence` and report the date it does establish. Keep the review at city level.
- A verified first-party X post from a registered account can establish what that person or organization published. Check that the author, wording and date match the attributed statement. Treat claims made inside the post as that author's statements.
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
  - `quote`: a short exact, contiguous copy from the supplied text for that id, at most 25 words. Never change the words, use ellipses or translate them. An exact table row is useful when it gives the figure. When the line of column headings (years or periods) sits right before that row, start the quote at the headings, so every figure keeps its period.
  - `quote_en`: an English translation of the quote, or null if the quote is already in English. Keep every figure.
  - `quote_vi`: a Vietnamese translation of the quote, or null if the quote is already in Vietnamese. Keep every figure.
  - `freshness`: `current`, `outdated` or `unknown`, whether the passage applies to the claim's time period. Never decide this from age alone.
  - `freshness_reason`: required when `freshness` is `outdated`, otherwise null.
