import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import type { Check } from '../../types/models';
import { checkService } from '../../services';
import { formatDateTime } from '../../lib/format';
import { DemoModeLabel } from '../../components/Badges';

export function FailedView({ check }: { check: Check }) {
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const next = await checkService.createCheck(
        check.inputType === 'text'
          ? { inputType: 'text', text: check.inputText, files: check.files, scenario: 'completed' }
          : { inputType: 'url', url: check.inputUrl, scenario: 'completed' },
      );
      navigate(`/checks/${next.id}`);
    } catch {
      setRetryError('Could not start a new check. Please try again.');
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:pt-16">
      <div className="panel p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-semibold tracking-tight text-2xl text-ink">
            <TriangleAlert className="h-6 w-6 text-rose-600" aria-hidden="true" />
            Check failed
          </h1>
          <DemoModeLabel />
        </div>
        <p className="mt-2 break-words text-sm text-ink-soft">{check.title}</p>
        <div role="alert" className="mt-6 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {check.errorMessage ?? 'The check could not be completed.'}
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          No verdicts were produced, so there is nothing to review. This is the “Failed check” demo scenario.
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          Started <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time> · ID{' '}
          <span className="font-mono">{check.id}</span>
        </p>
        {retryError && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            {retryError}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => void retry()} disabled={retrying}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {retrying ? 'Starting…' : 'Run again'}
          </button>
          <Link to="/history" className="btn-secondary">
            Back to history
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-muted">“Run again” starts a new check with the same input using the Completed scenario.</p>
      </div>
    </div>
  );
}
