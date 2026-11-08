import { useState } from 'react';
import type { PartyIdentity } from '../data/partyRegistry';

/** A small colour key stays beside the party image, matching its dots in the seat plot. */
export function PartyLogo({ party, color }: { party: PartyIdentity | null; color: string }) {
  const [failedAsset, setFailedAsset] = useState<string | null>(null);
  const asset = party?.asset;
  return (
    <span className="inline-flex h-7 shrink-0 items-center gap-2" aria-hidden="true">
      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      {asset && asset !== failedAsset && (
        <img src={`${import.meta.env.BASE_URL}party-logos/${asset}`} alt="" decoding="async" loading="lazy"
          onError={() => setFailedAsset(asset)} className="block h-6 w-8 object-contain" />
      )}
    </span>
  );
}
