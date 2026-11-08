import type { EvidenceSnapshot, JudgeVerdict } from '../../types/models';
import { ReplyButton } from '../../components/ReplyButton';
import { config } from '../../config';
import { VerdictMark } from '../../components/Badges';
import { HighlightedText } from '../../components/HighlightedText';
import { inLanguage, t } from '../../lib/i18n';

export function judgesDisagree(judges?: JudgeVerdict[] | null): boolean {
  return judges?.some((judge) => judge.verdict !== judges[0].verdict) ?? false;
}

export function JudgeReviews({
  judges, evidence = [], onReply,
}: {
  judges: JudgeVerdict[];
  evidence?: EvidenceSnapshot[];
  onReply: (judge: string, modelId: string) => void;
}) {
  const disagree = judgesDisagree(judges);

  return (
    <div>
      <ul aria-label={t('AI model reviews')} className={disagree ? 'grid divide-y divide-line-strong md:grid-cols-2 md:divide-x md:divide-y-0' : 'space-y-4'}>
        {judges.map(({ judge, verdict, confidence, review, translations, citations }, index) => {
          const model = config.judges.options.find(({ name }) => name === judge);
          return (
            <li key={`${judge}-${index}`} className={disagree ? 'min-w-0 py-3 [overflow-wrap:anywhere] md:px-6 md:first:pl-0 md:last:pr-0' : undefined}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {model?.logo && <img src={model.logo} alt="" className="h-4 w-4 shrink-0 object-contain" draggable={false} />}
                  <strong className="text-[15px] font-semibold text-ink" style={model ? { color: model.nameColor } : undefined}>
                    {judge}
                  </strong>
                </span>
                <span className={`text-xs tabular-nums text-ink-muted ${disagree ? 'ml-auto' : ''}`}>
                  {t('{percent}% confidence', { percent: Math.round(confidence * 100) })}
                </span>
                {model && (
                  <span className={disagree ? 'shrink-0' : 'ml-auto shrink-0'}>
                    <ReplyButton
                      label={t('Reply to {model}', { model: judge })}
                      onClick={() => onReply(judge, model.id)}
                    />
                  </span>
                )}
              </div>
              {disagree && (
                <div className="mt-0.5">
                  <VerdictMark verdict={verdict} className="!text-[13px]" />
                </div>
              )}
              <p className={`${disagree ? 'mt-3' : 'mt-1'} text-[15px] leading-[1.65] text-ink-soft`}>
                <HighlightedText text={inLanguage(review, translations)} />
              </p>
              {disagree && (citations?.length ? (
                <ul className="mt-4 space-y-3">
                  {citations.map(({ evidenceId, quote, translations }, citationIndex) => {
                    const source = evidence.find((item) => item.id === evidenceId);
                    if (!quote && !source) return null;
                    return (
                      <li key={`${evidenceId}-${citationIndex}`} className="border-l-2 border-line-strong pl-3 text-sm">
                        {quote && <blockquote className="text-ink-soft">{inLanguage(quote, translations)}</blockquote>}
                        {source && (
                          <a href={source.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline underline-offset-4">
                            {source.sourceTitle}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : citations && (
                <p className="mt-3 text-xs text-ink-muted">
                  {t('No source passage cited.')}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
