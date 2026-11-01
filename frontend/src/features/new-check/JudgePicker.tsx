import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { config } from '../../config';
import { judgeName } from '../../lib/judges';

type JudgeOption = (typeof config.judges.options)[number];

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
}

/** The lab's logo. Mono marks flip to white in dark mode; brand-colour logos are shown as they are. */
function JudgeLogo({ option, className }: { option: JudgeOption; className: string }) {
  return (
    <img
      src={option.logo}
      alt=""
      className={`shrink-0 ${option.mono ? 'dark:invert' : ''} ${className}`}
      draggable={false}
    />
  );
}

/**
 * Chooses the two LLM judges for the next check, as a small popover like the demo scenario picker.
 * Picking a third judge swaps out the older choice, so there is always exactly the configured number.
 */
export function JudgePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const label = value.map(judgeName).join(' + ');
  const selectedOptions = value
    .map((id) => config.judges.options.find((option) => option.id === id))
    .filter((option): option is JudgeOption => Boolean(option));

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
    onChange([...value.slice(-(config.judges.count - 1)), id]);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Judges: ${label}`}
        title={`Judges: ${label}`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-2 font-sans text-xs text-ink-muted transition-colors hover:bg-white/70 hover:text-ink dark:hover:bg-white/10"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          {selectedOptions.map((option) => (
            <JudgeLogo key={option.id} option={option} className="h-4 w-4" />
          ))}
        </span>
        <span className="hidden whitespace-nowrap sm:inline">{label}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="absolute bottom-full right-0 z-40 mb-2 w-[20rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-white p-1.5 text-left shadow-[0_24px_60px_-24px_rgb(18_56_41_/_0.35)] dark:border-white/10 dark:bg-[#151b19] dark:shadow-black/50"
        >
          <fieldset>
            <legend className="px-3 pb-1 pt-2 font-sans text-xs text-ink-muted">
              Judges for the next check. Pick {config.judges.count}; a new pick replaces the older one.
            </legend>
            <div className="space-y-0.5">
              {config.judges.options.map((option) => {
                const selected = value.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 font-sans text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40 ${
                      selected
                        ? 'bg-zinc-100/70 text-ink dark:bg-white/[0.08]'
                        : 'text-ink-soft hover:bg-zinc-100/70 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        selected
                          ? 'border-brand-600 bg-brand-600 text-on-primary'
                          : 'border-line-strong bg-white dark:bg-transparent'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                    </span>
                    <JudgeLogo option={option} className="h-5 w-5" />
                    <span className="min-w-0 flex-1 font-medium leading-snug">{option.name}</span>
                    <span aria-hidden="true" className="shrink-0 text-xs text-ink-faint">
                      {option.lab}
                    </span>
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
