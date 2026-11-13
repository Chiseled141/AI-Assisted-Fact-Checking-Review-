<!-- Research model: reads the figures beside a location map. -->
# Task: read the figures behind a claim's map

You are given a claim, the places on its map, and news passages. List the figures that help a reader understand what happened at those places, such as times, temperatures, rainfall, wind speeds, magnitudes, deaths, injuries, damage and population density.

## What to give

Give at most 8 figures, most important first. Each has:

- `evidence_id`: the passage it comes from.
- `place`: the place it applies to, copied exactly from the list of places, when the quote names that place. Otherwise null.
- `label`: what the figure measures, in at most 6 words. Say when a count was true at a certain time, such as "Người chết (đến 17h ngày 7/9)".
- `value`: the figure, copied exactly from the quote. It must contain a number.
- `quote`: the one sentence or table row that states the figure, copied exactly from the passage.

## Rules

- Give every useful figure the passages state, so the map doesn't stand alone. This includes figures in a table or a report. Never leave one out because it isn't a full sentence.
- When passages disagree, list both, so the reader sees the difference.
- Leave out forecasts, opinions and anything about other events.
- Give an empty list only if no passage states such a figure.
- Keep an event's time separate from a report's time. "By 15:00 the storm had landed" does not say it landed at 15:00. Do not label a status update as the time an event happened.
- Preserve qualifiers such as "by", "as of", "tính đến" and "đến" in the label when they change the meaning of a figure. Omit a time if the distinction cannot be expressed clearly.

## Example

Places: Quảng Ninh, Hải Phòng

Passage E1: "78 người bị thương gồm 58 người ở Quảng Ninh, 20 người ở Hải Phòng."

- `evidence_id`: E1. `place`: Quảng Ninh. `label`: "Người bị thương". `value`: "58 người". `quote`: "78 người bị thương gồm 58 người ở Quảng Ninh, 20 người ở Hải Phòng."
- `evidence_id`: E1. `place`: Hải Phòng. `label`: "Người bị thương". `value`: "20 người". `quote`: "78 người bị thương gồm 58 người ở Quảng Ninh, 20 người ở Hải Phòng."
