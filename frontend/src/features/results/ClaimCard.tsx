import { ChevronDown } from 'lucide-react';
import type { Claim } from '../../types/models';
import { UnavailableMark, VerdictMark } from '../../components/Badges';

interface Props {
  claim: Claim;
  selected: boolean;
  /** Detail is visible below the row; defaults to the selected state. */
  expanded?: boolean;
  onSelect: () => void;
}

/** A claim in the index: number, claim text, verdict, and an open marker. Detail expands below. */
export function ClaimCard({ claim, selected, expanded = selected, onSelect }: Props) {
  const headingId = `claim-${claim.id}-heading`;
  const verdict = claim.status === 'assessed' && claim.current ? claim.current.verdict : null;

  return (
    <article aria-labelledby={headingId}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="group grid w-full grid-cols-[24px_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 py-4 text-left sm:gap-x-4"
      >
        <span
          aria-hidden="true"
          className={`pt-0.5 font-logo text-[11px] font-medium tracking-[0.12em] transition-colors ${
            selected ? 'text-brand-600' : 'text-ink-faint'
          }`}
        >
          {String(claim.position).padStart(2, '0')}
        </span>
        <h3
          id={headingId}
          className={`min-w-0 text-[15px] leading-[1.55] tracking-[-0.005em] transition-colors sm:text-[16px] ${
            selected ? 'text-ink' : 'text-ink-soft group-hover:text-ink'
          }`}
        >
          {claim.text}
        </h3>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 transition-transform duration-200 ${
            expanded ? 'rotate-180 text-brand-600' : 'text-ink-faint group-hover:text-ink-muted'
          }`}
          aria-hidden="true"
        />
        <span className="col-start-2 col-end-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-xs">
          {verdict ? <VerdictMark verdict={verdict} /> : <UnavailableMark />}
          {claim.current?.kind === 'human_correction' && <span className="text-ink-faint">Reviewed</span>}
        </span>
      </button>
    </article>
  );
}
