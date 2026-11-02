import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import type { Check } from '../../types/models';
import { checkService, demoMode } from '../../services';
import { formatDateTime } from '../../lib/format';
import { DemoModeLabel } from '../../components/Badges';
import { t } from '../../lib/i18n';

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
      setRetryError(t('Could not start a new check. Please try again.'));
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:pt-16">
      <div className="panel p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-extrabold tracking-[-0.025em] text-2xl text-ink">
            <TriangleAlert className="h-6 w-6 text-rose-600" aria-hidden="true" />
            {t('Check failed')}
          </h1>
          {demoMode && <DemoModeLabel />}
        </div>
        <p className="mt-2 break-words text-sm text-ink-soft">{check.title}</p>
        <div role="alert" className="mt-6 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {t(check.errorMessage ?? 'The check could not be completed.')}
        </div>
        <p className="mt-4 text-sm text-ink-soft">{t('No verdicts were produced.')}</p>
        <p className="mt-2 text-xs text-ink-muted">
          {t('Started')} <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time>
        </p>
        {retryError && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            {retryError}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => void retry()} disabled={retrying}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {retrying ? t('Starting…') : t('Run again')}
          </button>
          <Link to="/history" className="btn-secondary">
            {t('Back to history')}
          </Link>
        </div>
      </div>
    </div>
  );
}
