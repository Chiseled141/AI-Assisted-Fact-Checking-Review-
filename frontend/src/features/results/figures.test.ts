import { describe, expect, it } from 'vitest';
import { parseGridQuote, parseTableQuote } from './figures';

describe('parseTableQuote', () => {
  it('puts a flattened table row back under its year headings', () => {
    expect(parseTableQuote(
      'Recent history and projections 2023 2024 2025e 2026f 2027f 2028f Real GDP growth, at constant market prices 5.0 7.0 8.0 6.3 7.6 7.2',
    )).toEqual({
      lead: 'Recent history and projections',
      columns: ['2023', '2024', '2025e', '2026f', '2027f', '2028f'],
      rows: [{ label: 'Real GDP growth, at constant market prices', values: ['5.0', '7.0', '8.0', '6.3', '7.6', '7.2'] }],
    });
  });

  it('reads several rows, with empty cells and negatives', () => {
    expect(parseTableQuote('2021 2022 2023 Inflation 1.8 3.2 3.3 Fiscal balance (% of GDP) -3.4 n/a 0.3')?.rows).toEqual([
      { label: 'Inflation', values: ['1.8', '3.2', '3.3'] },
      { label: 'Fiscal balance (% of GDP)', values: ['-3.4', 'n/a', '0.3'] },
    ]);
  });

  it.each([
    'GDP grew 5.0% in 2023, 7.0% in 2024 and 8.0% in 2025.',
    'Between 2021 2022 2023 the economy recovered.',
    '2023 2024 2025 Real GDP growth 5.0 7.0',
    '2023 2024 2025 Real GDP growth 5.0 7.0 8.0 6.3',
  ])('leaves prose and misaligned rows alone: %s', (text) => {
    expect(parseTableQuote(text)).toBeNull();
  });
});

describe('parseGridQuote', () => {
  const headings = '| Rank | Movie | Worldwide Box Office | Domestic Share |';

  it('reads a heading row and the rows under it, even when two rows share a line', () => {
    expect(parseGridQuote(`${headings}\n| 1 | Spider-Man: Brand New Day | $2,521,214,671 | 38.0% | | 2 | The Odyssey | $1,801,793,893 | 38.9% |`)).toEqual({
      columns: ['Rank', 'Movie', 'Worldwide Box Office', 'Domestic Share'],
      rows: [
        ['1', 'Spider-Man: Brand New Day', '$2,521,214,671', '38.0%'],
        ['2', 'The Odyssey', '$1,801,793,893', '38.9%'],
      ],
    });
  });

  it('shows a row without headings as cells', () => {
    expect(parseGridQuote('| 1 | Spider-Man: Brand New Day | $2,521,214,671 | 38.0% |')).toEqual({
      columns: null, rows: [['1', 'Spider-Man: Brand New Day', '$2,521,214,671', '38.0%']],
    });
  });

  it.each([
    'The film earned $2,521,214,671 worldwide.',
    'Choose a | b',
    `${headings}\n| 1 | Spider-Man |`,
    `${headings}\nSource: The Numbers`,
  ])('leaves other text alone: %s', (text) => {
    expect(parseGridQuote(text)).toBeNull();
  });
});
