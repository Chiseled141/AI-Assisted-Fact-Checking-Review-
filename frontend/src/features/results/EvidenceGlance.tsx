import type { CSSProperties, ReactNode } from 'react';
import { config } from '../../config';
import type { AssessmentRevision, EvidenceRelation, EvidenceSnapshot, JudgeVerdict, SourceTrust, Verdict } from '../../types/models';
import { relationLabel, verdictLabel } from '../../lib/format';
import { findSource } from '../../lib/sources';
import { t } from '../../lib/i18n';

const relationOrder: EvidenceRelation[] = ['supporting', 'contradicting', 'contextual'];
const relationFill: Record<EvidenceRelation, string> = {
  supporting: 'bg-emerald-700',
  contextual: 'bg-ink-faint/45',
  contradicting: 'bg-rose-600',
};

type Rating = SourceTrust | 'unrated';
const ratingOrder: Rating[] = ['green', 'yellow', 'red', 'unrated'];
const ratingLabel: Record<Rating, string> = { green: 'Reliable', yellow: 'Mixed', red: 'Unreliable', unrated: 'Unrated' };

const verdictFill: Record<Verdict, string> = {
  supported: 'bg-emerald-700',
  contradicted: 'bg-rose-600',
  insufficient_evidence: 'bg-amber-700',
  outdated: 'bg-slate-600',
};
const verdictText: Record<Verdict, string> = {
  supported: 'text-emerald-700',
  contradicted: 'text-rose-600',
  insufficient_evidence: 'text-amber-700',
  outdated: 'text-slate-600',
};

const headline = 'text-[30px] font-medium leading-none tracking-[-0.03em] tabular-nums';
const caption = 'mt-3 text-[13px] leading-snug text-ink-soft';
const note = 'text-xs text-ink-muted';

/** One fact about the evidence: a small label, one large reading, and a line or two under it. Columns are split by hairlines. */
function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-line pt-8 first:border-t-0 first:pt-0 sm:border-t-0 sm:pt-0 lg:border-l lg:pl-12 lg:first:border-l-0 lg:first:pl-0">
      <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">{title}</h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

// How far each verdict moves the score from the middle of the scale, at full confidence.
const verdictPull: Record<Verdict, number> = { supported: 50, contradicted: -50, outdated: -25, insufficient_evidence: 0 };
// A source counts for as much as the source list trusts it.
const ratingWeight: Record<Rating, number> = { green: 1, yellow: 0.6, unrated: 0.4, red: 0.1 };
const MODEL_SHARE = 0.6;

/**
 * 0 to 100: how well the saved check backs the claim. 50 is undecided, higher means more likely accurate.
 * Three fifths come from the verdicts, each weighted by the model's own confidence (a human correction counts
 * as fully confident). Two fifths come from the sources: supporting minus contradicting, weighted by rating,
 * over all sources. It is arithmetic on what the check saved, so no model is asked for a score.
 */
export function accuracyScore(revision: AssessmentRevision, items: EvidenceSnapshot[]): number {
  const verdicts = revision.judges?.length ? revision.judges : [{ verdict: revision.verdict, confidence: 1 }];
  const models = verdicts.reduce((sum, { verdict, confidence }) => sum + 50 + verdictPull[verdict] * confidence, 0) / verdicts.length;
  const weight = (item: EvidenceSnapshot) => ratingWeight[findSource(item.url)?.trust ?? 'unrated'];
  const lean = (relation: EvidenceRelation) =>
    items.filter((item) => item.relation === relation).reduce((sum, item) => sum + weight(item), 0);
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  const sources = total > 0 ? 50 + (50 * (lean('supporting') - lean('contradicting'))) / total : 50;
  return Math.round(MODEL_SHARE * models + (1 - MODEL_SHARE) * sources);
}

