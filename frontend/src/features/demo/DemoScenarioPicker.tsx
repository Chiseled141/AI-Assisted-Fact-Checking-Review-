import { FlaskConical } from 'lucide-react';
import type { DemoScenario } from '../../types/models';
import { demoScenarios, scenarioLabel } from './demoSettings';

interface Props {
  value: DemoScenario;
  onChange: (scenario: DemoScenario) => void;
}

/** Demo-only control, styled apart from product features with a dashed frame. */
export function DemoScenarioPicker({ value, onChange }: Props) {
  return (
    <details className="group border border-dashed border-line-strong bg-white text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        <span className="font-medium">Demo controls</span>
        <span className="text-ink-muted">· Scenario: {scenarioLabel(value)}</span>
        <span className="ml-auto text-xs text-ink-muted group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs text-ink-muted group-open:inline">Hide</span>
      </summary>
      <fieldset className="px-4 pb-4">
        <legend className="sr-only">Demo scenario for the next check</legend>
        <p className="mb-3 text-xs text-ink-muted">
          Not a product feature. Picks which preset fixture the next check plays back, whatever you enter.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {demoScenarios.map((scenario) => (
            <label
              key={scenario.value}
              className="flex cursor-pointer gap-3 border border-line bg-white p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60"
            >
              <input
                type="radio"
                name="demo-scenario"
                value={scenario.value}
                checked={value === scenario.value}
                onChange={() => onChange(scenario.value)}
                className="mt-0.5 accent-brand-600"
              />
              <span>
                <span className="block font-medium text-ink">{scenario.label}</span>
                <span className="block text-xs text-ink-muted">{scenario.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </details>
  );
}
