import { useId, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import type { CheckDetail } from '../../types/models';
import { formatBytes, formatDateTime, pluralize, safeHref } from '../../lib/format';
import { ProportionBar } from './ProportionBar';

export function countClaims(check: CheckDetail) {
  const counts = { supported: 0, contradicted: 0, insufficient_evidence: 0, unavailable: 0 };
  for (const claim of check.claims) {
    if (claim.status === 'unavailable' || !claim.current) counts.unavailable += 1;
    else counts[claim.current.verdict] += 1;
  }
  return counts;
}

/** Results header: title, one meta line, and the verdict split as a quiet editorial band. */
export function CheckSummary({ check }: { check: CheckDetail }) {
  const counts = countClaims(check);
  const href = check.inputUrl ? safeHref(check.inputUrl) : null;
  const files = check.files ?? [];
  const inputNoun = check.inputType === 'url' ? 'URL' : files.length > 0 ? 'input' : 'text';
  const total = check.claims.length;
  // A descriptive share of verdicts (supported claims / all claims), deliberately not a truth or confidence score.
  const supportedPercent = total > 0 ? Math.round((counts.supported / total) * 100) : 0;
  const [showInput, setShowInput] = useState(false);
  const inputId = useId();

  const segments = [
    { key: 'supported', label: 'Supported', value: counts.supported, color: 'bg-brand-500' },
    { key: 'contradicted', label: 'Contradicted', value: counts.contradicted, color: 'bg-rose-400' },
    { key: 'insufficient', label: 'Insufficient', value: counts.insufficient_evidence, color: 'bg-amber-400' },
    { key: 'unavailable', label: 'Unavailable', value: counts.unavailable, color: 'bg-ink-faint' },
  ];
  const summary = `${counts.supported} of ${total} claims supported, ${counts.contradicted} contradicted, ${counts.insufficient_evidence} with insufficient evidence${
    counts.unavailable ? `, ${counts.unavailable} unavailable` : ''
  }.`;

  return (
    <header aria-labelledby="check-title">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />
          Completed
        </span>
        <span aria-hidden="true" className="text-ink-faint">·</span>
        <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time>
      </p>

      <h1
        id="check-title"
        className="mt-3 max-w-[44rem] text-balance break-words text-[28px] leading-[1.14] tracking-[-0.03em] text-ink sm:text-[36px]"
      >
        {check.title}
      </h1>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 font-sans text-[13px] text-ink-muted">
        <span>{pluralize(total, 'claim')}</span>
        <span aria-hidden="true" className="text-ink-faint">·</span>
        <button
          type="button"
          onClick={() => setShowInput((v) => !v)}
          aria-expanded={showInput}
          aria-controls={inputId}
          className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
        >
          {showInput ? 'Hide' : 'View'} submitted {inputNoun}
        </button>
      </p>

      {showInput && (
        <div id={inputId} className="rise-in">
          <SubmittedInput check={check} href={href} files={files} />
        </div>
      )}

      {total > 0 && (
        <div className="mt-8 border-y border-line py-6">
          {/* Headline figure and the bar it comes from, read as one block. */}
          <div className="min-w-0">
            <div className="flex items-end gap-4">
              {/* Same green as the Supported segment, so the number reads as that slice of the bar. */}
              <p className="flex items-baseline leading-none tracking-[-0.05em] text-brand-600">
                <span className="text-[44px] tabular-nums sm:text-[54px]">{supportedPercent}</span>
                <span className="ml-1 text-[20px] opacity-70 sm:text-[24px]">%</span>
              </p>
              <div className="pb-1">
                <p className="text-sm font-medium text-ink">of claims supported</p>
                <p className="mt-0.5 text-xs text-ink-faint">Share of claims, not a truth score</p>
              </div>
            </div>
            <div className="mt-5">
              <ProportionBar segments={segments} summary={summary} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/** Shown when the "View submitted" toggle in the meta line is open. */
function SubmittedInput({
  check,
  href,
  files,
}: {
  check: CheckDetail;
  href: string | null;
  files: NonNullable<CheckDetail['files']>;
}) {
  return (
    <div className="mt-4 max-w-3xl border-l-2 border-line pl-4 text-sm text-ink-soft">
      {check.inputType === 'text' ? (
        <div className="space-y-3">
          {check.inputText && <p className="whitespace-pre-wrap break-words leading-[1.7]">{check.inputText}</p>}
          {files.map((file) => (
            <section key={file.name} aria-label={`File ${file.name}`}>
              <h3 className="flex items-center gap-2 font-sans text-xs text-ink-muted">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {file.name} · {formatBytes(file.size)}
              </h3>
              <p className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-words leading-[1.7]">{file.text}</p>
            </section>
          ))}
        </div>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 break-all text-brand-700 underline decoration-brand-200 underline-offset-2"
        >
          {check.inputUrl}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab; not fetched in this demo)</span>
        </a>
      ) : (
        <span className="break-all">{check.inputUrl}</span>
      )}
    </div>
  );
}
