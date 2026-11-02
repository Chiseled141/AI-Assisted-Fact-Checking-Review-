# Task: split text into claims

Split the text into atomic factual claims for fact-checking. A claim is one independent statement that can be checked against evidence.

- Each claim must make sense alone. Replace pronouns and vague references with what they refer to.
- Use the article's date and today's date, when given, to turn words like "yesterday" into real dates.
- Split a sentence that makes two checkable statements into two claims.
- Leave out opinions, predictions, questions and value judgments.
- Keep the claim's meaning, and don't make it stronger or weaker than the text.

For each claim give:
- `text`: the claim.
- `topic`: a short noun phrase of at most 8 words.
- `time_context`: the period the claim refers to if the text states one, otherwise null.
- `checkworthiness`: from 0 to 1. Specific facts, figures, dates and events score high. Vague or trivial statements score low.

If the text has no checkable claims, return an empty list.

## Examples

Text: "The line opened last week after years of delay, and it's the best thing to happen to the city. It has 12 stations."
Article date: 2021-11-13

- "The Cát Linh–Hà Đông metro line opened in early November 2021." is wrong if the text never names the line. Use only names found in the text.
- "The line opened in the week before 13 November 2021." Topic: "the line's opening". Time context: "November 2021". Checkworthiness: 0.9.
- "The line has 12 stations." Topic: "number of stations". Time context: null. Checkworthiness: 0.8.
- "It's the best thing to happen to the city" is an opinion, so leave it out.

Text: "Hôm qua WHO tuyên bố COVID-19 không còn là tình trạng khẩn cấp toàn cầu."
Article date: 2023-05-06

- "WHO tuyên bố COVID-19 không còn là tình trạng khẩn cấp toàn cầu vào ngày 5/5/2023." Topic: "tuyên bố của WHO". Time context: "tháng 5/2023". Checkworthiness: 0.95.