/** The score on its scale, with what it is made of in one line. */
function Score({ revision, items }: { revision: AssessmentRevision; items: EvidenceSnapshot[] }) {
  const score = accuracyScore(revision, items);
  const tone = score >= 70 ? { text: 'text-emerald-700', fill: 'bg-emerald-700' }
    : score <= 30 ? { text: 'text-rose-600', fill: 'bg-rose-600' }
    : { text: 'text-amber-700', fill: 'bg-amber-700' };
  return (
    <Column title={t('Accuracy score')}>
      <p className={`${headline} ${tone.text}`}>
        {score}
        <span className="text-[18px] tracking-[-0.01em] text-ink-muted"> / 100</span>
      </p>
      <p className={caption}>{t('The higher the score, the more likely the claim is accurate')}</p>
      <div className="mt-6 max-w-[260px]">
        <div
          role="meter"
          aria-label={t('Accuracy score')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          className="h-1 overflow-hidden rounded-full bg-line-strong"
        >
          <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${score}%` }} />
        </div>
        <p className={`mt-2 flex justify-between ${note}`} aria-hidden="true">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </p>
      </div>
    </Column>
  );
}

/** Which way the sources lean, as one sentence, with a dot for each source. */
function Sources({ items }: { items: EvidenceSnapshot[] }) {
  const count = (relation: EvidenceRelation) => items.filter((item) => item.relation === relation).length;
  const supporting = count('supporting');
  const contradicting = count('contradicting');
  const split = supporting === contradicting && supporting > 0;
  const lead = supporting > contradicting ? 'supporting' : contradicting > supporting ? 'contradicting' : null;
  const ratings = items.map((item) => findSource(item.url)?.trust ?? 'unrated');
  const byRating = ratingOrder
    .map((rating) => ({ rating, count: ratings.filter((value) => value === rating).length }))
    .filter((entry) => entry.count > 0);

  return (
    <Column title={t('Sources')}>
      <p className={`${headline} ${lead === 'supporting' ? 'text-emerald-700' : lead === 'contradicting' ? 'text-rose-600' : 'text-ink'}`}>
        {split ? `${supporting} : ${contradicting}` : lead ? count(lead) : 0}
        {!split && <span className="text-[18px] tracking-[-0.01em] text-ink-muted"> / {items.length}</span>}
      </p>
      <p className={caption}>
        {split
          ? t('Sources are split between supporting and contradicting')
          : t(lead === 'supporting' ? 'sources support the claim' : lead === 'contradicting' ? 'sources contradict the claim' : 'sources settle the claim')}
      </p>
      <ul className="mt-6 flex flex-wrap gap-2">
        {relationOrder.flatMap((relation) =>
          items.filter((item) => item.relation === relation).map((item) => (
            <li key={item.id} title={`${item.publisher ?? item.sourceTitle} · ${relationLabel[relation]}`}>
              <span className={`block h-2 w-2 rounded-full ${relationFill[relation]}`} aria-hidden="true" />
              <span className="sr-only">{item.publisher ?? item.sourceTitle}: {relationLabel[relation]}</span>
            </li>
          )))}
      </ul>
      <p aria-label={t('Source ratings')} className={`mt-3 ${note}`}>
        {byRating.map((entry) => `${entry.count} ${t(ratingLabel[entry.rating]).toLowerCase()}`).join(' · ')}
      </p>
    </Column>
  );
}

/** The verdict the models share, and how sure each said it was. The reasoning stays where it was. */
function Models({ judges }: { judges: JudgeVerdict[] }) {
  return (
    <Column title={t('AI models')}>
      <p className={`${headline} ${verdictText[judges[0].verdict]}`}>{verdictLabel[judges[0].verdict]}</p>
      <p className={caption}>
        {t(judges.length === 1 ? 'One model reached this verdict' : judges.length === 2 ? 'Both models reached this verdict' : 'Every model reached this verdict')}
      </p>
      <ul className="mt-6 max-w-[260px] space-y-3">
        {judges.map(({ judge, verdict, confidence }, index) => {
          const model = config.judges.options.find(({ name }) => name === judge);
          const percent = Math.round(confidence * 100);
          return (
            <li key={`${judge}-${index}`} className="flex items-center gap-2.5" title={t('{percent}% confidence', { percent })}>
              <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                {model?.logo && <img src={model.logo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" draggable={false} />}
                <span
                  className="model-name truncate text-[13px] font-medium"
                  style={model ? { '--model-color': model.nameColor } as CSSProperties : undefined}
                >
                  {judge}
                </span>
              </span>
              <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-line-strong" aria-hidden="true">
                <span className={`block h-full rounded-full ${verdictFill[verdict]}`} style={{ width: `${percent}%` }} />
              </span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-soft">{percent}%</span>
            </li>
          );
        })}
      </ul>
    </Column>
  );
}

interface Props {
  /** The claim's current assessment. Null when it could not be checked, which leaves out the score. */
  revision: AssessmentRevision | null;
  /** False while the sources are still loading, so the score never shows a number it will change. */
  sourcesReady: boolean;
  items: EvidenceSnapshot[];
  /** Left out when the judges disagree: their reviews are already side by side. */
  judges: JudgeVerdict[] | null;
}

/** The evidence behind a verdict at a glance, for every claim, drawn only from what the check already saved. */
export function EvidenceGlance({ revision, sourcesReady, items, judges }: Props) {
  if (items.length === 0 && !judges?.length) return null;
  return (
    <section
      aria-label={t('Evidence at a glance')}
      className="press-rise mt-12 grid gap-x-12 gap-y-8 border-t border-line pb-4 pt-8 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
      style={{ '--press-delay': '120ms' } as CSSProperties}
    >
      {revision && sourcesReady && <Score revision={revision} items={items} />}
      {items.length > 0 && <Sources items={items} />}
      {!!judges?.length && <Models judges={judges} />}
    </section>
  );
}
