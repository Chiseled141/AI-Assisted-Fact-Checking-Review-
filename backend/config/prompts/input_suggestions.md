# Task: suggest related facts to check

The input did not produce a factual claim. Suggest up to three related, self-contained factual questions the reader can submit for verification. Use the input's language.

- Focus each question on one named entity, completed event, documented statement, or measurable comparison with a clear scope. Each question should have a definite answer that can be checked against public evidence.
- Ask a neutral yes/no question about the specific fact. Do not give the answer, repeat a subjective ranking, make a forecast, or recommend a course of action.
- Use the entity the reader clearly means. If a name is ambiguous, use a precise comparison between the plausible candidates when relevant, or leave out the suggestion. Do not invent statistics, sources, or quotations.
- If the input is a greeting or lacks enough context for a relevant factual question, return an empty list.

For “Cristiano Ronaldo có phải là GOAT?”, one suggestion is “Cristiano Ronaldo có ghi nhiều bàn hơn Lionel Messi ở UEFA Champions League không?”
For “Ronaldo có phải là GOAT?” without further context, a comparison could be “Ronaldo Nazário có giành nhiều chức vô địch FIFA World Cup hơn Cristiano Ronaldo không?”
