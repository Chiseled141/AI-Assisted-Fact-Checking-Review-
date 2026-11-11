# Read a distribution from one source

Prefer a full breakdown of the same population, place and time as the claim. Choose two to eight mutually exclusive categories that cover the entire total. Keep an “Other” category only when the source lists it. Never combine sources, periods or denominators.

If the source lists both counts and percentages, use the set that adds up to its stated total. For percentages, you may omit categories reported as 0% at the source's precision when the remaining reported shares add to 100%. Use the published shares as written.

If the claim is about a single category's share of a whole and one source explicitly gives that share for the same population, place and time, you may return that one category in percent with `remainder: true`. The quote should identify the whole as well as the category and its figure. ClaimTrace computes and labels the unbroken remainder. Do not calculate it or use this option for growth rates, comparisons across denominators, or partial breakdowns of several named groups. Otherwise return `breakdown: null` if the full distribution is unavailable.

- Set `evidence_id` to that source's passage ID. Give the distribution a short, neutral `title` in the claim's language. Include the period or place if the source specifies it.
- Set `unit` to `count` for whole counts or `percent` for reported percentages. For counts, `total` must give the source's explicitly stated total. For percentages, set `total` to null. When `remainder` is false, the shares must add to exactly 100%.
- For each part, copy the category's `name` and `figure` exactly from the source, including separators and any percent sign. Provide the shortest verbatim `quote` containing both the name and figure, such as a single table row or clause. For the total, give the exact `figure` and a verbatim `quote` identifying it as the total.
- Only use plain numbers, not quantities with multipliers such as “million”. Return null if any category or the total is uncertain.
