// A quote copied from a table, put back into its columns by code, never by a model.

export interface TableQuote {
  /** Words before the column headings, usually the table's title. */
  lead: string;
  columns: string[];
  rows: { label: string; values: string[] }[];
}

const YEAR_HEADING = /^(?:FY)?\d{4}(?:[/–-]\d{2,4})?[a-z]?$/i;
const CELL = /^[-−–+]?\(?\d[\d.,]*\)?%?$|^(?:n\/?a|[-–—.]{1,2})$/i;

/**
 * A quote copied from a table arrives as one line: year headings, then a row's label and its values.
 * This puts the values back under their years. Null unless every row has exactly one value per heading,
 * so prose that happens to list years is never drawn as a table.
 */
export function parseTableQuote(text: string): TableQuote | null {
  const tokens = text.trim().split(/\s+/);
  const start = tokens.findIndex((_, index) =>
    [0, 1, 2].every((offset) => YEAR_HEADING.test(tokens[index + offset] ?? '')));
  if (start < 0) return null;
  let end = start;
  while (end < tokens.length && YEAR_HEADING.test(tokens[end])) end += 1;
  const columns = tokens.slice(start, end);

  const rows: TableQuote['rows'] = [];
  let position = end;
  while (position < tokens.length) {
    const label: string[] = [];
    const rowEnds = (at: number) =>
      tokens.slice(at, at + columns.length).length === columns.length &&
      tokens.slice(at, at + columns.length).every((token) => CELL.test(token)) &&
      !CELL.test(tokens[at + columns.length] ?? '');
    while (position < tokens.length && !rowEnds(position)) {
      label.push(tokens[position]);
      position += 1;
    }
    // A number left on the end of a label means the row has more values than there are headings.
    if (position >= tokens.length || !label.some((word) => /\p{L}{2}/u.test(word)) || CELL.test(label[label.length - 1])) return null;
    rows.push({ label: label.join(' '), values: tokens.slice(position, position + columns.length) });
    position += columns.length;
  }
  return rows.length > 0 ? { lead: tokens.slice(0, start).join(' '), columns, rows } : null;
}

export interface GridQuote {
  /** Column headings, when the quote carries them. The backend puts them back from the saved page. */
  columns: string[] | null;
  rows: string[][];
}

function pipeCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (trimmed.length < 5 || !trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
}

/**
 * A quote copied from a Markdown table: "| Rank | Movie |" on the first line, then "| 1 | Film |" rows.
 * A line can hold several rows, each split from the next by an empty cell, because passages join lines.
 * Null for anything that is not wholly table rows.
 */
export function parseGridQuote(text: string): GridQuote | null {
  const lines = text.trim().split(/\n+/).map(pipeCells);
  if (lines.length === 0 || lines.some((cells) => !cells)) return null;
  const [first, ...rest] = lines as string[][];
  if (rest.length === 0) return first.length >= 3 ? { columns: null, rows: [first] } : null;

  const width = first.length;
  const rows: string[][] = [];
  for (const cells of rest) {
    if ((cells.length + 1) % (width + 1) !== 0) return null;
    for (let start = 0; start < cells.length; start += width + 1) {
      if (start > 0 && cells[start - 1] !== '') return null;
      rows.push(cells.slice(start, start + width));
    }
  }
  return { columns: first, rows };
}
