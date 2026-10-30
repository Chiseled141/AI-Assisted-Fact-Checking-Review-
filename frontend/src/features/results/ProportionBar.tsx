/**
 * 100% stacked bar for small part-to-whole data (verdict split, evidence balance).
 * Segments are always paired with a visible text legend, so meaning never relies on color alone.
 */
export interface ProportionSegment {
  key: string;
  label: string;
  value: number;
  /** Tailwind background class for the segment and legend dot. */
  color: string;
}

interface Props {
  segments: ProportionSegment[];
  /** One-sentence summary read by screen readers in place of the graphic. */
  summary: string;
  size?: 'md' | 'sm';
  legend?: boolean;
}

export function ProportionBar({ segments, summary, size = 'md', legend = true }: Props) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);

  return (
    <figure>
      <div
        aria-hidden="true"
        className={`flex w-full gap-0.5 overflow-hidden rounded-full bg-zinc-100 ${size === 'md' ? 'h-2.5' : 'h-1.5'}`}
      >
        {total > 0 &&
          shown.map((s) => (
            <span
              key={s.key}
              className={`${s.color} h-full transition-[flex-grow] duration-500 ease-out`}
              style={{ flexGrow: s.value, flexBasis: 0 }}
            />
          ))}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
      {legend && (
        <ul aria-hidden="true" className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {shown.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${s.color}`} />
              <span className="font-medium tabular-nums text-ink">{s.value}</span>
              <span className="text-ink-muted">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
