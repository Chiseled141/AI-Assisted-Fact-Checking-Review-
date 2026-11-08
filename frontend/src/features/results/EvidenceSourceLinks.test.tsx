import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvidenceSourceLinks } from './EvidenceSourceLinks';
import { makeEvidence } from '../../test/fixtures';

describe('Source articles', () => {
  it('shows dated sources in order and places undated sources last', () => {
    render(
      <EvidenceSourceLinks
        items={[
          makeEvidence({ id: 'b', publisher: 'New News', publishedAt: '2024-03-01', relation: 'contradicting' }),
          makeEvidence({ id: 'a', publisher: 'Old News', publishedAt: '2020-08-04', relation: 'supporting' }),
          makeEvidence({ id: 'c', publisher: 'No Date', publishedAt: undefined }),
        ]}
        freshness={{ a: { status: 'outdated', reason: 'Prices have changed since.' } }}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/Supporting Old News .* Outdated/);
    expect(links[0].querySelector('time')).toHaveAttribute('datetime', '2020-08-04');
    expect(links[0]).toHaveAttribute('title', 'Prices have changed since.');
    expect(links[1]).toHaveAccessibleName(/Contradicting New News/);
    expect(links[1].querySelector('time')).toHaveAttribute('datetime', '2024-03-01');
    expect(links[2]).toHaveAccessibleName(/No Date Unknown date/);
  });

  it('shows a separate source link even when several sources share a date', () => {
    const items = ['VTV', 'VnExpress', 'Nhân Dân', 'VietnamPlus'].map((publisher) =>
      makeEvidence({ id: publisher, publisher, publishedAt: '2021-11-06' }),
    );
    render(<EvidenceSourceLinks items={items} freshness={{}} />);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /VietnamPlus/ })).toBeVisible();
  });
});
