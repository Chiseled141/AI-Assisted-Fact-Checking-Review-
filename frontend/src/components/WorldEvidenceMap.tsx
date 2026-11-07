import { WORLD_DOTS, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from './worldDots';

/**
 * Home hero backdrop: the world drawn as a faint dot grid. Decorative only,
 * so it stays out of the accessibility tree.
 */
export function WorldEvidenceMap() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center overflow-hidden">
      <div className="w-[280vw] shrink-0 sm:w-[180vw] lg:w-[min(1560px,115vw)]">
        <svg focusable="false" viewBox={`0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}`} className="world-map block h-auto w-full">
          <path d={WORLD_DOTS} className="fill-ink opacity-[0.16]" />
        </svg>
      </div>
    </div>
  );
}
