import { Fragment } from 'react';

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const UNITS = 'million|billion|trillion|triệu|tỷ|nghìn|ngàn|percent|seats?|ghế|USD|VND|đồng|km|kph|mph|°C|°F';
const FIGURE = new RegExp(
  // A date first, so its parts stay together.
  `(?:\\d{1,2}\\s+(?:${MONTHS})(?:\\s+\\d{4})?|(?:${MONTHS})\\s+\\d{4}|tháng\\s+\\d{1,2}(?:\\/\\d{4})?)` +
    `|(?:US\\$|\\$|€|£)?\\d(?:[\\d.,/]*\\d)?(?:\\s?%|\\s(?:${UNITS})(?![\\p{L}]|\\s+thời))?`,
  'gu',
);
const NAME = /\p{Lu}[\p{L}\p{N}&'’.-]*(?:\s+\p{Lu}[\p{L}\p{N}&'’.-]*)*/gu;
// Capitals that only start a sentence, so they aren't part of the name after them.
const LEADING = /^(?:The|A|An|This|That|These|Those|However|According|In|On|At|Theo|Các|Những|Nhưng|Tuy|Vì|Do|Tại|Ở|Trong|Đoạn|Nguồn)\s+/u;

interface Mark {
  start: number;
  end: number;
}

function startsSentence(text: string, index: number): boolean {
  return /(?:^|[.!?:]\s+)$/.test(text.slice(0, index));
}

/** Where a text states a figure, a date or a name, worked out by code, so a model can't change what stands out. */
export function highlightMarks(text: string): Mark[] {
  const marks: Mark[] = [];
  for (const match of text.matchAll(FIGURE)) {
    if (/\d/.test(match[0])) marks.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(NAME)) {
    let { index: start } = match;
    let name = match[0];
    const atStart = startsSentence(text, start);
    const lead = LEADING.exec(name);
    if (lead) {
      start += lead[0].length;
      name = name.slice(lead[0].length);
    } else if (atStart && !/\s/.test(name)) {
      continue; // One capitalized word opening a sentence is usually just that.
    }
    name = name.replace(/[.'’-]+$/, '');
    if (name.length > 1) marks.push({ start, end: start + name.length });
  }
  // A figure inside a name or the other way round is one highlight, and the first one found stands.
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  return marks.filter((mark, index) => marks.slice(0, index).every((other) => mark.start >= other.end));
}

/** Reasoning with its names and figures picked out, so a reader can scan it. The words themselves don't change. */
export function HighlightedText({ text }: { text: string }) {
  const parts = [];
  let position = 0;
  for (const { start, end } of highlightMarks(text)) {
    parts.push(<Fragment key={`t${start}`}>{text.slice(position, start)}</Fragment>);
    parts.push(
      <strong key={`m${start}`} className="font-semibold text-ink">
        {text.slice(start, end)}
      </strong>,
    );
    position = end;
  }
  parts.push(<Fragment key="end">{text.slice(position)}</Fragment>);
  return <>{parts}</>;
}
