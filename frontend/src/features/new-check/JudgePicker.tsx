import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { config } from '../../config';
import { judgeName } from '../../lib/judges';
import { t } from '../../lib/i18n';

type JudgeOption = (typeof config.judges.options)[number];

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  /** How many models to pick. Two judges for a check; one model for a follow-up question. */
  count?: number;
  /** The menu's title and the line under it. */
  heading?: string;
  note?: string;
  /** What the button is called for screen readers, given the picked names. */
  buttonLabel?: (names: string) => string;
}

/** The lab's logo. */
function JudgeLogo({ option, className }: { option: JudgeOption; className: string }) {
  return <img src={option.logo} alt="" className={`shrink-0 ${className}`} draggable={false} />;
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SWAP_MS = 280;
/** Models shown before the menu scrolls. */
const VISIBLE_ROWS = 4;

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smooths a judge swap on the trigger: pieces that stay slide to their new place, a new judge's logo and name rise
 * in, and the button eases to its new width. Each piece is registered under a stable key through `track`.
 */
function useSwapAnimation(button: React.RefObject<HTMLElement>, deps: string) {
  const pieces = useRef(new Map<string, HTMLElement>());
  const last = useRef<{ rects: Map<string, DOMRect>; width: number } | null>(null);

  useLayoutEffect(() => {
    // A quick second swap would otherwise measure pieces mid-slide.
    [button.current, ...pieces.current.values()].forEach((el) => el?.getAnimations?.().forEach((a) => a.cancel()));
    const rects = new Map([...pieces.current].map(([key, el]) => [key, el.getBoundingClientRect()]));
    const width = button.current?.getBoundingClientRect().width ?? 0;
    const before = last.current;
    last.current = { rects, width };
    if (!before || prefersReducedMotion() || typeof button.current?.animate !== 'function') return;

    const timing = { duration: SWAP_MS, easing: EASE };
    if (before.width !== width) {
      button.current.animate([{ width: `${before.width}px` }, { width: `${width}px` }], timing);
    }
    pieces.current.forEach((el, key) => {
      const was = before.rects.get(key);
      const now = rects.get(key)!;
      if (!was) {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(6px) scale(0.8)', filter: 'blur(3px)' },
            { opacity: 1, transform: 'none', filter: 'blur(0)' },
          ],
          { ...timing, delay: 30, fill: 'backwards' },
        );
      } else if (was.left !== now.left) {
        el.animate([{ transform: `translateX(${was.left - now.left}px)` }, { transform: 'none' }], timing);
      }
    });
  }, [deps, button]);

  return (key: string) => (el: HTMLElement | null) => {
    if (el) pieces.current.set(key, el);
    else pieces.current.delete(key);
  };
}

/**
 * Chooses the two LLM judges for the next check in a small popover.
 * Picking a third judge swaps out the older choice, so there is always exactly the configured number.
 */
export function JudgePicker({ value, onChange, count = config.judges.count, heading, note, buttonLabel }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const label = value.map(judgeName).join(' + ');
  const accessibleLabel = buttonLabel ? buttonLabel(label) : t('Judges: {label}', { label });
  const selectedOptions = value
    .map((id) => config.judges.options.find((option) => option.id === id))
    .filter((option): option is JudgeOption => Boolean(option));
  const track = useSwapAnimation(triggerRef, value.join(','));
  // The menu shows the first four models whole, and the rest scroll into view. It never reaches past the header.
  const [menuHeight, setMenuHeight] = useState<number>();

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !triggerRef.current || !menu) return;
    const rows = menu.querySelectorAll('label');
    const last = rows[Math.min(VISIBLE_ROWS, rows.length) - 1];
    const style = getComputedStyle(menu);
    const fits = last.offsetTop + last.offsetHeight + parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth) * 2;
    const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const room = triggerRef.current.getBoundingClientRect().top - Math.max(headerBottom, 0) - 16;
    setMenuHeight(Math.min(fits, Math.max(room, 200)));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function toggle(id: string) {
    if (value.includes(id)) return;
    // The newest pick pushes out the oldest, so there are always `count` models.
    onChange([...(count > 1 ? value.slice(-(count - 1)) : []), id]);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 shrink-0 items-center gap-2 overflow-hidden rounded-full px-2 font-sans text-xs text-ink-muted transition-colors hover:bg-white/70 hover:text-ink"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          {selectedOptions.map((option) => (
            <span key={option.id} ref={track(`logo:${option.id}`)} className="inline-flex">
              <JudgeLogo option={option} className="h-4 w-4" />
            </span>
          ))}
        </span>
        <span className="hidden whitespace-nowrap sm:inline" aria-hidden="true">
          {selectedOptions.map((option, index) => (
            <Fragment key={option.id}>
              {index > 0 && <span ref={track(`plus:${index}`)} className="inline-block">&nbsp;+&nbsp;</span>}
              <span ref={track(`name:${option.id}`)} className="inline-block">
                {option.name}
              </span>
            </Fragment>
          ))}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          style={{ maxHeight: menuHeight ?? 384 }}
          className="soft-scroll absolute bottom-full right-0 z-40 mb-2 w-[20rem] max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 text-left shadow-[0_24px_60px_-24px_rgb(18_56_41_/_0.35)]"
        >
          <fieldset>
            {/* float + w-full makes the legend lay out like a normal block, so it lines up with the rows. */}
            <legend className="float-left w-full px-3 pb-2 pt-2 font-sans">
              <span className="block text-sm font-medium text-ink">{heading ?? t('Pick {count} judges', { count })}</span>
              <span className="block text-xs text-ink-muted">{note ?? t('A new pick replaces the older one.')}</span>
            </legend>
            <div className="clear-both space-y-0.5">
              {config.judges.options.map((option) => {
                const selected = value.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-sm transition-colors hover:bg-zinc-100/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40 ${
                      selected ? 'text-ink' : 'text-ink-soft'
                    }`}
                  >
                    <JudgeLogo option={option} className="h-5 w-5 object-contain" />
                    <span className="min-w-0 flex-1 leading-snug">
                      <span className={`block transition-colors ${selected ? 'font-semibold text-brand-600' : ''}`}>{option.name}</span>
                      <span aria-hidden="true" className="block text-xs text-ink-muted">
                        {option.lab}
                      </span>
                    </span>
                    {/* A picked judge gets a small green dot, which pops in and out. */}
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full bg-brand-500 transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        selected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                      }`}
                    />
                    <input
                      type="checkbox"
                      value={option.id}
                      checked={selected}
                      onChange={() => toggle(option.id)}
                      className="sr-only"
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
