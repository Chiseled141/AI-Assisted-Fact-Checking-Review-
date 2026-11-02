import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlignLeft, ChevronLeft, ChevronRight, FileText, Link2, Loader2, Plus, Search } from 'lucide-react';
import type { Check, ListChecksParams, Page } from '../../types/models';
import { checkService, demoMode } from '../../services';
import { formatDate, formatTime, inputTypeLabel, pluralize, statusLabel } from '../../lib/format';
import { StatusBadge } from '../../components/Badges';
import { t, useLanguage } from '../../lib/i18n';

type StatusFilter = NonNullable<ListChecksParams['status']>;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; page: Page<Check> };

const actionButton =
  'press-lift inline-flex h-10 items-center justify-center gap-2 rounded-full bg-indigo-700 px-4 text-sm font-medium text-on-primary transition-colors hover:bg-indigo-800';
const surfacePanel = 'overflow-hidden rounded-xl border border-line bg-white';
const pageButton =
  'inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm text-ink-soft transition-colors hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft';

/** What was checked, with its own shape and color so a link or a file stands out while scanning. */
function InputChip({ check }: { check: Check }) {
  const chip = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium';
  if (check.inputType === 'url') {
    return (
      <span className={`${chip} bg-indigo-50 text-indigo-700`}>
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        {inputTypeLabel.url}
      </span>
    );
  }
  if (check.files?.length) {
    return (
      <span className={`${chip} bg-orange-50 text-orange-800`}>
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        {pluralize(check.files.length, 'file')}
      </span>
    );
  }
  return (
    <span className={`${chip} bg-zinc-100 text-ink-soft`}>
      <AlignLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {inputTypeLabel.text}
    </span>
  );
}

