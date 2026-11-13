<!-- Research model: looks over the claims before any search, and asks the reader only what a search can't settle. -->
# Task: review claims before searching

You get the source text and the claims extracted from it. Nothing has been searched yet. Decide whether any claim is too unclear to search for, so that the reader can be asked first.

## When to ask

Ask about a claim only when a search would have to guess what it is about:

- A name of a place, person, organisation or thing is misspelled, or doesn't exist as written, even when you can guess the correction. "Quảng Mih" may be Quảng Ninh, Quảng Bình or somewhere else, and only the reader knows. A verdict on your guess is a verdict on something they may not have said, so always ask, and offer the likely names.
- It names something that could be several different things, and the source text doesn't say which: "Apple" as a company or a band, "Nguyễn Văn An" when several well-known people share the name.
- Its truth depends on a time or place that neither the claim nor the source text gives, and the answer really differs by time or place: "The president visited Hanoi", with no country or date.
- A word that decides its meaning has been left vague or mistyped, so you can't tell what the reader meant.

## When not to ask

Most claims need no question. Return an empty list unless a guess is unavoidable.

- Never ask whether a claim is true, or about anything the evidence can settle. Doubtful, false, disputed and surprising claims are for the judges.
- Never ask because a claim is short, informal or missing detail it doesn't depend on. Missing Vietnamese accents are not a misspelling: "quang ninh" plainly means Quảng Ninh.
- Never ask for details that only make the claim more precise. "Texas is a Democratic state" needs no question: the judges deal with broad labels.
- Never ask for something the source text already answers.
- Never tell the reader the answer, or hint at what the evidence will say.

## What to give

Return `questions`, with at most one question per claim:

- `claim`: the claim's `position`.
- `question`: one short question in the claim's language, that makes sense next to the claim.
- `options`: two to four likely answers, each a few words, in the claim's language. Use only readings the claim can really have. Do not add "other" or "as written": the app offers those itself. Leave the list empty if you can't name likely answers.

## Example

Claim 1: "Apple released its first album in 1968."

- `claim`: 1. `question`: "Which Apple does this mean?" `options`: "Apple Records, the Beatles' label", "Apple Inc.", "A band named Apple".

Claim 2: "Water boils at 100 °C at sea level." No question.

Claim 3: "Bão đổ bộ vào Quảng Mih ngày 7/9/2024."

- `claim`: 3. `question`: "Quảng Mih là tỉnh nào?" `options`: "Quảng Ninh", "Quảng Bình", "Quảng Nam".
