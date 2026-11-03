import { ExternalLink } from 'lucide-react';
import type { FactCheckMatch, JudgeVerdict } from '../../types/models';
import { safeHref } from '../../lib/format';
import { judgeLogo } from '../../lib/judges';
import { VerdictMark } from '../../components/Badges';
import { t } from '../../lib/i18n';
import { judgeColor } from './RatingChart';

/**
 * Both models' overall reviews, one after the other, with each name in bold. A model's own verdict
 * only appears when they differ, because otherwise the headline beside this already says it.
 */
export function JudgeReviews({ judges }: { judges: JudgeVerdict[] }) {
  const disagree = judges.some((other) => other.verdict !== judges[0].verdict);

  return (
    <div>
      {disagree && <p className="mb-3 text-[13px] font-medium text-amber-700">{t('AI judges disagree')}</p>}
      <ul aria-label={t('Reviews from both AI models')} className="space-y-4">
        {judges.map(({ judge, verdict, confidence, review }, index) => {
          const logo = judgeLogo(judge);
          return (
            <li key={judge}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {logo && <img src={logo} alt="" className="h-4 w-4 shrink-0" draggable={false} />}
                <strong className="text-[15px] font-semibold" style={{ color: judgeColor[index] }}>
                  {judge}
                </strong>
                {disagree && <VerdictMark verdict={verdict} className="!text-[13px]" />}
                <span aria-hidden="true" className="text-ink-muted">
                  ·
                </span>
                <span className="text-[13px] tabular-nums text-ink-muted">
                  {t('{percent}% confidence', { percent: Math.round(confidence * 100) })}
                </span>
              </div>
              <p className="mt-1 text-[15px] leading-[1.65] text-ink-soft">{review}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A published fact-check matched to the claim by the known-fake lookup. */
export function FactCheckNote({ factCheck }: { factCheck: FactCheckMatch }) {
  const href = safeHref(factCheck.url);
  return (
    <p className="mt-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4 font-sans text-sm leading-relaxed text-ink-soft">
      <span className="font-semibold text-ink">{t('Matched published fact-check:')}</span> {factCheck.publisher}{' '}
      {t('rated it “{rating}”.', { rating: factCheck.rating })}
      {href && (
        <>
          {' '}
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            {t('Read the fact-check')}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">{t('(opens in a new tab)')}</span>
          </a>
        </>
      )}
    </p>
  );
}