function groupByDate(items: Check[]) {
  const groups: { date: string; items: Check[] }[] = [];
  for (const check of items) {
    const date = formatDate(check.createdAt);
    const latest = groups[groups.length - 1];
    if (latest?.date === date) latest.items.push(check);
    else groups.push({ date, items: [check] });
  }
  return groups;
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const language = useLanguage();
  const query = params.get('q') ?? '';
  const status = (statusOptions.find((o) => o.value === params.get('status'))?.value ?? 'all') as StatusFilter;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [draftQuery, setDraftQuery] = useState(query);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const ids = { search: useId(), status: useId() };

  useEffect(() => setDraftQuery(query), [query]);

  // Debounce typing into the URL so results update without a submit button.
  useEffect(() => {
    if (draftQuery === query) return;
    const timer = setTimeout(() => updateParams({ q: draftQuery, page: '1' }), 250);
    return () => clearTimeout(timer);
  }, [draftQuery]);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }));
    checkService
      .listChecks({ query, status, page })
      .then((result) => !cancelled && setState({ kind: 'ready', page: result }))
      .catch(() => !cancelled && setState({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [query, status, page, attempt, language]);

  function updateParams(next: Record<string, string>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (!value || (key === 'status' && value === 'all') || (key === 'page' && value === '1')) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  }

  function clearFilters() {
    setDraftQuery('');
    setParams(new URLSearchParams(), { replace: true });
  }

  const filtered = query !== '' || status !== 'all';
  const result = state.kind === 'ready' ? state.page : null;
  const groups = result ? groupByDate(result.items) : [];

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[44px]">
            {t('History')}
          </h1>
          {result && (
            <p className="mt-1 text-[20px] italic leading-snug tracking-[-0.01em] text-orange-700 sm:text-[24px]">
              ({pluralize(result.total, 'check')}.)
            </p>
          )}
          <p className="mt-3 max-w-[31rem] text-[15px] leading-[1.65] text-ink-soft">
            {demoMode
              ? t('Every check is saved in this browser, with its evidence and revisions.')
              : t('Every check is saved with its evidence and revisions.')}
          </p>
        </div>
        <Link to="/" className={actionButton}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('New check')}
        </Link>
      </header>

      <div className="mt-8 flex flex-col-reverse gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between">
        <div role="group" aria-label={t('Filter by status')} className="flex gap-5 overflow-x-auto sm:gap-7">
          {statusOptions.map((option) => {
            const selected = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => updateParams({ status: option.value, page: '1' })}
                className={`-mb-px min-h-11 shrink-0 border-b-2 text-[15px] font-medium transition-colors focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-indigo-700/40 ${
                  selected ? 'border-indigo-700 text-ink' : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
        <div className="relative w-full pb-2 sm:w-72">
          <label htmlFor={ids.search} className="sr-only">
            {t('Search checks')}
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-5 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id={ids.search}
            type="search"
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder={t('Search checks')}
            className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 font-sans text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-line-strong focus:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-700/15"
          />
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {result ? t('{count} found', { count: pluralize(result.total, 'check') }) : ''}
      </p>

      <div className="mt-5">
        {state.kind === 'loading' && (
          <p
            className={`${surfacePanel} flex items-center justify-center gap-2 py-20 text-sm text-ink-muted`}
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('Loading history…')}
          </p>
        )}

        {state.kind === 'error' && (
          <div role="alert" className={`${surfacePanel} py-16 text-center text-sm text-ink-soft`}>
            <p>{t('History could not be loaded.')}</p>
            <button
              type="button"
              className="mt-4 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {t('Try again')}
            </button>
          </div>
        )}

        {result && result.total === 0 && (
          <div className={`${surfacePanel} px-6 py-20 text-center`}>
            <h2 className="text-[18px] font-medium tracking-[-0.015em] text-ink">
              {filtered ? t('No matching checks') : t('No checks yet')}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-[1.7] text-ink-soft">
              {filtered
                ? t('Try a different search term or status.')
                : demoMode
                  ? t('Checks you run in demo mode are saved in this browser and appear here.')
                  : t('Checks you run appear here.')}
            </p>
            {filtered ? (
              <button
                type="button"
                className="mt-6 text-sm text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                onClick={clearFilters}
              >
                {t('Clear filters')}
              </button>
            ) : (
              <Link to="/" className={`${actionButton} mt-6`}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('Start a check')}
              </Link>
            )}
          </div>
        )}

        {result && result.total > 0 && (
          <>
            <div>
              {groups.map((group, groupIndex) => (
                <section
                  key={group.date}
                  aria-labelledby={`date-group-${groupIndex}`}
                  className="grid gap-1 border-b border-line py-5 last:border-b-0 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-x-8 sm:py-6"
                >
                  <div className="flex items-baseline justify-between sm:block sm:pt-4">
                    <h2
                      id={`date-group-${groupIndex}`}
                      className="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink"
                    >
                      {group.date}
                    </h2>
                    <span className="font-sans text-[13px] tabular-nums text-ink-muted sm:mt-0.5 sm:block">
                      {pluralize(group.items.length, 'check')}
                    </span>
                  </div>
                  <ul className="min-w-0">
                    {group.items.map((check) => (
                      <li key={check.id} className="border-t border-line first:border-t-0">
                        <Link
                          to={`/checks/${check.id}`}
                          className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 py-4 focus-visible:relative focus-visible:z-10 sm:grid-cols-[minmax(0,1fr)_112px_16px]"
                        >
                          <span className="min-w-0">
                            <span className="line-clamp-2 block text-[16px] font-medium leading-[1.4] tracking-[-0.012em] text-ink transition-colors group-hover:text-indigo-700">
                              {check.title}
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[13px] text-ink-muted">
                              <InputChip check={check} />
                              {check.claimCount !== undefined && <span>{pluralize(check.claimCount, 'claim')}</span>}
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-1 whitespace-nowrap pt-0.5">
                            {/* A finished check is the normal case, so only the others ask for attention. */}
                            {check.status === 'completed' ? (
                              <span className="text-[13px] text-ink-muted">{statusLabel.completed}</span>
                            ) : (
                              <StatusBadge status={check.status} />
                            )}
                            <time
                              dateTime={check.createdAt}
                              className="font-sans text-[13px] tabular-nums text-ink-muted"
                            >
                              {formatTime(check.createdAt)}
                            </time>
                          </span>
                          <ChevronRight
                            className="hidden h-4 w-4 self-center text-ink-muted transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-indigo-700 sm:block"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {result.totalPages > 1 && (
              <nav aria-label={t('Pagination')} className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className={pageButton}
                  disabled={result.page <= 1}
                  onClick={() => updateParams({ page: String(result.page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {t('Previous')}
                </button>
                <span className="font-sans text-[13px] tabular-nums text-ink-muted">
                  {t('Page {page} of {total}', { page: result.page, total: result.totalPages })}
                </span>
                <button
                  type="button"
                  className={pageButton}
                  disabled={result.page >= result.totalPages}
                  onClick={() => updateParams({ page: String(result.page + 1) })}
                >
                  {t('Next')}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
