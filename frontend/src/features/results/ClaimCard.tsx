import { ChevronRight } from 'lucide-react';
import type { Claim } from '../../types/models';
import { VerdictIcon } from '../../components/Badges';

interface Props {
  claim: Claim;
  selected: boolean;
  onSelect: () => void;
}

/** A claim in the list: verdict icon and claim text only. Details live in the panel beside it. */
export function ClaimCard({ claim, selected, onSelect }: Props) {
  const headingId = `claim-${claim.id}-heading`;
  const verdict = claim.status === 'assessed' && claim.current ? claim.current.verdict : null;

  return (
    <article aria-labelledby={headingId} className="relative">
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`group flex w-full items-start gap-3 px-4 py-4 text-left transition-colors ${
          selected ? 'bg-zinc-50' : 'hover:bg-zinc-50/60'
        }`}
      >
        <span className="mt-0.5">
          <VerdictIcon verdict={verdict} />
        </span>
        <h3 id={headingId} className={`flex-1 text-[15px] leading-snug ${selected ? 'text-ink' : 'text-ink-soft group-hover:text-ink'}`}>
          {claim.text}
        </h3>
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 transition-all ${selected ? 'text-ink' : 'text-ink-faint opacity-0 group-hover:opacity-100'}`}
          aria-hidden="true"
        />
      </button>
    </article>
  );
}
