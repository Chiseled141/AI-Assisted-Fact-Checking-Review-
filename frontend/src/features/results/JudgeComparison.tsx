import { ExternalLink } from 'lucide-react';
import type { FactCheckMatch, JudgeVerdict } from '../../types/models';
import { safeHref } from '../../lib/format';
import { VerdictMark } from '../../components/Badges';

/** Each LLM judge's verdict for one assessment. Model names come from the data, not from this component. */
export function JudgeComparison({ judges }: { judges: JudgeVerdict[] }) {
  if (judges.length === 0) return null;
  const agree = judges.every((judge) => judge.verdict === judges[0].verdict);
  const primary = judges.find((judge) => judge.primary);

  return (
    <div className="mt-5 font-sans text-xs">
      <p className="mb-2 font-medium text-ink-muted">Judges</p>
      <ul className="divide-y divide-line border-y border-line">
        {judges.map((judge) => (
          <li key={judge.judge} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <span className="text-ink-soft">
              {judge.judge}
              {judge.primary && <span className="ml-2 text-ink-faint">shown</span>}
            </span>
            <span className="flex items-center gap-3">
              <VerdictMark verdict={judge.verdict} />
              <span className="tabular-nums text-ink-muted">{Math.round(judge.confidence * 100)}% confidence</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-muted">
        {agree || !primary
          ? 'Judges agree.'
          : `Judges disagree. The shown verdict is from ${primary.judge}.`}
      </p>
    </div>
  );
}

/** A published fact-check matched to the claim by the known-fake lookup. */
export function FactCheckNote({ factCheck }: { factCheck: FactCheckMatch }) {
  const href = safeHref(factCheck.url);
  return (
    <p className="mt-4 font-sans text-xs text-ink-soft">
      <span className="font-semibold text-ink">Matched published fact-check:</span> {factCheck.publisher} rated it “
      {factCheck.rating}”.
      {href && (
        <>
          {' '}
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            Read the fact-check
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </>
      )}
    </p>
  );
}
