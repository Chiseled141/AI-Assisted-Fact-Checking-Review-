import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HighlightedText, highlightMarks } from './HighlightedText';

const marked = (text: string) => highlightMarks(text).map(({ start, end }) => text.slice(start, end));

describe('Highlighting names and figures', () => {
  it('picks them out of a Vietnamese review', () => {
    const text = 'Các đoạn văn cho biết BC Partners Credit đã đưa ra cam kết ban đầu lên tới US$300 million cho LIV Golf trước mùa giải 2027. Financial Times đã đưa tin.';
    expect(marked(text)).toEqual(['BC Partners Credit', 'US$300 million', 'LIV Golf', '2027', 'Financial Times']);
  });

  it('picks out figures, dates and units in English', () => {
    expect(marked('The final count on 5 December 2024 gave 220 seats, or 50.6%, in March 2025.')).toEqual(['5 December 2024', '220 seats', '50.6%', 'March 2025']);
    expect(marked('Tuyến mở ngày 6/11/2021, chở 12 triệu khách.')).toEqual(['6/11/2021', '12 triệu']);
  });

  it('stops a figure at punctuation and doesn\'t mistake a word for a unit', () => {
    expect(marked('Trước mùa giải 2027, đồng thời mô tả thêm.')).toEqual(['2027']);
    expect(marked('Có 500 đồng thời gian.')).toEqual(['500']);
    expect(marked('Giá 500 đồng, tăng 12%.')).toEqual(['500 đồng', '12%']);
  });

  it('skips a single capital that only opens a sentence, but keeps a name after a lead word', () => {
    expect(marked('Sources disagree here.')).toEqual([]);
    expect(marked('The Guardian reports it.')).toEqual(['Guardian']);
    expect(marked('Theo BBC, điều này đúng.')).toEqual(['BBC']);
    expect(marked('He spoke to Donald Trump.')).toEqual(['Donald Trump']);
  });

  it('never changes the words', () => {
    const text = 'Theo BBC, US$300 million đã được Financial Times nêu vào 5 December 2024.';
    const { container } = render(<HighlightedText text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelectorAll('strong').length).toBeGreaterThan(2);
  });

  it('shows plain text as it is', () => {
    const { container } = render(<HighlightedText text="không có gì nổi bật ở đây" />);
    expect(container.querySelectorAll('strong')).toHaveLength(0);
    expect(container.textContent).toBe('không có gì nổi bật ở đây');
  });
});
