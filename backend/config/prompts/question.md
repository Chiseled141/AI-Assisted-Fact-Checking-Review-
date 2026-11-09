<!-- Research model: turns a short question into a claim to check. -->
# Task: turn a question into a claim to check

The extraction step found no factual claim in this input, because it may be a question. If it asks whether something is true, write the claim it is asking about, so that the claim can be checked against evidence.

## Rules

- Write the claim the question asks about as one neutral statement, in the input's language. "Does X cause Y?" becomes "X causes Y."
- You are not saying the claim is true. Other models judge it. Do not soften it, answer it or add a conclusion.
- Do not add a place, date, figure or name the input does not give.
- Resolve relative dates such as "yesterday" or "hôm qua" using the supplied current date. Use the resulting calendar date in the claim, its search queries, and `time_context`.
- If the input asks several things, write one claim for each, at most 3.
- Return an empty list if it is not asking whether something is true: an opinion, a request for advice, a "how" or "why" with no factual assertion in it, or text with no clear meaning.

## What to give

Return `claims` and `input_category`. When no factual claim can be written, classify the input as `subjective` (opinion or ranking without a measurable criterion), `advice` (request for recommendations), `prediction` (unsettled future outcome), `unclear` (meaning or subject needs clarification), or `no_factual_claim` (no factual assertion). A question such as "Ronaldo có phải là GOAT?" is `subjective`: do not invent a measurable criterion or claim Ronaldo is the best. Do not mistake a disputed or false factual claim for an opinion. Return null if unsure, or whenever claims are present. These categories explain why no verification ran; they are not verdicts.

For each claim:

- `text`: the claim.
- `person_name`: the complete person's name or public handle as supplied in the input, when the question concerns one named person; otherwise null. Do not invent an identity or alias.
- `search_query`: one short, neutral web search query for evidence that could support or contradict the claim.
- `search_query_en`: the same query in English, keeping every name, date and figure.
- `topic`: a short noun phrase of at most 8 words.
- `time_context`: the period the input states, otherwise null.
- `event_date`: YYYY-MM-DD for a completed or purportedly completed one-off event whose exact day is supplied or resolvable, such as yesterday's match. Leave null for prices, ongoing totals, as-of dates, whole seasons, forecasts and unspecified days.
- `match_result`: `sport` or `esport` for the result or score of one completed head-to-head match; otherwise null.
- `checkworthiness`: from 0 to 1, only used to rank claims.

## Example

Input: "hay ngứa buổi sáng có bị sỏi thận không"

- `text`: "Ngứa vào buổi sáng là dấu hiệu của sỏi thận." `search_query`: "ngứa da triệu chứng sỏi thận". `topic`: "ngứa và sỏi thận". `time_context`: null. `checkworthiness`: 0.7.

Input: "should I drink more water?" gives an empty list, because it asks for advice.
