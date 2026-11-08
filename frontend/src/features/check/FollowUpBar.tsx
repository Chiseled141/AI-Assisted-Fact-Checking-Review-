import { type FormEvent, type RefObject, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, FileText, Loader2, Paperclip, Square, X } from 'lucide-react';
import type { CheckDetail, SubmittedFile } from '../../types/models';
import { isTerminal } from '../../types/models';
import { config } from '../../config';
import { readTextFiles } from '../../lib/files';
import { JudgePicker } from '../new-check/JudgePicker';
import { formatBytes } from '../../lib/format';
import { ValidationError } from '../../services';
import { t } from '../../lib/i18n';

const MAX_QUESTION = 1000;

interface Props {
  check: CheckDetail;
  modelId: string;
  onModelChange: (id: string) => void;
  questionRef: RefObject<HTMLTextAreaElement>;
  onReview: () => void;
  busy: boolean;
  replyLabel?: string;
  onCancelReply: () => void;
  /** Sends a follow-up question with any attached files and the picked model. Resolves once the answer is in the chat. */
  onAsk: (question: string, files: SubmittedFile[], modelId: string) => Promise<void>;
  /** Ends a check that is still running. */
  onStop: () => Promise<void>;
}

/** The composer for follow-up questions about this check. */
export function FollowUpBar({ check, modelId, onModelChange, questionRef, onAsk, onReview, onStop, busy: working, replyLabel, onCancelReply }: Props) {
  const finished = check.status === 'completed';
  const running = !isTerminal(check.status);
  const [stopping, setStopping] = useState(false);
  const canReview = finished && check.claims.length > 0;
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const busy = asking || working;
  const [askError, setAskError] = useState<string | null>(null);
  const [files, setFiles] = useState<SubmittedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useLayoutEffect(() => {
    const input = questionRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [question, questionRef]);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || busy || !finished) return;
    const command = text.toLocaleLowerCase().replace(/\s+/g, ' ');
    if (canReview && (command === 'sửa kết quả' || command === 'edit result')) {
      setQuestion('');
      setAskError(null);
      onReview();
      return;
    }
    setAsking(true);
    setAskError(null);
    setQuestion('');
    setFiles([]);
    setFileErrors([]);
    try {
      await onAsk(text, files, modelId);
    } catch (error) {
      setQuestion(question);
      setFiles(files);
      setFileErrors(fileErrors);
      setAskError(error instanceof ValidationError ? error.message : t('ClaimTrace could not answer. Please try again.'));
    } finally {
      setAsking(false);
    }
  }

  async function stop() {
    setStopping(true);
    setAskError(null);
    try {
      await onStop();
    } catch {
      setAskError(t('This check could not be stopped. Please try again.'));
    } finally {
      setStopping(false);
    }
  }

  async function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    const { added, errors } = await readTextFiles(picked, files);
    setFiles((current) => [...current, ...added]);
    setFileErrors(errors);
    setAskError(null);
  }

  return (
    <div>
      <form
        onSubmit={ask}
        noValidate
        aria-label={t('Ask ClaimTrace')}
        className="home-composer rounded-[24px] border-brand-200 p-3 ring-4 ring-brand-500/[0.07] focus-within:ring-brand-500/25"
        onDragOver={(event) => {
          if (finished && !busy && event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!finished || busy) return;
          event.preventDefault();
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {replyLabel && (
          <div className="mb-1 flex min-w-0 items-center gap-2 border-l-2 border-brand-300 pl-2 text-xs text-ink-muted">
            <span className="min-w-0 flex-1 truncate" title={replyLabel}>
              {t('Replying to {question}', { question: replyLabel })}
            </span>
            <button type="button" disabled={busy} onClick={onCancelReply} aria-label={t('Cancel reply')}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:text-ink disabled:opacity-40">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <label htmlFor="followup-question" className="sr-only">
          {t('Question about this check')}
        </label>
        <textarea
          ref={questionRef}
          rows={1}
          className="block max-h-40 min-h-[2.5rem] w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
          id="followup-question"
          value={question}
          maxLength={MAX_QUESTION}
          disabled={!finished}
          readOnly={busy}
          onChange={(event) => {
            setQuestion(event.target.value);
            setAskError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }}
          placeholder={
            canReview
              ? t('Ask about the results or edit them')
              : finished
                ? t('Ask about these results, like “Which source is the most direct?”')
                : t('You can ask once the check has finished.')
          }
          aria-invalid={Boolean(askError)}
          aria-describedby={askError ? errorId : undefined}
        />
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-1.5 pt-2" aria-label={t('Attached files')}>
            {files.map((file) => (
              <li
                key={file.name}
                className="flex max-w-full items-center gap-2 rounded-full border border-line bg-zinc-50 py-1 pl-2.5 pr-1 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="min-w-0 truncate text-ink">{file.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((item) => item.name !== file.name))}
                  aria-label={t('Remove {name}', { name: file.name })}
                  className="rounded-full p-1 text-ink-muted hover:bg-zinc-200 hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileErrors.length > 0 && (
          <ul role="alert" className="space-y-0.5 px-1.5 pt-2 text-sm text-rose-700">
            {fileErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {askError && (
          <p id={errorId} role="alert" className="px-1.5 pt-1 text-sm text-rose-700">
            {askError}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={config.files.accept}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="followup-file-input"
              onChange={(event) => {
                void addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!finished || busy || files.length >= config.files.maxFiles}
              aria-label={t('Add files')}
              title={t('Add .txt or .md files (or drop them here)')}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/70 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="truncate text-xs text-ink-faint">{t('Uses this check’s context and searches the web when needed.')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <JudgePicker
              value={[modelId]}
              onChange={([id]) => onModelChange(id)}
              count={1}
              heading={t('Pick the model that answers')}
              note={t('Each answer is a paid model call.')}
              buttonLabel={(name) => t('Answering model: {name}', { name })}
            />
            {running ? (
              <button
                type="button"
                onClick={() => void stop()}
                disabled={stopping}
                aria-label={t('Stop checking')}
                title={t('Stop checking')}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {stopping ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Square className="h-3 w-3 fill-current" aria-hidden="true" />}
              </button>
            ) : (
              <button
                type="submit"
                aria-label={t('Send question')}
                disabled={!finished || busy || !question.trim()}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
