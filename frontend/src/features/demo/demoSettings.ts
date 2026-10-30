// Demo-only controls. Kept apart from product features and the service contract.

import { readItem, writeItem } from '../../lib/storage';
import { resetDb } from '../../services/mock/demoDb';
import type { DemoScenario } from '../../types/models';

const SCENARIO_KEY = 'claimtrace.demo.scenario';

export const demoScenarios: { value: DemoScenario; label: string; description: string }[] = [
  { value: 'completed', label: 'Completed check', description: 'All claims are assessed.' },
  {
    value: 'partial_failure',
    label: 'Partial provider failure',
    description: 'One claim shows “Verification unavailable”.',
  },
  { value: 'failed', label: 'Failed check', description: 'Evidence retrieval fails during processing.' },
  {
    value: 'stale_conflict',
    label: 'Stale correction conflict',
    description: 'Your first correction collides with a simulated concurrent edit.',
  },
];

export function getPreferredScenario(): DemoScenario {
  const stored = readItem(SCENARIO_KEY);
  return demoScenarios.some((s) => s.value === stored) ? (stored as DemoScenario) : 'completed';
}

export function setPreferredScenario(scenario: DemoScenario): void {
  writeItem(SCENARIO_KEY, scenario);
}

export function scenarioLabel(scenario: DemoScenario): string {
  return demoScenarios.find((s) => s.value === scenario)?.label ?? scenario;
}

/** Restores the seeded demo history and discards checks created in this browser. */
export function resetDemoData(): void {
  resetDb();
}
