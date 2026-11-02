import type { Claim } from '../../types/models';
import { VerdictIcon } from '../../components/Badges';

interface Props {
  claim: Claim;
  selected: boolean;
  onSelect: () => void;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A claim as a compact tab: its verdict icon and short topic. The full text is in the panel below. */
export function ClaimCard({ claim, selected, onSelect }: Props) {
  const headingId = `claim-${claim.id}-heading`;
  const verdict = claim.status === 'assessed' && claim.current ? claim.current.verdict : null;

  return (
    <article aria-labelledby={headingId}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        title={claim.text}
        className={`-mb-px flex min-h-11 w-full items-start gap-2 border-b-2 py-3 text-left text-[15px] font-medium leading-snug transition-colors sm:w-auto ${
          selected ? 'border-indigo-700 text-ink' : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
        }`}
      >
        <span className="mt-0.5 shrink-0">
          <VerdictIcon verdict={verdict} className="h-4 w-4" />
        </span>
        <h3 id={headingId} className="sr-only">
          {claim.text}
        </h3>
        <span aria-hidden={claim.topic ? true : undefined}>{claim.topic ? capitalize(claim.topic) : claim.text}</span>
      </button>
    </article>
  );
}
