import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { isTerminal, type Check, type ListChecksParams, type Page } from '../../types/models';
import { checkService } from '../../services';
import { NotFoundError, ValidationError } from '../../services/errors';
import { formatDate, formatTime, pluralize } from '../../lib/format';
import { StatusBadge } from '../../components/Badges';
import { Dialog } from '../../components/Dialog';
import { t, useLanguage } from '../../lib/i18n';
import { inputCategoryLabel } from '../results/UncheckableResult';

type StatusFilter = NonNullable<ListChecksParams['status']>;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; page: Page<Check> };

const actionButton = 'btn-panel-primary';
const surfacePanel = 'rounded-2xl border border-line bg-white';
const pageButton =
  'btn-secondary min-h-11 rounded-full px-3 font-medium text-ink-soft enabled:hover:border-brand-200 enabled:hover:text-brand-700 sm:px-4';
const rowControl = 'flex min-h-16 w-full min-w-0 scroll-mt-36 items-center justify-between gap-3 rounded-xl px-3 py-2.5 sm:px-4';

function canDelete(check: Check) {
  return isTerminal(check.status) || check.status === 'awaiting_input';
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

function HistoryRow({ check, checked, onToggle, onNavigate }: {
  check: Check;
  checked?: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const selectable = canDelete(check);
  const details = (
    <span className="min-w-0">
      <span className="line-clamp-3 text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere] sm:line-clamp-2 sm:text-[15px]">
        {check.title}
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-snug text-ink-muted">
        <time className="tabular-nums" dateTime={check.createdAt}>{formatTime(check.createdAt)}</time>
        {check.status !== 'completed' && <StatusBadge status={check.status} />}
        {check.status === 'completed' && check.claimCount === 0 ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-ink-soft">
            {inputCategoryLabel(check.inputCategory)}
          </span>
        ) : check.claimCount !== undefined && (
          <span><span aria-hidden="true">· </span>{pluralize(check.claimCount, 'claim')}</span>
        )}
      </span>
    </span>
  );

  return (
    <li className={`first:rounded-t-2xl last:rounded-b-2xl ${checked ? 'bg-brand-50' : 'history-row'}`}>
      {checked === undefined ? (
        <Link
          to={`/checks/${check.id}`}
          title={check.title}
          onClick={(event) => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate?.();
          }}
          className={`group ${rowControl} focus-visible:outline-offset-[-2px]`}
        >
          {details}
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted group-hover:text-brand-700" aria-hidden="true" />
        </Link>
      ) : (
        <label className={`${rowControl} ${selectable ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
          {details}
          <input
            type="checkbox"
            aria-label={t('Select {title}', { title: check.title })}
            checked={checked}
            disabled={!selectable}
            onChange={onToggle}
            className="h-4 w-4 shrink-0 accent-brand-700"
          />
        </label>
      )}
    </li>
  );
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  return <HistoryContent params={params} setParams={(next) => setParams(next, { replace: true })} />;
}

export function HistoryPanel({ onNavigate }: { onNavigate: () => void }) {
  const [params, setParams] = useState(() => new URLSearchParams());
  return <HistoryContent params={params} setParams={setParams} panel onNavigate={onNavigate} />;
}

function HistoryContent({ params, setParams, panel, onNavigate }: {
  params: URLSearchParams;
  setParams: (next: URLSearchParams) => void;
  panel?: boolean;
  onNavigate?: () => void;
}) {
  const language = useLanguage();
  const query = params.get('q') ?? '';
  const status = (statusOptions.find((o) => o.value === params.get('status'))?.value ?? 'all') as StatusFilter;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [draftQuery, setDraftQuery] = useState(query);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const ids = { search: useId(), dateGroup: useId() };
  const deleteButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setDraftQuery(query), [query]);

  // Search and status stay independent when a filter is clicked while typing.
  useEffect(() => {
    if (confirmOpen || draftQuery === query) return;
    const timer = setTimeout(() => updateParams({ q: draftQuery, page: '1' }), 250);
    return () => clearTimeout(timer);
  }, [draftQuery, query, params, confirmOpen]);

  useEffect(() => {
    const request = new AbortController();
    setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }));
    checkService
      .listChecks({ query, status, page, ...(panel ? { pageSize: 10 } : {}) }, { redirectOnUnauthorized: !panel, signal: request.signal })
      .then((result) => {
        if (request.signal.aborted) return;
        const lastPage = Math.max(1, result.totalPages);
        if (result.page > lastPage) updateParams({ page: String(lastPage) });
        else setState({ kind: 'ready', page: result });
      })
      .catch(() => !request.signal.aborted && setState({ kind: 'error' }));
    return () => request.abort();
  }, [query, status, page, attempt, language, panel]);

  function updateParams(next: Record<string, string>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (!value || (key === 'status' && value === 'all') || (key === 'page' && value === '1')) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged);
  }

  function clearFilters() {
    setDraftQuery('');
    setParams(new URLSearchParams());
  }

  function toggleCheck(id: string) {
    setSelected((current) => {
      if (!current) return null;
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmDelete() {
    if (!selected?.size || deleting) return;
    setDeleting(true);
    setDeleteError('');
    const remaining = new Set<string>();
    let firstError = '';
    try {
      for (const id of selected) {
        try {
          await checkService.deleteCheck(id);
        } catch (error) {
          // A check removed in another tab is already in the requested state.
          if (!(error instanceof NotFoundError)) {
            remaining.add(id);
            firstError ||= error instanceof ValidationError ? error.message : t('This could not be deleted. Please try again.');
          }
        }
      }
      if (remaining.size < selected.size) setAttempt((n) => n + 1);
      if (remaining.size) {
        setSelected(remaining);
        setDeleteError(firstError);
      } else {
        setSelected(null);
        setConfirmOpen(false);
        requestAnimationFrame(() => deleteButton.current?.focus({ preventScroll: true }));
      }
    } finally {
      setDeleting(false);
    }
  }

  const filtered = query !== '' || status !== 'all';
  const result = state.kind === 'ready' ? state.page : null;
  const groups = result ? groupByDate(result.items) : [];
  const selectedCount = selected?.size ?? 0;

  return (
    <div
      className={panel ? 'p-4 sm:p-5' : 'mx-auto w-full max-w-[1120px] px-4 pb-24 pt-12 sm:px-6 sm:pt-16'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !selected || confirmOpen) return;
        event.preventDefault();
        setSelected(null);
        deleteButton.current?.focus({ preventScroll: true });
      }}
    >
      {!panel && (
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-tight text-ink">{t('History')}</h1>
          <Link to="/" className={actionButton}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('New check')}
          </Link>
        </header>
      )}

      <div className={panel
        ? 'sticky top-0 z-10 -mx-4 -mt-4 space-y-2 border-b border-line bg-white px-4 pb-2.5 pt-4 sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-5'
        : `${surfacePanel} space-y-2 p-3 sm:p-4`}>
        <div className="flex items-center gap-2">
          <div id={panel ? undefined : 'find-check'} className="relative min-w-0 flex-1 scroll-mt-28">
            <label htmlFor={ids.search} className="sr-only">{t('Search checks')}</label>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-700"
              aria-hidden="true"
            />
            <input
              id={ids.search}
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t('Search checks')}
              className="h-11 w-full rounded-full border border-line bg-zinc-50 pl-11 pr-4 text-sm text-ink transition-colors placeholder:text-ink-muted hover:border-brand-200 focus:bg-white"
            />
          </div>
          <button
            ref={deleteButton}
            type="button"
            disabled={deleting || (!selected && !result?.items.some(canDelete))}
            onClick={() => setSelected((current) => current ? null : new Set())}
            className="btn-secondary min-h-11 shrink-0 rounded-full px-3 font-medium text-ink-soft sm:px-4"
          >
            {!selected && <Trash2 className="h-4 w-4" aria-hidden="true" />}
            {selected ? t('Cancel') : t('Delete')}
          </button>
        </div>
        <div role="group" aria-label={t('Filter by status')} className="flex flex-wrap gap-x-1.5 gap-y-1">
          {statusOptions.map((option) => {
            const selected = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => updateParams({ status: option.value, page: '1' })}
                className={`min-h-11 shrink-0 rounded-full px-2.5 text-xs font-medium transition-colors sm:px-3.5 sm:text-[13px] ${
                  selected
                    ? 'bg-brand-100 text-brand-900'
                    : 'text-ink-muted hover:bg-zinc-100 hover:text-ink'
                }`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
        {selected && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-1 pt-2">
            <p role="status" className="text-xs text-ink-muted">
              {selectedCount
                ? t('{count} selected', { count: pluralize(selectedCount, 'check') })
                : t('Select the checks to delete.')}
            </p>
            <button
              type="button"
              disabled={!selectedCount || deleting}
              onClick={() => {
                setDeleteError('');
                setConfirmOpen(true);
              }}
              className="btn min-h-11 rounded-full bg-rose-700 px-4 text-white enabled:hover:bg-rose-800 disabled:bg-zinc-100 disabled:text-ink-muted disabled:opacity-100"
            >
              {t('Delete ({count})', { count: selectedCount })}
            </button>
          </div>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {result ? t('{count} found', { count: pluralize(result.total, 'check') }) : ''}
      </p>

      <div className="mt-4">
        {state.kind === 'loading' && (
          <p className={`${surfacePanel} flex items-center justify-center gap-2 py-12 text-sm text-ink-muted`} role="status">
            <Loader2 className="h-4 w-4 text-brand-700 motion-safe:animate-spin" aria-hidden="true" /> {t('Loading history…')}
          </p>
        )}

        {state.kind === 'error' && (
          <div role="alert" className={`${surfacePanel} px-4 py-10 text-center text-sm text-ink-soft`}>
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
          <div className={`${surfacePanel} px-5 py-10 text-center`}>
            <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700" aria-hidden="true">
              <Search className="h-5 w-5" />
            </span>
            <h2 className="text-[18px] font-medium tracking-[-0.015em] text-ink">
              {filtered ? t('No matching checks') : t('No checks yet')}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-[1.7] text-ink-soft">
              {filtered
                ? t('Try a different search term or status.')
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
              <Link to="/" onClick={onNavigate} className={`${actionButton} mt-6`}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('Start a check')}
              </Link>
            )}
          </div>
        )}

        {result && result.total > 0 && (
          <>
            <div className="space-y-4">
              {groups.map((group, groupIndex) => (
                <section
                  key={group.date}
                  aria-labelledby={`${ids.dateGroup}-${groupIndex}`}
                >
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
                    <h2
                      id={`${ids.dateGroup}-${groupIndex}`}
                      className="text-[13px] font-semibold text-ink first-letter:uppercase"
                    >
                      {group.date}
                    </h2>
                    <span className="text-xs text-ink-muted">{pluralize(group.items.length, 'check')}</span>
                  </div>
                  <ul className={`${surfacePanel} min-w-0 divide-y divide-line`}>
                    {group.items.map((check) => (
                      <HistoryRow
                        key={check.id}
                        check={check}
                        checked={selected?.has(check.id)}
                        onToggle={() => toggleCheck(check.id)}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {result.totalPages > 1 && (
              <nav aria-label={t('Pagination')} className="mt-4 flex items-center justify-between gap-2">
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

      <Dialog
        open={confirmOpen}
        title={t('Delete selected checks?')}
        description={t('{count} selected', { count: pluralize(selectedCount, 'check') })}
        onClose={() => !deleting && setConfirmOpen(false)}
      >
        <p className="text-[15px] leading-[1.6] text-ink-soft">
          {t('Selected checks and their claims, sources, verdicts and follow-up questions will be permanently deleted.')}
        </p>
        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {deleteError}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-autofocus
            disabled={deleting}
            onClick={() => setConfirmOpen(false)}
            className="inline-flex h-10 items-center rounded-full border border-line-strong bg-white px-4 text-sm text-ink hover:border-ink-muted disabled:opacity-50"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void confirmDelete()}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-rose-700 px-4 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-60"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('Delete')}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
