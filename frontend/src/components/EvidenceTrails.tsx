import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Background texture for the home hero: faint evidence traces entering from the
 * edges and converging toward the composer, each ending in a small source dot.
 * Purely decorative, so it stays out of the accessibility tree.
 */
export function EvidenceTrails() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 1440, height: 900 });

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const update = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth > 0 && clientHeight > 0) setSize({ width: clientWidth, height: clientHeight });
    };
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width: w, height: h } = size;
  const trails = [
    { end: { x: w * 0.45, y: h * 0.42 }, d: `M -24 ${h * 0.2} C ${w * 0.24} ${h * 0.24}, ${w * 0.36} ${h * 0.34}, ${w * 0.45} ${h * 0.42}` },
    { end: { x: w * 0.55, y: h * 0.425 }, d: `M ${w + 24} ${h * 0.28} C ${w * 0.8} ${h * 0.3}, ${w * 0.66} ${h * 0.35}, ${w * 0.55} ${h * 0.425}` },
    { end: { x: w * 0.43, y: h * 0.5 }, d: `M -24 ${h * 0.76} C ${w * 0.2} ${h * 0.68}, ${w * 0.33} ${h * 0.59}, ${w * 0.43} ${h * 0.5}` },
    { end: { x: w * 0.57, y: h * 0.51 }, d: `M ${w + 24} ${h * 0.82} C ${w * 0.78} ${h * 0.72}, ${w * 0.66} ${h * 0.61}, ${w * 0.57} ${h * 0.51}` },
    { end: { x: w * 0.51, y: h * 0.395 }, d: `M ${w * 0.72} -24 C ${w * 0.68} ${h * 0.16}, ${w * 0.58} ${h * 0.3}, ${w * 0.51} ${h * 0.395}` },
  ];

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 h-full w-full text-ink"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
        {trails.map(({ d }) => (
          <path key={d} d={d} opacity={0.07} />
        ))}
      </g>
      <g className="fill-brand-600">
        {trails.map(({ end }) => (
          <circle key={`${end.x}-${end.y}`} cx={end.x} cy={end.y} r={2.6} opacity={0.22} />
        ))}
      </g>
    </svg>
  );
}
