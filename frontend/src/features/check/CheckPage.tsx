import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, SearchX } from 'lucide-react';
import { checkService, NotFoundError } from '../../services';
import type { CheckDetail } from '../../types/models';
import { isTerminal } from '../../types/models';
import { ProcessingView } from './ProcessingView';
import { FailedView } from './FailedView';
import { ResultsView } from '../results/ResultsView';

const POLL_INTERVAL_MS = 600;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; check: CheckDetail };

/** Routes a check to its processing, failed, or results view and polls while it runs. */
export function CheckPage() {
  const { checkId = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      const check = await checkService.getCheck(checkId);
      setState({ kind: 'ready', check });
      return check;
    } catch (err) {
      setState(
        err instanceof NotFoundError
          ? { kind: 'not-found' }
          : { kind: 'error', message: 'This check could not be loaded. Please try again.' },
      );
      return null;
    }
  }, [checkId]);

  useEffect(() => {
    setState({ kind: 'loading' });
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const check = await load();
      if (cancelled || !check || isTerminal(check.status)) return;
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <div className="flex justify-center px-4 py-24 text-ink-soft" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Loading check…
      </div>
    );
  }

  if (state.kind === 'not-found' || state.kind === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <SearchX className="mx-auto h-10 w-10 text-ink-muted" aria-hidden="true" />
        <h1 className="mt-4 font-semibold tracking-tight text-2xl text-ink">
          {state.kind === 'not-found' ? 'Check not found' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-ink-soft">
          {state.kind === 'not-found'
            ? 'This check is not saved in this browser. Demo data lives in local storage only.'
            : state.message}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {state.kind === 'error' && (
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              Try again
            </button>
          )}
          <Link to="/history" className="btn-secondary">
            Open history
          </Link>
          <Link to="/" className="btn-primary">
            New check
          </Link>
        </div>
      </div>
    );
  }

  const { check } = state;
  if (check.status === 'failed') return <FailedView check={check} />;
  if (!isTerminal(check.status)) return <ProcessingView check={check} />;
  return <ResultsView check={check} onReload={load} />;
}
