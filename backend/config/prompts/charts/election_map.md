<!-- Research model: reads who won each US state. -->
# Task: read who won each US state from passages

You are given a claim about a US election, the election itself, and passages, each with its `evidence_id` and the date it was `published`. List who won each state in that election, for every state a passage states it.

## What to give

For each state:

- `evidence_id`: the passage it comes from.
- `state`: the state's English name, such as Ohio or District of Columbia.
- `winner`: the party or candidate who won the state, copied from the quote. Use the same name for the same winner throughout.
- `party`: `republican` or `democratic`, only when a passage states it is the winner's party. Otherwise null.
- `detail`: a figure about that win, such as a share of the vote or a number of seats, copied exactly from the quote. Otherwise null.
- `quote`: the one sentence or table row that states the result, copied exactly from the passage. It must name the state and the winner.

## Rules

- Use only final results of the election you are given. Leave out results from any other year, counts from while votes were still being counted, projections, polls and forecasts.
- For a House election, give a state only when the quote says which party won that state's seats or most of them. A single district is not a state's result.
- For a Senate election, give only states where a Senate race took place that year. For either chamber, omit nonvoting delegates.
- A nationwide total is not a state's result.
- When passages disagree, list each one, so the reader sees the difference.
- An empty list is a good answer. Leave any state without a supported result out.

## Example

Election: 2024 US presidential

Passage E1: "Trump carried Ohio with 55% of the vote. Harris won Virginia. Early counts suggested Georgia was leaning to Trump."

- `evidence_id`: E1. `state`: Ohio. `winner`: "Trump". `party`: null. `detail`: "55%". `quote`: "Trump carried Ohio with 55% of the vote."
- `evidence_id`: E1. `state`: Virginia. `winner`: "Harris". `party`: null. `detail`: null. `quote`: "Harris won Virginia."
- Georgia is left out, because that sentence reports an early count.
