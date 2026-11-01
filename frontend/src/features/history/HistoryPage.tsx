import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import type { Check, ListChecksParams, Page } from '../../types/models';
import { checkService } from '../../services';
import { formatDate, formatTime, inputTypeLabel, pluralize } from '../../lib/format';
import { StatusBadge } from '../../components/Badges';

type StatusFilter = NonNullable<ListChecksParams['status']>;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; page: Page<Check> };

const actionPill =
  'inline-flex items-center gap-1.5 rounded-full bg-ink py-2 pl-4 pr-3.5 text-sm font-medium text-page transition-opacity hover:opacity-90';

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
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
  }, [query, status, page, attempt]);

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

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-[32px] font-normal leading-[1.05] tracking-[-0.04em] text-ink sm:text-[40px]">History</h1>
          <p className="mt-2.5 max-w-[31rem] text-[15px] leading-[1.65] text-ink-soft">
            Every check is saved in this browser, with its evidence and revisions.
          </p>
        </div>
        <Link to="/" className={`${actionPill} mt-1`}>
          New check
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <label htmlFor={ids.search} className="sr-only">
              Search checks
            </label>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              id={ids.search}
              type="search"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Search checks"
              className="h-10 w-full rounded-full border border-line bg-white pl-11 pr-4 font-sans text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
            />
          </div>
          <div
            role="group"
            aria-label="Filter by status"
            className="flex h-10 items-center gap-1 rounded-full border border-line bg-white p-1"
          >
            {statusOptions.map((option) => {
              const selected = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => updateParams({ status: option.value, page: '1' })}
                  className={`h-8 rounded-full px-3.5 font-sans text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                    selected ? 'bg-ink text-page' : 'text-ink-muted hover:bg-zinc-100 hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        {result && (
          <p className="font-sans text-xs tabular-nums text-ink-faint">
            {pluralize(result.total, 'check')}
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {result ? `${pluralize(result.total, 'check')} found` : ''}
      </p>

      <div className="mt-6">
        {state.kind === 'loading' && (
          <p
            className="flex items-center justify-center gap-2 border-t border-line py-20 text-sm text-ink-muted"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading history…
          </p>
        )}

        {state.kind === 'error' && (
          <div role="alert" className="border-t border-line py-16 text-center text-sm text-ink-soft">
            <p>History could not be loaded.</p>
            <button
              type="button"
              className="mt-4 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {result && result.total === 0 && (
          <div className="border-t border-line py-20 text-center">
            <h2 className="text-[18px] font-medium tracking-[-0.015em] text-ink">
              {filtered ? 'No matching checks' : 'No checks yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-[1.7] text-ink-soft">
              {filtered
                ? 'Try a different search term or status.'
                : 'Checks you run in demo mode are saved in this browser and appear here.'}
            </p>
            {filtered ? (
              <button
                type="button"
                className="mt-6 text-sm text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : (
              <Link to="/" className={`${actionPill} mt-6`}>
                Start a check
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}

        {result && result.total > 0 && (
          <>
            <ul className="border-t border-line" aria-label="Checks">
              {result.items.map((check) => (
                <li key={check.id} className="border-b border-line">
                  <Link
                    to={`/checks/${check.id}`}
                    className="group grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-start"
                  >
                    <time
                      dateTime={check.createdAt}
                      className="font-sans text-xs leading-[1.6] text-ink-faint"
                    >
                      {formatDate(check.createdAt)}
                      <span className="block tabular-nums text-ink-muted">{formatTime(check.createdAt)}</span>
                    </time>
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-[15px] font-medium leading-[1.5] tracking-[-0.01em] text-ink transition-colors group-hover:text-brand-700">
                        {check.title}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-xs text-ink-muted">
                        <span>{inputTypeLabel[check.inputType]}</span>
                        {check.files?.length ? (
                          <>
                            <span aria-hidden="true" className="text-ink-faint">·</span>
                            <span>{pluralize(check.files.length, 'file')}</span>
                          </>
                        ) : null}
                        {check.claimCount !== undefined && (
                          <>
                            <span aria-hidden="true" className="text-ink-faint">·</span>
                            <span>{pluralize(check.claimCount, 'claim')}</span>
                          </>
                        )}
                        <span aria-hidden="true" className="text-ink-faint">·</span>
                        <StatusBadge status={check.status} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {result.totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted"
                  disabled={result.page <= 1}
                  onClick={() => updateParams({ page: String(result.page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </button>
                <span className="font-sans text-xs tabular-nums text-ink-faint">
                  Page {result.page} of {result.totalPages}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted"
                  disabled={result.page >= result.totalPages}
                  onClick={() => updateParams({ page: String(result.page + 1) })}
                >
                  Next
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
