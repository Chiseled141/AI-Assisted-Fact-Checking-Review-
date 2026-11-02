import { useState } from 'react';
import type { SourceEntry } from '../types/models';

interface Props {
  source: SourceEntry;
  /** Leave the image out of the accessibility tree when the name is written next to it. */
  decorative?: boolean;
}

/** Source logo at its own proportions, with no box around it. Falls back to a monogram. */
export function SourceLogo({ source, decorative = false }: Props) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  if (source.logo && source.logo !== failedLogo) {
    return (
      <img
        src={`/source-logos/${source.logo}`}
        alt={decorative ? '' : `${source.name} logo`}
        loading="lazy"
        decoding="async"
        onError={() => setFailedLogo(source.logo ?? null)}
        className="block h-5 w-auto max-w-[72px] object-contain object-left"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-ink-muted"
    >
      {Array.from(source.name)[0]}
    </span>
  );
}
