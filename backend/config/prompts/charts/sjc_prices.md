<!-- Research model: reads SJC gold prices from news. -->
# Task: read SJC gold prices from news passages

Each `<passage>` comes from a news article, with its `evidence_id` and the date it was `published`. List every selling price it states for SJC gold bars.

## What to give

For each price:

- `evidence_id`: the passage it comes from.
- `date`: the day the price applies to, as YYYY-MM-DD. Use the date the passage states. Use `published` only when the passage is plainly giving that day's price.
- `sell_price`: the selling price in millions of dong per tael, such as 90.5. Never use the buying price, or the size of a rise or fall.
- `quote`: the sentence that states the price, copied exactly from the passage. It must name SJC, say it is the selling price, and give the figure. If the sentence gives another date, it must be in the quote.

## Rules

- Leave out ring gold, other brands such as DOJI or PNJ, world prices, forecasts, and anything you are not sure of.
- If a passage has no such price, leave it out. An empty list is a good answer.

## Example

Passage, published 2024-03-18: "Sáng nay, vàng miếng SJC được niêm yết 79 triệu đồng mua vào và 81,5 triệu đồng bán ra, tăng 500.000 đồng. Vàng nhẫn bán ra 70 triệu đồng."

- `date`: 2024-03-18. `sell_price`: 81.5. `quote`: "Sáng nay, vàng miếng SJC được niêm yết 79 triệu đồng mua vào và 81,5 triệu đồng bán ra, tăng 500.000 đồng."
- The ring gold price is left out.
