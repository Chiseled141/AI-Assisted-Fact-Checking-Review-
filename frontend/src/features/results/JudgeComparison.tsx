import type { CSSProperties } from 'react';
import type { EvidenceSnapshot, JudgeVerdict } from '../../types/models';
import { ReplyButton } from '../../components/ReplyButton';
import { config } from '../../config';
import { VerdictMark } from '../../components/Badges';
import { HighlightedText } from '../../components/HighlightedText';
import { getLanguage, inLanguage, t } from '../../lib/i18n';
import { parseGridQuote, parseTableQuote } from './figures';
import { QuoteGrid, QuoteTable } from './SourceDeck';

const relationLabels = { supporting: 'Supporting', contradicting: 'Contradicting', contextual: 'Context only' } as const;

export function judgesDisagree(judges?: JudgeVerdict[] | null): boolean {
  return judges?.some((judge) => judge.verdict !== judges[0].verdict) ?? false;
}

export function JudgeReviews({
  judges, evidence = [], sourcesProvided, onReply,
}: {
  judges: JudgeVerdict[];
  evidence?: EvidenceSnapshot[];
  sourcesProvided?: number;
  onReply: (judge: string, modelId: string) => void;
}) {
  const disagree = judgesDisagree(judges);

  return (
    <div>
      <ul aria-label={t('AI model reviews')} className={disagree ? 'grid divide-y divide-line-strong md:grid-cols-2 md:divide-x md:divide-y-0' : 'space-y-4'}>
        {judges.map(({ judge, verdict, review, translations, citations }, index) => {
          const model = config.judges.options.find(({ name }) => name === judge);
          const citationsById = new Map(citations?.map((citation) => [citation.evidenceId, citation]));
          const sourceIds = new Set([
            ...evidence.map(({ id }) => id),
            ...citationsById.keys(),
          ]);
          const quoted = [...citationsById.values()].filter(({ quote }) => quote).length;
          return (
            <li key={`${judge}-${index}`} className={disagree ? 'min-w-0 py-3 [overflow-wrap:anywhere] md:px-6 md:first:pl-0 md:last:pr-0' : undefined}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {model?.logo && <img src={model.logo} alt="" className="h-4 w-4 shrink-0 object-contain" draggable={false} />}
                  <strong className="model-name text-[15px] font-semibold" style={model ? { '--model-color': model.nameColor } as CSSProperties : undefined}>
                    {judge}
                  </strong>
                </span>
                {model && (
                  <span className="ml-auto shrink-0">
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
              {sourcesProvided !== undefined && sourcesProvided > 0 && (
                <p className="mt-2 text-xs text-ink-muted">
                  {t('Quoted {cited} of {total} sources provided', { cited: quoted, total: sourcesProvided })}
                </p>
              )}
              {sourceIds.size > 0 ? (
                <ul className="mt-3 space-y-3">
                  {[...sourceIds].map((evidenceId) => {
                    const source = evidence.find((item) => item.id === evidenceId);
                    const { quote, translations, relation, freshness } = citationsById.get(evidenceId) ?? {};
                    if (!quote && !source) return null;
                    return (
                      <li key={evidenceId} className="border-l-2 border-line-strong pl-3 text-sm">
                        {(relation || !quote) && (
                          <p className="text-xs text-ink-muted">
                            {t(relation ? relationLabels[relation] : 'Provided without a model quote')}
                            {freshness === 'outdated' && <> · {t('Outdated')}</>}
                          </p>
                        )}
                        {quote && (() => {
                          // A table row keeps its original cells. The saved excerpt may carry the headings the model left out.
                          const full = source && source.excerpt.endsWith(quote) ? source.excerpt : quote;
                          const table = parseTableQuote(full);
                          if (table) return <QuoteTable table={table} translation={translations?.[getLanguage()] ?? undefined} compact />;
                          const grid = parseGridQuote(full);
                          return grid
                            ? <QuoteGrid grid={grid} compact />
                            : <blockquote className="text-ink-soft">{inLanguage(quote, translations)}</blockquote>;
                        })()}
                        {source && (
                          <a href={source.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline underline-offset-4">
                            {source.sourceTitle}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : disagree && citations && !sourcesProvided && (
                <p className="mt-3 text-xs text-ink-muted">
                  {t('No source passage cited.')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
