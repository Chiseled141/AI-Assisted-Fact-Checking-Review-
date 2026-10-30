import { useId, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import type { CheckDetail } from '../../types/models';
import { formatBytes, formatDateTime, pluralize, safeHref } from '../../lib/format';
import { scenarioLabel } from '../demo/demoSettings';
import { ProportionBar } from './ProportionBar';

export function countClaims(check: CheckDetail) {
  const counts = { supported: 0, contradicted: 0, insufficient_evidence: 0, unavailable: 0 };
  for (const claim of check.claims) {
    if (claim.status === 'unavailable' || !claim.current) counts.unavailable += 1;
    else counts[claim.current.verdict] += 1;
  }
  return counts;
}

/** Results header: title, one meta line, and the verdict split as a labeled bar. */
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
    { key: 'supported', label: 'Supported', value: counts.supported, color: 'bg-emerald-700' },
    { key: 'contradicted', label: 'Contradicted', value: counts.contradicted, color: 'bg-rose-700' },
    { key: 'insufficient', label: 'Insufficient', value: counts.insufficient_evidence, color: 'bg-amber-700' },
    { key: 'unavailable', label: 'Unavailable', value: counts.unavailable, color: 'bg-ink-faint' },
  ];
  const sources = check.claims.reduce((sum, claim) => sum + claim.evidenceIds.length, 0);
  const outdated = check.claims.reduce((sum, claim) => {
    const current = claim.current;
    if (!current) return sum;
    return sum + current.citedEvidenceIds.filter((id) => current.citationFreshness?.[id]?.status === 'outdated').length;
  }, 0);
  const corrected = check.claims.filter((claim) => claim.current?.kind === 'human_correction').length;
  const stats = [
    { label: 'Sources', value: sources, hint: 'Evidence snapshots saved across all claims' },
    { label: 'Outdated', value: outdated, hint: 'Cited sources that no longer apply to their claim’s period' },
    { label: 'Corrected', value: corrected, hint: 'Claims whose current verdict is a human correction' },
  ];
  const summary = `${counts.supported} of ${total} claims supported, ${counts.contradicted} contradicted, ${counts.insufficient_evidence} with insufficient evidence${
    counts.unavailable ? `, ${counts.unavailable} unavailable` : ''
  }.`;

  return (
    <header aria-labelledby="check-title">
      <h1 id="check-title" className="max-w-4xl text-balance break-words text-2xl font-semibold tracking-tight text-ink">
        {check.title}
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
        <span>{pluralize(total, 'claim')}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => setShowInput((v) => !v)}
          aria-expanded={showInput}
          aria-controls={inputId}
          className="underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          {showInput ? 'Hide' : 'View'} submitted {inputNoun}
        </button>
      </p>

      {showInput && (
        <div id={inputId} className="rise-in">
          <SubmittedInput check={check} href={href} files={files} />
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
        {/* Headline figure and the bar it comes from, read as one block. */}
        <div className="max-w-xl">
          {total > 0 && (
            <div className="flex items-end gap-4">
              {/* Same green as the Supported segment, so the number reads as that slice of the bar. */}
              <p className="flex items-baseline font-semibold leading-none tracking-tight text-emerald-700">
                <span className="text-6xl tabular-nums">{supportedPercent}</span>
                <span className="ml-1 text-3xl opacity-70">%</span>
              </p>
              <div className="pb-1">
                <p className="text-sm text-ink-soft">of claims supported</p>
                <p className="text-xs text-ink-faint">Share of claims, not a truth score</p>
              </div>
            </div>
          )}
          <div className="mt-5">
            <ProportionBar segments={segments} summary={summary} />
          </div>
        </div>

        {/* Context: how much evidence there was, and whether anyone has reviewed it. */}
        <dl className="grid grid-cols-3 gap-6 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          {stats.map(({ label, value, hint }) => (
            <div key={label} title={hint}>
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Demo · {scenarioLabel(check.scenario)} · fictional data, your input wasn’t analyzed.
      </p>
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
    <div className="mt-3 max-w-3xl border-l-2 border-line pl-4 text-sm text-ink-soft">
      {check.inputType === 'text' ? (
        <div className="space-y-3">
          {check.inputText && <p className="whitespace-pre-wrap break-words">{check.inputText}</p>}
          {files.map((file) => (
            <section key={file.name} aria-label={`File ${file.name}`}>
              <h3 className="flex items-center gap-2 text-xs text-ink-muted">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {file.name} · {formatBytes(file.size)}
              </h3>
              <p className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-words">{file.text}</p>
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
