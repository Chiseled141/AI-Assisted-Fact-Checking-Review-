import { useState } from 'react';
import { BotMessageSquare, Check, Copy, Reply } from 'lucide-react';
import type { ChatMessage } from '../../types/models';
import { config } from '../../config';
import { t } from '../../lib/i18n';

interface Props {
  message: ChatMessage;
  busy: boolean;
  onReply: () => void;
  onReview: (modelId: string) => Promise<void>;
}

const iconButton = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-40';

export function FollowUpActions({ message, busy, onReply, onReview }: Props) {
  const [showModels, setShowModels] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otherModels = config.judges.options.filter(({ name }) => name !== message.modelName);

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(message.answer);
      setCopied(true);
    } catch {
      setError(t('Could not copy the answer.'));
    }
  }

  async function review(modelId: string) {
    setShowModels(false);
    setError(null);
    try {
      await onReview(modelId);
    } catch {
      setError(t('Could not request a review. Try again.'));
    }
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-0.5">
        <button type="button" className={iconButton} disabled={busy} onClick={onReply}
          aria-label={t('Reply to this answer')} title={t('Reply to this answer')}>
          <Reply className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={iconButton} onClick={copy}
          aria-label={t('Copy answer')} title={copied ? t('Copied') : t('Copy answer')}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button type="button" className={iconButton} disabled={busy} aria-expanded={showModels}
          onClick={() => setShowModels((visible) => !visible)}
          aria-label={t('Ask another model to review')} title={t('Ask another model to review')}>
          <BotMessageSquare className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {copied && <span role="status" className="sr-only">{t('Copied')}</span>}
      {showModels && (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {otherModels.map(({ id, name, logo }) => (
            <li key={id}>
              <button type="button" onClick={() => void review(id)} disabled={busy}
                aria-label={t('Request a review from {model}', { model: name })}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-ink-soft hover:border-brand-300 disabled:opacity-40">
                <img src={logo} alt="" className="h-4 w-4 object-contain" />
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
