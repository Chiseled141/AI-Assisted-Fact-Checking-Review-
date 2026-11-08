import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bot, ChartNoAxesCombined, ChevronDown, FileText, Link2, Loader2, Reply } from 'lucide-react';
import { config } from '../../config';
import type { ChatMessage, ChatReference, CheckDetail, SubmittedFile } from '../../types/models';
import { formatBytes, formatCalendarDate, formatDateTime, safeHref } from '../../lib/format';
import { t } from '../../lib/i18n';

/** Long pasted text is cut to a few lines until the reader opens it. */
function ClampedText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);

  return (
    <>
      <p ref={ref} className={`whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-[8]'}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          {open ? t('Show less') : t('Show more')}
        </button>
      )}
    </>
  );
}

function LinkInput({ check, url }: { check: CheckDetail; url: string }) {
  const href = safeHref(url);
  const { article } = check;
  const title = article?.title ?? (href ? new URL(href).hostname : url);
  const meta = [article?.publisher, article?.publishedAt && formatCalendarDate(article.publishedAt)].filter(Boolean);
  return (
    <div className="flex items-start gap-2.5">
      <Link2 className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
      <div className="min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-start gap-1 break-words font-medium text-ink hover:text-brand-700"
          >
            {title}
            <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only"> {t('(opens in a new tab)')}</span>
          </a>
        ) : (
          <span className="break-words font-medium">{title}</span>
        )}
        {meta.length > 0 && <p className="mt-0.5 text-[13px] text-ink-muted">{meta.join(' · ')}</p>}
      </div>
    </div>
  );
}

/** Files the reader attached. Each opens to show its text. */
function FileList({ files, spaced }: { files: SubmittedFile[]; spaced: boolean }) {
  return (
    <ul className={`space-y-2 ${spaced ? 'mt-3' : ''}`} aria-label={t('Attached files')}>
      {files.map((file) => (
        <li key={file.name}>
          <details className="group rounded-xl border border-line bg-white px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
              <FileText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span className="min-w-0 truncate font-medium">{file.name}</span>
              <span className="shrink-0 text-xs text-ink-muted">{formatBytes(file.size)}</span>
              <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.6] text-ink-soft">
              {file.text}
            </pre>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** What the reader sent, as their message on the right. */
export function UserMessage({ check }: { check: CheckDetail }) {
  const text = check.inputType === 'text' ? check.inputText?.trim() : undefined;
  return (
    <div className="flex flex-col items-end">
      <div className={`max-w-[88%] rounded-[22px] rounded-br-md px-4 py-3 text-[15px] leading-relaxed text-ink sm:max-w-[80%] ${
        check.inputType === 'url' ? 'border border-line-strong bg-transparent' : 'bg-zinc-100'
      }`}>
        {check.inputType === 'url' && check.inputUrl && <LinkInput check={check} url={check.inputUrl} />}
        {text && <ClampedText text={text} />}
        {check.files && check.files.length > 0 && <FileList files={check.files} spaced={Boolean(text)} />}
        {check.files && check.files.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted">{t('Text sent to the server for checking')}</p>
        )}
      </div>
      <time dateTime={check.createdAt} className="mt-1.5 pr-1 text-xs text-ink-faint">
        {formatDateTime(check.createdAt)}
      </time>
    </div>
  );
}

/** Shared layout for ClaimTrace status messages and model replies. */
export function AssistantMessage({ children, modelName }: { children: ReactNode; modelName?: string | null }) {
  const model = config.judges.options.find(({ name }) => name === modelName);

  return (
    <div className="min-w-0">
      <p
        className={`flex min-h-7 items-center gap-2 text-sm leading-tight text-ink ${
          modelName ? 'font-logo font-medium' : 'font-wordmark font-bold tracking-[-0.035em]'
        }`}
        style={model ? { color: model.nameColor } : undefined}
      >
        {model?.logo ? (
          <img src={model.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
        ) : modelName ? (
          <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : null}
        {modelName || 'ClaimTrace'}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const referenceIcon = {
  source: Link2,
  chart: ChartNoAxesCombined,
  judge: Bot,
  answer: Reply,
};

function ReferenceChip({ reference }: { reference: ChatReference }) {
  const Icon = referenceIcon[reference.kind];
  const title = reference.title || t('Earlier answer');
  const model = reference.modelName;
  const href = reference.kind === 'source' ? safeHref(reference.url ?? '') : null;
  const className = 'mb-1.5 flex max-w-[88%] items-center gap-2 rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-xs text-ink-soft sm:max-w-[80%]';
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      {model && <span className="shrink-0 font-semibold text-ink">{model}</span>}
      <span className="min-w-0 truncate">{title}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={model ? `${model} · ${title}` : title} className={`${className} hover:border-brand-300`}>
      {content}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </a>
  ) : (
    <div title={model ? `${model} · ${title}` : title} className={className}>{content}</div>
  );
}

/** A follow-up question on the right, and ClaimTrace's answer under it. A pending one shows a spinner instead. */
export function FollowUpExchange({
  message,
  pending,
  actions,
}: {
  message?: ChatMessage;
  actions?: ReactNode;
  pending?: Pick<ChatMessage, 'question' | 'files' | 'reference'>;
}) {
  const question = message?.question ?? pending?.question ?? '';
  const files = message?.files ?? pending?.files ?? [];
  const reference = message?.reference ?? pending?.reference;
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-end">
        {reference && <ReferenceChip reference={reference} />}
        <div className="max-w-[88%] rounded-[22px] rounded-br-md bg-zinc-100 px-4 py-3 text-[15px] leading-relaxed text-ink sm:max-w-[80%]">
          <p className="whitespace-pre-wrap break-words">{question}</p>
          {files.length > 0 && <FileList files={files} spaced />}
        </div>
        {message && (
          <time dateTime={message.createdAt} className="mt-1.5 pr-1 text-xs text-ink-faint">
            {formatDateTime(message.createdAt)}
          </time>
        )}
      </div>
      <AssistantMessage modelName={message?.modelName}>
        {message ? (
          <>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.75] text-ink">{message.answer}</p>
            {(message.sources?.length ?? 0) > 0 && (
              <ul aria-label={t('Additional sources')} className="mt-3 flex flex-wrap gap-2">
                {message.sources?.map((source) => {
                  const href = safeHref(source.url);
                  return href ? (
                    <li key={source.url} className="min-w-0 max-w-full">
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:border-brand-300 hover:text-brand-700">
                        <span className="truncate">{source.title}</span>
                        <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
            {actions}
          </>
        ) : (
          <p className="inline-flex items-center gap-2 text-[15px] text-ink-soft" role="status">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden="true" />
            {t('Thinking…')}
          </p>
        )}
      </AssistantMessage>
    </div>
  );
}
