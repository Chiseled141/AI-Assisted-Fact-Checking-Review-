import { ReplyButton } from '../../components/ReplyButton';
import type { EvidenceRelation, EvidenceSnapshot, FreshnessJudgment } from '../../types/models';
import { formatCalendarDate, relationLabel, safeHref } from '../../lib/format';
import { t } from '../../lib/i18n';

const dotColor: Record<EvidenceRelation, string> = {
  supporting: 'bg-emerald-700',
  contradicting: 'bg-rose-600',
  contextual: 'bg-ink-faint',
};

export function EvidenceSourceLinks({
  items,
  freshness,
  onReply,
}: {
  items: EvidenceSnapshot[];
  freshness: Record<string, FreshnessJudgment>;
  onReply?: (item: EvidenceSnapshot) => void;
}) {
  const dated = items.filter((item) => item.publishedAt)
    .sort((a, b) => a.publishedAt!.localeCompare(b.publishedAt!));
  const ordered = [...dated, ...items.filter((item) => !item.publishedAt)];

  return (
    <section aria-label={t('Source articles')} className="mt-4">
      <ol className="flex flex-wrap gap-2">
        {ordered.map((item) => {
          const href = safeHref(item.url);
          const judgment = freshness[item.id];
          const outdated = judgment?.status === 'outdated';
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${outdated ? 'ring-1 ring-inset ring-candy' : dotColor[item.relation]}`}
              />
              <span className="sr-only">{relationLabel[item.relation]}</span>
              <span className="font-medium text-ink-soft">{item.publisher ?? item.sourceTitle}</span>
              {item.publishedAt ? (
                <time dateTime={item.publishedAt} className="tabular-nums text-ink-muted">
                  {formatCalendarDate(item.publishedAt)}
                </time>
              ) : (
                <span className="text-ink-muted">{t('Unknown date')}</span>
              )}
              {outdated && <span className="text-ink-muted">{t('Outdated')}</span>}
            </>
          );
          const className = 'inline-flex min-h-9 flex-wrap items-center gap-x-2 bg-transparent px-3 py-1.5 text-xs [overflow-wrap:anywhere]';
          return (
            <li key={item.id} className="flex min-w-0 items-center rounded-lg border border-line hover:border-brand-200">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={outdated ? judgment?.reason : undefined}
                  className={className}
                >
                  {content}
                </a>
              ) : (
                <span className={className} title={outdated ? judgment?.reason : undefined}>{content}</span>
              )}
              {onReply && (
                <ReplyButton
                  label={t('Ask about {item}', { item: item.sourceTitle })}
                  onClick={() => onReply(item)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
