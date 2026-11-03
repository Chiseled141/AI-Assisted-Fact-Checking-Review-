import { type DragEvent, type FormEvent, type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  FileText,
  Info,
  Link2,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';
import { config } from '../../config';
import { exampleInputs } from '../../data/examples';
import { validateTextSubmission, validateUrl } from '../../lib/validation';
import { readTextFiles } from '../../lib/files';
import { formatBytes } from '../../lib/format';
import { checkService, ValidationError, demoMode } from '../../services';
import type { DemoScenario, InputType, SubmittedFile } from '../../types/models';
import { WorldEvidenceMap } from '../../components/WorldEvidenceMap';
import { useReveal } from '../../lib/useReveal';
import { DemoScenarioPicker } from '../demo/DemoScenarioPicker';
import { getPreferredScenario, setPreferredScenario } from '../demo/demoSettings';
import { JudgePicker } from './JudgePicker';
import { getLanguage, t } from '../../lib/i18n';

const tabs: { value: InputType; label: string; Icon: typeof FileText }[] = [
  { value: 'text', label: 'Text', Icon: FileText },
  { value: 'url', label: 'URL', Icon: Link2 },
];

const steps = [
  {
    title: 'Extract claims',
    points: [
      'Each claim is one factual statement, like a date, figure, or quote.',
      'A claim keeps its time period when the text states one.',
      'Opinions, predictions, and questions are left out.',
      'At most five claims are kept per check, the most checkable first.',
    ],
  },
  {
    title: 'Check published fact-checks',
    points: [
      'Looks each claim up in Google’s Fact Check Tools database.',
      'A match shows the fact-checker, its rating, and a link to the original.',
      'If it is plainly the same claim with a clear true or false rating, that rating becomes the verdict and the models are skipped.',
    ],
  },
  {
    title: 'Find evidence',
    points: [
      'Searches rated sites for each claim, using Tavily. Sources rated unreliable are left out.',
      'Reads at most ten sources per check. An article being checked can’t be its own evidence.',
      'Saves the source title, publisher, link, and the exact excerpt used.',
    ],
  },
  {
    title: 'Judge with two models',
    points: [
      'Two AI models read the same passages, and each gives a verdict with a confidence score.',
      demoMode
        ? 'When they agree, that verdict is shown. In this demo, the judges and verdicts are simulated.'
        : 'When they agree, that verdict is shown. When they disagree, the first model’s is the headline and you see both.',
      'Both models also score and comment on each source.',
    ],
  },
  {
    title: 'Verdicts with citations',
    points: [
      'Verdicts are Supported, Contradicted, Outdated, or Insufficient evidence — never a truth score.',
      'Sources that no longer apply to the claim’s period are tagged Outdated, with a reason.',
      'If no readable source is found, the claim is marked Insufficient evidence without calling the models.',
      'If a provider fails, the claim shows Verification unavailable instead of a verdict.',
    ],
  },
  // Follows the button: the guide shouldn't describe a step nobody can reach.
  ...(config.correction.showReviewButton
    ? [
        {
          title: 'Review and correct',
          points: [
            'Every correction is a new revision you can compare with earlier ones.',
            'A correction needs a reason and can only cite evidence already saved for the claim.',
            'If someone else edited the claim first, the stale correction is rejected instead of overwriting.',
          ],
        },
      ]
    : []),
];

/** The step-by-step explanation, read like a short article and opened one step at a time. */
function HowItWorksSteps() {
  const [listRef, visible] = useReveal<HTMLOListElement>(0.2);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  return (
    <ol ref={listRef} className="mx-auto mt-8 max-w-[640px] border-t border-line sm:mt-10">
      {steps.map(({ title, points }, index) => {
        const selected = openIndex === index;
        const detailId = `${baseId}-${index}`;
        return (
          <li
            key={title}
            style={{ transitionDelay: visible ? `${index * 80}ms` : '0ms' }}
            className={`reveal border-b border-line ${visible ? 'is-visible' : ''}`}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(selected ? null : index)}
              aria-expanded={selected}
              aria-controls={detailId}
              className="group flex w-full items-center gap-4 py-3.5 text-left sm:py-4"
            >
              <span
                className={`w-6 shrink-0 font-logo text-[11px] font-medium tracking-[0.12em] transition-colors ${
                  selected ? 'text-brand-600' : 'text-ink-faint'
                }`}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 text-[18px] font-medium leading-snug tracking-[-0.015em] text-ink sm:text-[21px]">
                {t(title)}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                  selected ? 'rotate-180 text-brand-600' : 'text-ink-faint group-hover:text-ink-muted'
                }`}
                aria-hidden="true"
              />
            </button>
            {selected && (
              <div id={detailId} className="rise-in pb-5 pl-10 pr-1">
                <ul className="list-disc space-y-2 pl-4 text-[15px] leading-[1.75] text-ink-soft marker:text-ink-faint">
                  {points.map((point) => (
                    <li key={point}>{t(point)}</li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function NewCheckPage() {
  const navigate = useNavigate();
  const ids = {
    panel: useId(),
    error: useId(),
    count: useId(),
    urlNote: useId(),
    fileHint: useId(),
    fileError: useId(),
  };
  const tabRefs = useRef<Record<InputType, HTMLButtonElement | null>>({ text: null, url: null });
  const textRef = useRef<HTMLTextAreaElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<InputType>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scenario, setScenario] = useState<DemoScenario>(getPreferredScenario);
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
  }, [text, mode]);

  const clientError = mode === 'text' ? validateTextSubmission(text, files) : validateUrl(url);
  const error = serverError ?? (attempted ? clientError : null);
  const overLimit = text.length > config.text.maxLength;

  function selectMode(next: InputType, focusTab = false) {
    setMode(next);
    setAttempted(false);
    setServerError(null);
    if (focusTab) tabRefs.current[next]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'text' : event.key === 'End' ? 'url' : mode === 'text' ? 'url' : 'text';
    selectMode(next, true);
  }

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    setAttempted(true);
    setServerError(null);
    if (clientError) {
      (mode === 'text' ? textRef : urlRef).current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const check = await checkService.createCheck(
        mode === 'text'
          ? { inputType: 'text', text, files, scenario, judgeIds }
          : { inputType: 'url', url, scenario, judgeIds },
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
    if (mode !== 'text' || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (mode !== 'text') return;
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function applyExample(id: string) {
    const example = exampleInputs.find((item) => item.id === id);
    if (!example) return;
    setMode(example.inputType);
    setAttempted(false);
    setServerError(null);
    const value = getLanguage() === 'vi' ? example.valueVi : example.value;
    if (example.inputType === 'text') {
      setText(value);
      requestAnimationFrame(() => textRef.current?.focus());
    } else {
      setUrl(value);
      requestAnimationFrame(() => urlRef.current?.focus());
    }
  }

  function changeScenario(next: DemoScenario) {
    setScenario(next);
    setPreferredScenario(next);
  }

  const describedBy = [error ? ids.error : null, mode === 'text' ? ids.count : ids.urlNote].filter(Boolean).join(' ');
  const atFileLimit = files.length >= config.files.maxFiles;

  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <WorldEvidenceMap />
        <div className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-5xl flex-col items-center justify-center px-4 py-12 sm:px-8">
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-center text-[13px] text-ink-muted sm:text-sm">
            <Info className="h-4 w-4" aria-hidden="true" />
            {t('AI can be wrong. Review the evidence.')}
          </p>

          <h1 className="mt-6 max-w-3xl text-center text-[30px] font-normal leading-[1.08] tracking-[-0.04em] text-ink sm:text-[42px] lg:text-[48px]">
            <span className="font-bold text-primary">{t('Trace claims.')}</span>
            <span className="block text-ink-muted">{t('Examine evidence.')}</span>
          </h1>

          <div className="mt-8 w-full max-w-5xl sm:mt-10">
            <form onSubmit={onSubmit} noValidate aria-label={t('New check')} id="check-composer" className="scroll-mt-20">
              <div
                onDragOver={onDragOver}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
                }}
                onDrop={onDrop}
                className={`home-composer rounded-[24px] p-3.5 transition-colors focus-within:border-brand-200 sm:p-4 ${
                  dragging ? 'border-brand-200 ring-4 ring-brand-500/10' : ''
                }`}
              >
                <div id={ids.panel} role="tabpanel" aria-label={mode === 'text' ? t('Text input') : t('URL input')}>
                  {mode === 'text' ? (
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
                          setServerError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void onSubmit();
                        }}
                        rows={1}
                        placeholder={t('Paste a claim or paragraph…')}
                        aria-invalid={Boolean(error)}
                        aria-describedby={describedBy}
                        className="block max-h-80 min-h-[3.5rem] w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none sm:min-h-[4.5rem] sm:text-lg"
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
                        {t('Up to {count} .txt or .md files, {size} KB each. Files are read in your browser and not uploaded.', {
                          count: config.files.maxFiles,
                          size: Math.round(config.files.maxBytes / 1024),
                        })}
                      </p>
                      <p className="sr-only" role="status" aria-live="polite">
                        {fileStatus}
                      </p>
                    </>
                  ) : (
                    <div className="px-1.5 py-1">
                      <label htmlFor="check-url" className="sr-only">
                        {t('Article URL')}
                      </label>
                      <input
                        id="check-url"
                        ref={urlRef}
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          setServerError(null);
                        }}
                        placeholder="https://example.org/article"
                        aria-invalid={Boolean(error)}
                        aria-describedby={describedBy}
                        className="block w-full bg-transparent py-1 text-base text-ink placeholder:text-ink-faint focus:outline-none sm:text-lg"
                      />
                      {demoMode && (
                        <p id={ids.urlNote} className="mt-1 text-xs text-ink-muted">
                          {t('Demo only — the page is not fetched.')}
                        </p>
                      )}
                    </div>
                  )}
                  {error && (
                    <p id={ids.error} role="alert" className="px-1.5 pt-2 text-sm text-rose-700">
                      {error}
                    </p>
                  )}
                </div>

                <div className="relative mt-2 flex items-center gap-1.5">
                  <div role="tablist" aria-label={t('Input type')} className="flex gap-1">
                    {tabs.map(({ value, label, Icon }) => {
                      const selected = mode === value;
                      return (
                        <button
                          key={value}
                          ref={(el) => {
                            tabRefs.current[value] = el;
                          }}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls={ids.panel}
                          tabIndex={selected ? 0 : -1}
                          onClick={() => selectMode(value)}
                          onKeyDown={onTabKeyDown}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
                            selected
                              ? 'border-brand-200 bg-brand-50 font-semibold text-brand-700'
                              : 'border-transparent text-ink-muted hover:bg-white/70 hover:text-ink'
                          }`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {/* Icon only on narrow phones, so the send button stays inside the box. */}
                          <span className="sr-only min-[420px]:not-sr-only">{t(label)}</span>
                        </button>
                      );
                    })}
                  </div>
                  {mode === 'text' && (
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
                  )}
                  <div className="ml-auto flex items-center gap-2.5">
                    <JudgePicker value={judgeIds} onChange={setJudgeIds} />
                    {demoMode && <DemoScenarioPicker value={scenario} onChange={changeScenario} />}
                    {mode === 'text' && text.length > 0 && (
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
            </form>

            <section aria-labelledby="examples-heading" className="mt-5 flex flex-col items-center sm:mt-6">
              <h2 id="examples-heading" className="sr-only">
                {t('Examples')}
              </h2>
              <ul className="flex flex-wrap justify-center gap-2.5">
                {exampleInputs.map((example) => (
                  <li key={example.id}>
                    <button type="button" className="home-pill" onClick={() => applyExample(example.id)}>
                      {example.inputType === 'text' ? (
                        <FileText className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      ) : (
                        <Link2 className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      )}
                      {t(example.label)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-5 flex flex-col items-center gap-1 sm:mt-6">
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink-faint transition-colors hover:text-ink"
              >
                <ChevronDown className="h-3.5 w-3.5 motion-safe:animate-bounce" aria-hidden="true" />
                {t('How it works')}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-16">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[13px] font-medium text-brand-600">{t('Guide')}</p>
            <h2
              id="how-heading"
              className="mt-2.5 text-[28px] font-medium leading-[1.15] tracking-[-0.025em] text-ink sm:mt-3 sm:text-[38px]"
            >
              {t('How it works')}
            </h2>
            <p className="mx-auto mt-2.5 max-w-[30rem] text-[15px] leading-[1.65] text-ink-soft">
              {t('How a check runs — and where each verdict comes from.')}
            </p>
            <a
              href="#check-composer"
              onClick={() => {
                requestAnimationFrame(() => (mode === 'text' ? textRef : urlRef).current?.focus({ preventScroll: true }));
              }}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink py-2.5 pl-4 pr-3.5 text-sm font-medium text-page transition-opacity hover:opacity-90"
            >
              {t('Start a check')}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <HowItWorksSteps />
        </div>
      </section>
    </div>
  );
}
