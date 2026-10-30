import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, FlaskConical, Inbox, Link2, Loader2, Search } from 'lucide-react';
import type { Check, ListChecksParams, Page } from '../../types/models';
import { checkService } from '../../services';
import { formatDateTime, inputTypeLabel, pluralize } from '../../lib/format';
import { StatusBadge } from '../../components/Badges';
import { resetDemoData } from '../demo/demoSettings';

type StatusFilter = NonNullable<ListChecksParams['status']>;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; page: Page<Check> };

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

  function resetDemo() {
    resetDemoData();
    clearFilters();
    setAttempt((n) => n + 1);
  }

  const filtered = query !== '' || status !== 'all';
  const result = state.kind === 'ready' ? state.page : null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">checks</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">History</h1>
          <p className="mt-1 text-sm text-ink-soft">Demo checks saved in this browser.</p>
        </div>
        <Link to="/" className="btn-primary">
          New check
        </Link>
      </div>

      <div className="panel mt-6 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <label htmlFor={ids.search} className="sr-only">
            Search checks
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            id={ids.search}
            type="search"
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="Search by title, text, URL, or file name"
            className="field pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={ids.status} className="text-sm text-ink-soft">
            Status
          </label>
          <select
            id={ids.status}
            value={status}
            onChange={(e) => updateParams({ status: e.target.value, page: '1' })}
            className="field w-auto"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {result ? `${pluralize(result.total, 'check')} found` : ''}
      </p>

      <div className="mt-4">
        {state.kind === 'loading' && (
          <p className="flex items-center justify-center gap-2 py-16 text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading history…
          </p>
        )}

        {state.kind === 'error' && (
          <div role="alert" className="panel p-6 text-center text-sm text-rose-800">
            History could not be loaded.
            <button type="button" className="btn-secondary ml-3" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {result && result.total === 0 && (
          <div className="panel flex flex-col items-center p-10 text-center">
            <Inbox className="h-10 w-10 text-ink-muted" aria-hidden="true" />
            <h2 className="mt-3 font-semibold tracking-tight text-xl text-ink">{filtered ? 'No matching checks' : 'No checks yet'}</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">
              {filtered
                ? 'Try a different search term or status.'
                : 'Checks you run in demo mode are saved in this browser and appear here.'}
            </p>
            {filtered ? (
              <button type="button" className="btn-secondary mt-5" onClick={clearFilters}>
                Clear filters
              </button>
            ) : (
              <Link to="/" className="btn-primary mt-5">
                Start a check
              </Link>
            )}
          </div>
        )}

        {result && result.total > 0 && (
          <>
            <ul className="divide-y divide-line border border-line" aria-label="Checks">
              {result.items.map((check) => (
                <li key={check.id}>
                  <Link
                    to={`/checks/${check.id}`}
                    className="group flex flex-col gap-2 bg-white p-4 transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-brand-50 text-brand-600 max-sm:hidden">
                      {check.inputType === 'url' ? (
                        <Link2 className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink group-hover:text-brand-700">{check.title}</span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs text-ink-muted">
                        <span>
                          {inputTypeLabel[check.inputType]}
                          {check.files?.length ? ` + ${pluralize(check.files.length, 'file')}` : ''}
                        </span>
                        <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time>
                        {check.claimCount !== undefined && <span>{pluralize(check.claimCount, 'claim')}</span>}
                      </span>
                    </span>
                    <span className="self-start sm:self-auto">
                      <StatusBadge status={check.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                className="btn-secondary"
                disabled={result.page <= 1}
                onClick={() => updateParams({ page: String(result.page - 1) })}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <span className="text-ink-soft">
                Page {result.page} of {result.totalPages} · {pluralize(result.total, 'check')}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={result.page >= result.totalPages}
                onClick={() => updateParams({ page: String(result.page + 1) })}
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          </>
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong bg-white px-4 py-3 text-xs text-ink-soft">
        <span className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Demo controls · Data is stored in this browser only.
        </span>
        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={resetDemo}>
          Reset demo data
        </button>
      </div>
    </div>
  );
}
