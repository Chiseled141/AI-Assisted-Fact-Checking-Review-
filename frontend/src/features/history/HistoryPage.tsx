import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlignLeft, ChevronLeft, ChevronRight, FileText, Link2, Loader2, Plus, Search } from 'lucide-react';
import type { Check, ListChecksParams, Page } from '../../types/models';
import { checkService, demoMode } from '../../services';
import { formatDate, formatTime, inputTypeLabel, pluralize } from '../../lib/format';
import { StatusBadge } from '../../components/Badges';
import { t, useLanguage } from '../../lib/i18n';
import { ActivityHeatmap } from './ActivityHeatmap';

type StatusFilter = NonNullable<ListChecksParams['status']>;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; page: Page<Check> };

const actionButton =
  'press-lift inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand-700 px-3 text-[13px] font-medium text-on-brand transition-colors hover:bg-brand-900';
const surfacePanel = 'overflow-hidden rounded-xl border border-line bg-white';
const pageButton =
  'inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm text-ink-soft transition-colors hover:border-brand-200 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft';

/** What was checked, as a quiet icon, so the titles stay the only thing to scan. */
function InputIcon({ check }: { check: Check }) {
  const file = !!check.files?.length;
  const label = check.inputType === 'url' ? inputTypeLabel.url : file ? pluralize(check.files!.length, 'file') : inputTypeLabel.text;
  const Icon = check.inputType === 'url' ? Link2 : file ? FileText : AlignLeft;
  return (
    <span title={label} className="shrink-0 text-ink-muted">
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
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
      <header className="rounded-2xl border border-brand-200/70 bg-gradient-to-br from-brand-50 via-white to-white px-5 py-6 sm:px-7 sm:py-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="text-[20px] font-medium tracking-[-0.02em] text-ink">{t('History')}</h1>
          <Link to="/" className={actionButton}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('New check')}
          </Link>
        </div>
        <ActivityHeatmap />
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
                className={`-mb-px min-h-11 shrink-0 border-b-2 text-[15px] font-medium transition-colors focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-700/40 ${
                  selected ? 'border-brand-700 text-ink' : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
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
            className="pointer-events-none absolute left-3 top-[18px] h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id={ids.search}
            type="search"
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder={t('Search checks')}
            className="h-9 w-full rounded-md border border-line bg-white pl-8 pr-3 font-sans text-[13px] text-ink placeholder:text-ink-muted transition-colors hover:border-brand-200 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
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
                  className="grid gap-1 border-b border-line py-4 last:border-b-0 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-x-8 sm:py-5"
                >
                  <div className="flex items-baseline justify-between sm:block sm:pt-2.5">
                    <h2
                      id={`date-group-${groupIndex}`}
                      className="font-sans text-[14px] font-medium tracking-[-0.01em] text-ink"
                    >
                      {group.date}
                    </h2>
                    <span className="font-sans text-[13px] text-ink-muted sm:mt-0.5 sm:block">
                      {pluralize(group.items.length, 'check')}
                    </span>
                  </div>
                  <ul className="-mx-3 min-w-0">
                    {group.items.map((check) => (
                      <li key={check.id}>
                        <Link
                          to={`/checks/${check.id}`}
                          className="group grid gap-x-6 gap-y-1 rounded-md px-3 py-2.5 transition-colors hover:bg-brand-100/60 focus-visible:relative focus-visible:z-10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <InputIcon check={check} />
                            <span className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{check.title}</span>
                          </span>
                          <span className="flex items-center gap-2 whitespace-nowrap pl-[26px] text-[13px] text-ink-muted sm:pl-0">
                            {/* A finished check is the normal case, so only the others ask for attention. */}
                            {check.status !== 'completed' && <StatusBadge status={check.status} />}
                            {check.claimCount !== undefined && (
                              <>
                                <span>{pluralize(check.claimCount, 'claim')}</span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <time dateTime={check.createdAt}>{formatTime(check.createdAt)}</time>
                          </span>
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
