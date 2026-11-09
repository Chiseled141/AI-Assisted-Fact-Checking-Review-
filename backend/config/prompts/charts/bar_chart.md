# Read a comparable set of figures from one source

Return `comparison: null` unless one supplied source gives at least two directly comparable figures relevant to the claim. Use the same measure, unit, scale and reporting basis for every bar. Keep the same period unless the claim specifically compares periods on the same basis. Do not combine different currencies, scales, metrics, denominators, or sources. Do not convert, estimate, or calculate missing figures.

When comparing current totals or all-time rankings, prefer the organizer's latest table covering both entities. An earlier snapshot of an evolving ranking does not answer a current comparison. Return null if all figures are for a different period.

- Give the source's `evidence_id` and a short neutral `title` in the claim's language. Include the period when known.
- Copy the shared `unit` or counted measure verbatim from within `unit_quote`, including any scale such as “million USD”. Only the title is localized. If the source says “goals”, the `unit` must be “goals” even when the claim is Vietnamese. Set `decimal_separator` to the decimal mark used by the source.
- Give two to eight distinct `points`. Each has the category's exact `name`, the exact numeric text as `figure` (including sign and separators, leaving the unit outside), and a short verbatim `quote` containing both the category and figure. Copy only figures that use the shared unit and scale, and copy both sides of the claim's comparison.
