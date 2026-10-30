import { type DragEvent, type FormEvent, type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  FileSearch,
  FileText,
  Info,
  Link2,
  ListChecks,
  Loader2,
  Paperclip,
  PencilLine,
  Quote,
  X,
} from 'lucide-react';
import { config } from '../../config';
import { exampleInputs } from '../../mocks/fixtures';
import { validateTextSubmission, validateUrl } from '../../lib/validation';
import { readTextFiles } from '../../lib/files';
import { formatBytes } from '../../lib/format';
import { checkService, ValidationError } from '../../services';
import type { DemoScenario, InputType, SubmittedFile } from '../../types/models';
import { CornerMarks } from '../../components/Layout';
import { DemoScenarioPicker } from '../demo/DemoScenarioPicker';
import { getPreferredScenario, setPreferredScenario } from '../demo/demoSettings';
import { useReveal } from '../../lib/useReveal';

const tabs: { value: InputType; label: string; Icon: typeof FileText }[] = [
  { value: 'text', label: 'Text', Icon: FileText },
  { value: 'url', label: 'URL', Icon: Link2 },
];

const steps = [
  {
    title: 'Extract claims',
    Icon: ListChecks,
    summary: 'Your text is split into short, checkable statements.',
    points: [
      'Each claim is one factual statement, like a date, figure, or quote.',
      'A claim keeps its time period when the text states one.',
      'Opinions and questions are left out.',
    ],
    demo: 'The demo always shows the same four preset claims.',
  },
  {
    title: 'Find evidence',
    Icon: FileSearch,
    summary: 'Relevant passages are found and saved as snapshots.',
    points: [
      'Saves the source title, publisher, link, and the exact excerpt used.',
      'Records the publication date and the exact retrieval time.',
      'Keeps a capture of the page as it looked when retrieved.',
    ],
    demo: 'Demo sources and page captures are fictional.',
  },
  {
    title: 'Assess with citations',
    Icon: Quote,
    summary: 'Each claim gets a verdict that cites the saved passages.',
    points: [
      'Verdicts are Supported, Contradicted, or Insufficient evidence — never a truth score.',
      'Sources that no longer apply to the claim’s period are tagged Outdated, with a reason.',
      'If a provider fails, the claim shows Verification unavailable instead of a verdict.',
    ],
    demo: 'Demo verdicts come from fixtures; no AI model is called.',
  },
  {
    title: 'Review and correct',
    Icon: PencilLine,
    summary: 'A reviewer can publish a correction; the original assessment is kept.',
    points: [
      'Every correction is a new revision you can compare with earlier ones.',
      'A correction needs a reason and can only cite evidence already saved for the claim.',
      'If someone else edited the claim first, the stale correction is rejected instead of overwriting.',
    ],
    demo: 'Demo corrections are saved in your browser only.',
  },
];

