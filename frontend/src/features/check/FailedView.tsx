import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import type { CheckDetail } from '../../types/models';
import { checkService } from '../../services';
import { t } from '../../lib/i18n';
import { TaskRows } from './TaskList';

export function FailedView({ check }: { check: CheckDetail }) {
  const stopped = check.status === 'stopped';
  const failedTasks = stopped ? [] : (check.progress ?? []).filter((task) => task.status === 'failed');
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const next = await checkService.createCheck(
        check.inputType === 'text'
          ? { inputType: 'text', text: check.inputText, files: check.files, judgeIds: check.judgeIds }
          : { inputType: 'url', url: check.inputUrl, judgeIds: check.judgeIds },
      );
      navigate(`/checks/${next.id}`);
    } catch {
      setRetryError(t('Could not start a new check. Please try again.'));
      setRetrying(false);
    }
  }

  return (
    <div className={`rounded-2xl border bg-white p-5 ${stopped ? 'border-line' : 'border-rose-200'}`}>
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-ink">
        {!stopped && <TriangleAlert className="h-5 w-5 text-rose-600" aria-hidden="true" />}
        {t(stopped ? 'Check stopped' : 'Check failed')}
      </h2>
      {stopped ? (
        <p className="mt-2 text-sm text-ink-soft">{t(check.errorMessage ?? 'You stopped this check.')}</p>
      ) : (
        <div role="alert" className="mt-3 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-900">
          {t(check.errorMessage ?? 'The check could not be completed.')}
        </div>
      )}
      {failedTasks.length > 0 && (
        <section aria-label={t('What failed')} className="mt-4">
          <h3 className="text-sm font-semibold text-ink">{t('What failed')}</h3>
          <TaskRows tasks={failedTasks} showModelNames />
        </section>
      )}
      <p className="mt-4 text-sm text-ink-soft">{t('No verdicts were produced.')}</p>
      {retryError && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {retryError}
        </p>
      )}
      <button type="button" className="btn-primary mt-4" onClick={() => void retry()} disabled={retrying}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {retrying ? t('Starting…') : t('Run again')}
      </button>
    </div>
  );
}
