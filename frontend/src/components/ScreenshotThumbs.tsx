import { useState } from 'react';
import { X } from 'lucide-react';
import type { Attachment } from '../types/models';
import { isSafeImageDataUrl } from '../lib/validation';
import { formatBytes } from '../lib/format';

interface Props {
  items: Attachment[];
  /** When set, each thumbnail gets a remove button. */
  onRemove?: (id: string) => void;
}

/** Thumbnail grid; clicking a thumbnail shows it full width below the grid. */
export function ScreenshotThumbs({ items, onRemove }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const safe = items.filter((item) => isSafeImageDataUrl(item.dataUrl));
  const open = safe.find((item) => item.id === openId);
  if (safe.length === 0) return null;

  return (
    <div>
      <ul className="flex flex-wrap gap-2" aria-label="Screenshots">
        {safe.map((item) => (
          <li key={item.id} className="relative">
            <button
              type="button"
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
              aria-expanded={openId === item.id}
              aria-label={`${openId === item.id ? 'Hide' : 'View'} screenshot ${item.name}`}
              className={`block h-20 w-28 overflow-hidden border bg-zinc-50 ${openId === item.id ? 'border-brand-500' : 'border-line hover:border-line-strong'}`}
            >
              <img src={item.dataUrl} alt="" className="h-full w-full object-cover" />
            </button>
            <span className="mt-1 block w-28 truncate font-mono text-[11px] text-ink-muted" title={item.name}>
              {item.name} · {formatBytes(item.size)}
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove screenshot ${item.name}`}
                className="absolute -right-2 -top-2 rounded-full border border-line bg-white p-1 text-ink-muted shadow-sm hover:text-ink"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {open && (
        <figure className="mt-3 border border-line bg-zinc-50 p-2">
          <img src={open.dataUrl} alt={`Screenshot: ${open.name}`} className="mx-auto max-h-[60vh] w-auto" />
          <figcaption className="mt-1 text-center font-mono text-[11px] text-ink-muted">{open.name}</figcaption>
        </figure>
      )}
    </div>
  );
}
