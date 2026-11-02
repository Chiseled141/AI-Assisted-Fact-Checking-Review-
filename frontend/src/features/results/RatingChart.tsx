import { lazy, Suspense, useState } from 'react';
import { ratingCriteria, type RatingCriterion, type SourceAnalysis } from '../../types/models';
import { t, translated } from '../../lib/i18n';

const RatingPlot = lazy(() => import('./RatingPlot'));

const chartKinds = ['bars', 'dumbbell', 'radar'] as const;
export type RatingChartKind = (typeof chartKinds)[number];

const chartKindLabel = translated<RatingChartKind>({
  bars: 'Bars',
  dumbbell: 'Dumbbell',
  radar: 'Radar',
});

export const ratingChartHeight: Record<RatingChartKind, number> = { bars: 264, dumbbell: 264, radar: 340 };

export const criterionLabel = translated<RatingCriterion>({
  match: 'Matches the claim',
  directness: 'Direct evidence',
  timing: 'Timing',
  detail: 'Detail',
});

export const criterionHint = translated<RatingCriterion>({
  match: 'How closely the source agrees with the claim. A low score can mean it contradicts the claim.',
  directness: 'Whether the source shows the fact itself, or only background or a plan.',
  timing: 'How close the source is to the time the claim refers to.',
  detail: 'How many concrete facts, figures and dates the source gives.',
});

/** Bar and swatch color for each judge, in the check's judge order: the page's indigo and orange. */
export const judgeColor = ['#4338ca', '#c2410c'];

/**
 * Compares the two judges, criterion by criterion, with the same numbers in a table for screen readers.
 * `showChart` stays false until the panel first opens, so Highcharts only loads for readers who need it.
 */
export function RatingChart({ notes, showChart }: { notes: SourceAnalysis['judgeNotes']; showChart: boolean }) {
  const [kind, setKind] = useState<RatingChartKind>('bars');
  return (
    <div>
      <div role="group" aria-label={t('Chart type')} className="mb-3.5 flex gap-4 border-b border-line text-[13px]">
        {chartKinds.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === kind}
            onClick={() => setKind(option)}
            className={`-mb-px min-h-8 border-b-2 font-medium transition-colors ${
              option === kind ? 'border-indigo-700 text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {chartKindLabel[option]}
          </button>
        ))}
      </div>

      {/* The height matches the chart's, so nothing jumps when it loads. */}
      <div style={{ height: ratingChartHeight[kind] }} aria-hidden="true">
        {showChart && (
          <Suspense fallback={null}>
            <RatingPlot key={kind} kind={kind} notes={notes} />
          </Suspense>
        )}
      </div>

      <table className="sr-only">
        <thead>
          <tr>
            <th scope="col">{t('Criterion')}</th>
            {notes.map(({ judge }) => (
              <th key={judge} scope="col">
                {judge}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ratingCriteria.map((criterion, row) => (
            <tr key={criterion}>
              <th scope="row">{criterionLabel[criterion]}</th>
              {notes.map(({ judge, ratings }) => (
                <td key={judge}>{ratings[row]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
