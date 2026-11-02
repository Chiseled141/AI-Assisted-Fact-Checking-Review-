import { useEffect, useId, useRef, useState } from 'react';
import { Check, CircleCheck, CloudOff, FlaskConical, GitCompareArrows, TriangleAlert } from 'lucide-react';
import type { DemoScenario } from '../../types/models';
import { demoScenarios, scenarioLabel } from './demoSettings';
import { t } from '../../lib/i18n';

const scenarioIcons: Record<DemoScenario, typeof CircleCheck> = {
  completed: CircleCheck,
  partial_failure: CloudOff,
  failed: TriangleAlert,
  stale_conflict: GitCompareArrows,
};

interface Props {
  value: DemoScenario;
  onChange: (scenario: DemoScenario) => void;
}

/** Demo-only control, tucked into the composer footer as a small popover menu. */
export function DemoScenarioPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

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

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('Demo scenario: {label}', { label: t(scenarioLabel(value)) })}
        title={t('Demo scenario: {label}', { label: t(scenarioLabel(value)) })}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/70 hover:text-ink"
      >
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="absolute bottom-full right-0 z-40 mb-2 max-h-[70svh] w-[19rem] max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 text-left shadow-[0_24px_60px_-24px_rgb(18_56_41_/_0.35)]"
        >
          <fieldset>
            <legend className="sr-only">{t('Demo scenario for the next check')}</legend>
            <div className="space-y-0.5">
              {demoScenarios.map((scenario) => {
                const Icon = scenarioIcons[scenario.value];
                const selected = value === scenario.value;
                return (
                  <label
                    key={scenario.value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-100/70 has-[:checked]:bg-brand-50/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40"
                  >
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-brand-600' : 'text-ink-muted'}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{t(scenario.label)}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{t(scenario.description)}</span>
                    </span>
                    {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
                    <input
                      type="radio"
                      name="demo-scenario"
                      value={scenario.value}
                      checked={selected}
                      onChange={() => onChange(scenario.value)}
                      onClick={(event) => {
                        // Pointer picks dismiss the menu; keyboard picks keep it open for arrow-key browsing.
                        if (event.detail > 0) {
                          setOpen(false);
                          triggerRef.current?.focus();
                        }
                      }}
                      className="sr-only"
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
    </>
  );
}
