import { type DragEvent, type FormEvent, forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, FileText, Link2, Loader2, Paperclip, X } from 'lucide-react';
import { config } from '../../config';
import { urlInInput, validateTextSubmission, validateUrl } from '../../lib/validation';
import { readTextFiles } from '../../lib/files';
import { formatBytes } from '../../lib/format';
import { checkService, ValidationError } from '../../services';
import type { SubmittedFile } from '../../types/models';
import { JudgePicker } from './JudgePicker';
import { EarlierChecksNote, useEarlierChecks } from './EarlierChecks';
import { t } from '../../lib/i18n';

export interface ComposerHandle {
  /** Puts text in the box, as an example does, and focuses it. */
  fill: (text: string, options?: { submitOnEnter?: boolean }) => void;
  focus: () => void;
}

/**
 * The box a check starts from: text, a link, or attached files, plus the judge picker. `home` is the large box on the
 * start page; `chat` is the compact one under a conversation. Either way, sending opens the new check's chat.
 */
export const CheckComposer = forwardRef<ComposerHandle, { variant: 'home' | 'chat' }>(function CheckComposer(
  { variant },
  ref,
) {
  const home = variant === 'home';
  const navigate = useNavigate();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ids = {
    error: useId(),
    count: useId(),
    fileHint: useId(),
    fileError: useId(),
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [submitOnEnter, setSubmitOnEnter] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [judgeIds, setJudgeIds] = useState<string[]>([...config.judges.defaultIds]);
  const [files, setFiles] = useState<SubmittedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [fileStatus, setFileStatus] = useState('');
  const [dragging, setDragging] = useState(false);

  // Grow the textarea with its content (capped by max-h in CSS), like a chat composer.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // One box takes both. A link on its own is read as an article, unless files are attached, which only go with text.
  const url = files.length === 0 ? urlInInput(text) : null;
  const clientError = url ? validateUrl(url) : validateTextSubmission(text, files);
  const error = serverError ?? (attempted ? clientError : null);
  // Earlier checks of the same claim or link, shown under the home box before anything is paid for.
  const earlier = useEarlierChecks(text, url && !clientError ? url : null, home && files.length === 0);
  const overLimit = text.length > config.text.maxLength;

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting) return;
    setAttempted(true);
    setServerError(null);
    if (clientError) {
      textRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const check = await checkService.createCheck(
        url ? { inputType: 'url', url, judgeIds } : { inputType: 'text', text, files, judgeIds },
      );
      navigate(`/checks/${check.id}`);
    } catch (err) {
      setServerError(err instanceof ValidationError ? err.message : t('Could not start the check. Please try again.'));
      setSubmitting(false);
    }
  }

  async function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    setServerError(null);
    const { added, errors } = await readTextFiles(picked, files);
    setFiles((prev) => [...prev, ...added]);
    setFileErrors(errors);
    setFileStatus(added.length > 0 ? t('Added {names}.', { names: added.map((file) => file.name).join(', ') }) : '');
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((file) => file.name !== name));
    setFileErrors([]);
    setServerError(null);
    setFileStatus(t('Removed {name}.', { name }));
    textRef.current?.focus();
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  const describedBy = [error ? ids.error : null, url ? null : ids.count].filter(Boolean).join(' ');
  const atFileLimit = files.length >= config.files.maxFiles;


  useImperativeHandle(ref, () => ({
    fill(value, options) {
      setAttempted(false);
      setServerError(null);
      setText(value);
      setSubmitOnEnter(options?.submitOnEnter ?? false);
      requestAnimationFrame(() => textRef.current?.focus());
    },
    focus: () => textRef.current?.focus({ preventScroll: true }),
  }));

  return (
      <form onSubmit={onSubmit} noValidate aria-label={t('New check')} id={home ? 'check-composer' : undefined} className="scroll-mt-20">
        <div
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
          className={`home-composer rounded-[24px] transition-colors focus-within:border-brand-200 ${home ? 'p-3.5 sm:p-4' : 'p-3'} ${
            dragging ? 'border-brand-200 ring-4 ring-brand-500/10' : ''
          }`}
        >
          <div>
              <>
                <label htmlFor="check-text" className="sr-only">
                  {t('Text to check')}
                </label>
                <textarea
                  id="check-text"
                  ref={textRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (!e.target.value) setSubmitOnEnter(false);
                    setServerError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing &&
                        (e.metaKey || e.ctrlKey || ((url || submitOnEnter) && !e.shiftKey))) {
                      e.preventDefault();
                      void onSubmit();
                    }
                  }}
                  rows={1}
                  placeholder={home ? t('Paste a claim, a paragraph or a link…') : t('Check another claim or link…')}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  className={`block w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none ${
                    home ? 'max-h-80 min-h-[3.5rem] sm:min-h-[4.5rem] sm:text-lg' : 'max-h-48 min-h-[2.5rem]'
                  }`}
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
                        <span className="shrink-0 font-sans text-xs text-ink-muted">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(file.name)}
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
                  <ul id={ids.fileError} role="alert" className="space-y-0.5 px-1.5 pt-2 text-sm text-rose-700">
                    {fileErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                <p id={ids.fileHint} className="sr-only">
                  {t('Up to {count} .txt or .md files, {size} KB each. Their text is sent to the server for checking.', {
                    count: config.files.maxFiles,
                    size: Math.round(config.files.maxBytes / 1024),
                  })}
                </p>
                <p className="sr-only" role="status" aria-live="polite">
                  {fileStatus}
                </p>
              </>
            {url && !clientError && (
              <p className="flex items-center gap-1.5 px-1.5 pt-2 text-[13px] text-ink-muted">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('This link will be read as an article.')}
              </p>
            )}
            {error && (
              <p id={ids.error} role="alert" className="px-1.5 pt-2 text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>

          <div className="relative mt-2 flex items-center gap-1.5">
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={config.files.accept}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  data-testid="file-input"
                  onChange={(e) => {
                    void addFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={atFileLimit}
                  aria-label={t('Add files')}
                  aria-describedby={ids.fileHint}
                  title={t('Add .txt or .md files (or drop them here)')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/70 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            <div className="ml-auto flex items-center gap-2.5">
              <JudgePicker value={judgeIds} onChange={setJudgeIds} />
              {!url && text.length > 0 && (
                <span
                  id={ids.count}
                  className={`hidden font-sans text-xs tabular-nums sm:inline ${overLimit ? 'text-rose-700' : 'text-ink-faint'}`}
                >
                  {text.length.toLocaleString('en-US')} / {config.text.maxLength.toLocaleString('en-US')}
                  <span className="sr-only"> {t('characters')}</span>
                </span>
              )}
              <button
                type="submit"
                aria-label={t('Check claims')}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
        <EarlierChecksNote earlier={earlier} />
      </form>
  );
});
