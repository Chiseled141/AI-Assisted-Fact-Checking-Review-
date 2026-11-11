<!-- Read the result of the match from the claim's evidence. -->
# Task: read one completed match result

Read the final result of the same match or esports series that the claim refers to. The score may contradict the claim. Check the opponents, competition, edition and stage or date. Return `match: null` if no single source confirms the result, if the game is still in progress, or if the sources conflict about which match or score applies. Ignore previews, scheduled matches, odds, predictions, aggregate scores and unrelated head-to-head history.

- `evidence_id`: the source that supplies the result and any details you include.
- `teams`: the two opponent names verbatim from the score passage, in the order the score is given. Copy the names from the same occurrence of the matchup as the score.
- `scores`: two nonnegative integers in that order. For esports this is the series score. For sports use the final match score, including overtime when played, before any separate shootout.
- `quote`: one verbatim passage containing both opponent names, the score and words that establish that it was final, such as “beat”, “full time” or “match over”. Copy the score as printed even when it is split across lines. Keep the passage limited to the main result.
- `competition`, `stage` and `date_label`: short labels copied verbatim from the same source for this match, or null. Use the full match date as printed, including the year. Never use an article's publication date as the match date unless the source identifies it as such.
- `shootout`: only for a sport with a separately stated shootout score. Use `scores` in the same team order and an exact `quote` that labels the score as a shootout. Otherwise null.
- `maps`: for esports, played maps or games in order, with `name`, `scores` and exact `quote` showing that map's name and its score in the same team order. Leave out unplayed maps, aggregate series results and scores whose order is unclear.
- `moments`: for sports, key events whose minute is stated in the source, such as goals or red cards. Include `minute` without the apostrophe (for example `45+2`), a short verbatim `label` such as the scorer's name or event description, and an exact `quote` containing the label and minute. Include events only for this match.
