import type { JudgeVerdict } from '../../types/models';
import { judgeLogo } from '../../lib/judges';
import { VerdictMark } from '../../components/Badges';
import { HighlightedText } from '../../components/HighlightedText';
import { inLanguage, t } from '../../lib/i18n';
const judgeColor = ['#0f766e', '#4338ca'];

/**
 * Both models' overall reviews, one after the other, with each name in bold. A model's own verdict
 * only appears when they differ, because otherwise the headline beside this already says it.
 */
export function JudgeReviews({ judges }: { judges: JudgeVerdict[] }) {
  const disagree = judges.some((other) => other.verdict !== judges[0].verdict);

  return (
    <div>
      {disagree && <p className="mb-3 text-[13px] font-medium text-amber-700">{t('AI judges disagree')}</p>}
      <ul aria-label={t('AI model reviews')} className="space-y-4">
        {judges.map(({ judge, verdict, confidence, review, translations }, index) => {
          const logo = judgeLogo(judge);
          return (
            <li key={`${judge}-${index}`}>
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
              <p className="mt-1 text-[15px] leading-[1.65] text-ink-soft"><HighlightedText text={inLanguage(review, translations)} /></p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