/** Four steps that rise in when scrolled into view; clicking one shows its details. */
function HowItWorks() {
  const [ref, visible] = useReveal<HTMLOListElement>(0.25);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const panelId = useId();
  const open = openIndex === null ? null : steps[openIndex];

  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-16 border-b border-line">
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <h2 id="how-heading" className={`eyebrow reveal ${visible ? 'is-visible' : ''}`}>
          how it works
        </h2>
        <ol ref={ref} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ title, Icon }, index) => {
            const selected = openIndex === index;
            return (
              <li
                key={title}
                style={{ transitionDelay: visible ? `${120 + index * 110}ms` : '0ms' }}
                className={`reveal ${visible ? 'is-visible' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(selected ? null : index)}
                  aria-expanded={selected}
                  aria-controls={panelId}
                  className={`group block h-full w-full border p-5 text-left transition-colors ${
                    selected ? 'border-brand-500 bg-brand-50/50' : 'border-line bg-white hover:border-line-strong'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-mono text-xs text-candy">{String(index + 1).padStart(2, '0')}</span>
                    <Icon
                      className={`h-5 w-5 transition-colors duration-300 ${selected ? 'text-pop' : 'text-ink-faint group-hover:text-pop'}`}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-6 block text-base font-medium text-ink">{title}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                    {selected ? 'Hide details' : 'Show details'}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-300 ${selected ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div id={panelId} aria-live="polite">
          {open && openIndex !== null && (
            <div key={openIndex} className="rise-in mt-3 border border-line bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-candy">step {String(openIndex + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">{open.title}</h3>
                  <p className="mt-1 text-ink-soft">{open.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenIndex(null)}
                  aria-label="Close step details"
                  className="btn-ghost -mr-2 -mt-1 p-1.5"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                {open.points.map((point) => (
                  <li key={point} className="flex gap-2 border-l-2 border-line-strong pl-3 text-sm text-ink-soft">
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                {open.demo}
              </p>
            </div>
          )}
        </div>
        <CornerMarks />
      </div>
    </section>
  );
}

export function NewCheckPage() {
  const navigate = useNavigate();
  const ids = { panel: useId(), error: useId(), count: useId(), urlNote: useId(), fileHint: useId(), fileError: useId() };
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
        mode === 'text' ? { inputType: 'text', text, files, scenario } : { inputType: 'url', url, scenario },
      );
      navigate(`/checks/${check.id}`);
    } catch (err) {
      setServerError(err instanceof ValidationError ? err.message : 'Could not start the check. Please try again.');
      setSubmitting(false);
    }
  }

  async function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    setServerError(null);
    const { added, errors } = await readTextFiles(picked, files);
    setFiles((prev) => [...prev, ...added]);
    setFileErrors(errors);
    setFileStatus(added.length > 0 ? `Added ${added.map((file) => file.name).join(', ')}.` : '');
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((file) => file.name !== name));
    setFileErrors([]);
    setServerError(null);
    setFileStatus(`Removed ${name}.`);
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
    if (example.inputType === 'text') {
      setText(example.value);
      requestAnimationFrame(() => textRef.current?.focus());
    } else {
      setUrl(example.value);
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
      <section className="border-b border-line">
        <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col items-center justify-center px-4 py-12 sm:px-8">
          <h1 className="text-center text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[44px]">
            Trace claims.{' '}
            <span className="block text-ink-faint">
              Examine <span className="text-pop">evidence.</span>
            </span>
          </h1>
          <p className="mt-4 text-center text-base text-ink-soft sm:text-lg">Check claims against sources.</p>

          <div className="mt-8 w-full max-w-3xl">
            <form onSubmit={onSubmit} noValidate aria-label="New check">
              <div
                onDragOver={onDragOver}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
                }}
                onDrop={onDrop}
                className={`rounded-2xl border bg-white p-3 transition-colors focus-within:border-ink-faint ${
                  dragging ? 'border-dashed border-brand-500 bg-brand-50' : 'border-line-strong'
                }`}
              >
                <div id={ids.panel} role="tabpanel" aria-label={mode === 'text' ? 'Text input' : 'URL input'}>
                  {mode === 'text' ? (
                    <>
                      <label htmlFor="check-text" className="sr-only">
                        Text to check
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
                        rows={2}
                        placeholder="Paste text to check…"
                        aria-invalid={Boolean(error)}
                        aria-describedby={describedBy}
                        className="block max-h-80 min-h-[3.5rem] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none sm:text-lg"
                      />
                      {files.length > 0 && (
                        <ul className="flex flex-wrap gap-2 px-2 pt-2" aria-label="Attached files">
                          {files.map((file) => (
                            <li
                              key={file.name}
                              className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-zinc-50 py-1 pl-2.5 pr-1 text-sm"
                            >
                              <FileText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                              <span className="min-w-0 truncate text-ink">{file.name}</span>
                              <span className="shrink-0 font-mono text-xs text-ink-muted">{formatBytes(file.size)}</span>
                              <button
                                type="button"
                                onClick={() => removeFile(file.name)}
                                aria-label={`Remove ${file.name}`}
                                className="rounded-lg p-1 text-ink-muted hover:bg-zinc-200 hover:text-ink"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {fileErrors.length > 0 && (
                        <ul id={ids.fileError} role="alert" className="space-y-0.5 px-2 pt-2 text-sm text-rose-700">
                          {fileErrors.map((message) => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      )}
                      <p id={ids.fileHint} className="sr-only">
                        Up to {config.files.maxFiles} .txt or .md files, {Math.round(config.files.maxBytes / 1024)} KB each.
                        Files are read in your browser and not uploaded.
                      </p>
                      <p className="sr-only" role="status" aria-live="polite">
                        {fileStatus}
                      </p>
                    </>
                  ) : (
                    <div className="px-2 py-1.5">
                      <label htmlFor="check-url" className="sr-only">
                        Article URL
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
                      <p id={ids.urlNote} className="mt-1 text-xs text-ink-muted">
                        Demo only — the page is not fetched.
                      </p>
                    </div>
                  )}
                  {error && (
                    <p id={ids.error} role="alert" className="px-2 pt-2 text-sm text-rose-700">
                      {error}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div role="tablist" aria-label="Input type" className="flex gap-2">
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
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                            selected
                              ? 'border-brand-200 bg-brand-50 font-medium text-brand-700'
                              : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
                          }`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
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
                        aria-label="Add files"
                        aria-describedby={ids.fileHint}
                        title="Add .txt or .md files (or drop them here)"
                        className="btn-ghost p-2"
                      >
                        <Paperclip className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    {mode === 'text' && text.length > 0 && (
                      <span
                        id={ids.count}
                        className={`hidden font-mono text-xs tabular-nums sm:inline ${overLimit ? 'text-rose-700' : 'text-ink-faint'}`}
                      >
                        {text.length.toLocaleString('en-US')} / {config.text.maxLength.toLocaleString('en-US')}
                        <span className="sr-only"> characters</span>
                      </span>
                    )}
                    <button type="submit" className="btn-primary" disabled={submitting}>
                      {submitting ? 'Starting…' : 'Check claims'}
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
              <Info className="h-4 w-4" aria-hidden="true" />
              AI assessments can be wrong. Review the evidence.
            </p>
          </div>

          <section aria-labelledby="examples-heading" className="mt-8 flex flex-col items-center">
            <h2 id="examples-heading" className="sr-only">
              Examples
            </h2>
            <ul className="flex flex-wrap justify-center gap-3">
              {exampleInputs.map((example) => (
                <li key={example.id}>
                  <button type="button" className="btn-secondary px-5 py-2.5" onClick={() => applyExample(example.id)}>
                    {example.inputType === 'text' ? (
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    {example.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <a
            href="#how-it-works"
            className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-1 font-mono text-xs text-ink-faint transition-colors hover:text-ink sm:inline-flex"
          >
            how it works
            <ChevronDown className="h-3.5 w-3.5 motion-safe:animate-bounce" aria-hidden="true" />
          </a>
          <CornerMarks />
        </div>
      </section>

      <HowItWorks />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <DemoScenarioPicker value={scenario} onChange={changeScenario} />
      </div>
    </div>
  );
}
