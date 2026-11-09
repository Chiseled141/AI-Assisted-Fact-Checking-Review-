# Read a complete distribution from one source

Return `breakdown: null` unless one of the supplied sources reports a full breakdown of the same population, place and time as the claim. Choose two to eight mutually exclusive categories that cover the entire total. Keep an “Other” category only when the source lists it. Never calculate a missing category or combine sources, periods, or denominators.

- Set `evidence_id` to that source's passage ID. Give the distribution a short, neutral `title` in the claim's language. Include the period or place if the source specifies it.
- Set `unit` to `count` for whole counts or `percent` for reported percentages. For counts, `total` must give the source's explicitly stated total. For percentages, set `total` to null and use only shares that add to exactly 100%.
- For each part, copy the category's `name` and `figure` exactly from the source, including separators and any percent sign. Provide the shortest verbatim `quote` containing both the name and figure, such as a single table row or clause. For the total, give the exact `figure` and a verbatim `quote` identifying it as the total.
- Only use plain numbers, not quantities with multipliers such as “million”. Return null if any category or the total is uncertain.
