import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, History } from 'lucide-react';
import type { EarlierChecks as Earlier } from '../../types/models';
import { checkService } from '../../services';
import { VerdictMark } from '../../components/Badges';
import { formatCalendarDate } from '../../lib/format';
import { t } from '../../lib/i18n';

const WAIT_MS = 400;
const MIN_TEXT = 12;

/**
 * Looks up earlier checks of what is being typed, a moment after typing stops. It only reads saved checks, so it
 * costs nothing; opening an earlier result saves the price of a new check.
 */
export function useEarlierChecks(text: string, url: string | null, enabled: boolean): Earlier | null {
  const [found, setFound] = useState<Earlier | null>(null);
  const query = url ? { url } : text.trim().length >= MIN_TEXT ? { text: text.trim() } : null;
  const key = enabled && query ? JSON.stringify(query) : '';

  useEffect(() => {
    if (!key) {
      setFound(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      checkService
        .findEarlier(JSON.parse(key), controller.signal)
        .then(setFound)
        // A failed lookup only hides the hint; the check itself still works.
        .catch(() => setFound(null));
    }, WAIT_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return key ? found : null;
}

function day(iso: string) {
  return formatCalendarDate(iso.slice(0, 10));
}

const rowClass =
  'group flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 sm:px-4';

function OpenResultArrow() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-ink-muted transition-colors group-hover:bg-brand-50 group-hover:text-brand-700">
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/** Saved results that match the current input. */
export function EarlierChecksNote({ earlier }: { earlier: Earlier | null }) {
  if (!earlier || (!earlier.link && earlier.claims.length === 0)) return null;
  const link = earlier.link;

  return (
    <section
      aria-label={t('Checked before')}
      className="rise-in mt-3 overflow-hidden rounded-2xl border border-line bg-white/55 text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-white/50 px-3 py-2.5 sm:px-4">
        <h2 className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
          <History className="h-4 w-4 text-brand-700" aria-hidden="true" />
          {t('Checked before')}
        </h2>
        <p className="text-xs text-ink-muted">{t('Send it anyway to check again with the newest sources.')}</p>
      </div>
      <ul className="divide-y divide-line">
        {link && (
          <li>
            <Link to={`/checks/${link.checkId}`} className={rowClass}>
              <span className="sr-only">{t('Open result')} </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-sm font-medium leading-snug text-ink">{link.title}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {t('This link was checked on {date} · {count} claims', {
                    date: day(link.checkedAt),
                    count: link.claimCount,
                  })}
                </p>
              </div>
              <OpenResultArrow />
            </Link>
          </li>
        )}
        {earlier.claims.map((claim) => (
          <li key={claim.claimId}>
            <Link to={`/checks/${claim.checkId}?claim=${claim.position}`} className={rowClass}>
              <span className="sr-only">{t('Open result')} </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-sm font-medium leading-snug text-ink">{claim.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                  <VerdictMark verdict={claim.verdict} />
                  <span>{t('Checked on {date}', { date: day(claim.checkedAt) })}</span>
                </p>
              </div>
              <OpenResultArrow />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
