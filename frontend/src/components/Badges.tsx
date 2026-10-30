import {
  Bot,
  CalendarCheck,
  CalendarSearch,
  CalendarX,
  CircleCheck,
  CircleHelp,
  CircleX,
  CloudOff,
  FlaskConical,
  Info,
  Loader2,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import type { CheckStatus, EvidenceRelation, Freshness, RevisionKind, Verdict } from '../types/models';
import { isTerminal } from '../types/models';
import { relationLabel, statusLabel, verdictLabel } from '../lib/format';

const verdictStyle: Record<Verdict, { className: string; Icon: typeof CircleCheck }> = {
  supported: { className: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CircleCheck },
  contradicted: { className: 'border-rose-200 bg-rose-50 text-rose-800', Icon: CircleX },
  insufficient_evidence: { className: 'border-amber-200 bg-amber-50 text-amber-900', Icon: CircleHelp },
};

const pill = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium';

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { className, Icon } = verdictStyle[verdict];
  return (
    <span className={`${pill} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {verdictLabel[verdict]}
    </span>
  );
}

export function UnavailableBadge() {
  return (
    <span className={`${pill} border-dashed border-line-strong bg-zinc-50 text-zinc-700`}>
      <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
      Verification unavailable
    </span>
  );
}

const relationStyle: Record<EvidenceRelation, { className: string; Icon: typeof CircleCheck }> = {
  supporting: { className: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CircleCheck },
  contradicting: { className: 'border-rose-200 bg-rose-50 text-rose-800', Icon: CircleX },
  contextual: { className: 'border-line bg-zinc-50 text-zinc-700', Icon: Info },
};

export function RelationBadge({ relation }: { relation: EvidenceRelation }) {
  const { className, Icon } = relationStyle[relation];
  return (
    <span className={`${pill} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {relationLabel[relation]}
    </span>
  );
}

const freshnessStyle: Record<Freshness, { label: string; className: string; Icon: typeof CalendarCheck }> = {
  current: { label: 'Current', className: 'border-line bg-white text-ink-soft', Icon: CalendarCheck },
  outdated: { label: 'Outdated', className: 'border-candy/50 bg-candy/10 text-ink', Icon: CalendarX },
  unknown: { label: 'Freshness unknown', className: 'border-dashed border-line-strong bg-white text-ink-muted', Icon: CalendarSearch },
};

/** Squared tag (not a pill) so freshness is never mistaken for a verdict. */
export function FreshnessBadge({ status }: { status: Freshness }) {
  const { label, className, Icon } = freshnessStyle[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${className}`}
      title="Whether this source applies to the claim's time period. Separate from the verdict."
    >
      <Icon className={`h-3 w-3 ${status === 'outdated' ? 'text-candy' : ''}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function RevisionKindBadge({ kind, version }: { kind: RevisionKind; version?: number }) {
  const human = kind === 'human_correction';
  const Icon = human ? UserCheck : Bot;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${human ? 'text-brand-700' : 'text-ink-muted'}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {human ? 'Human correction' : 'AI assessment'}
      {version !== undefined && <span className="text-ink-muted">· rev {version}</span>}
    </span>
  );
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === 'completed') {
    return (
      <span className={`${pill} border-emerald-200 bg-emerald-50 text-emerald-800`}>
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Completed
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className={`${pill} border-rose-200 bg-rose-50 text-rose-800`}>
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Failed
      </span>
    );
  }
  return (
    <span className={`${pill} border-brand-200 bg-brand-50 text-brand-700`}>
      {!isTerminal(status) && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {statusLabel[status]}
    </span>
  );
}

export function DemoModeLabel({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-white px-2.5 py-0.5 text-xs text-ink-soft ${className}`}
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      Demo · simulated
    </span>
  );
}

/* Minimal text markers: a colored dot or word instead of a pill. Used on the results page. */

const verdictTone: Record<Verdict, { dot: string; text: string }> = {
  supported: { dot: 'bg-emerald-700', text: 'text-emerald-700' },
  contradicted: { dot: 'bg-rose-700', text: 'text-rose-700' },
  insufficient_evidence: { dot: 'bg-amber-700', text: 'text-amber-700' },
};

export function VerdictMark({ verdict }: { verdict: Verdict }) {
  const tone = verdictTone[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {verdictLabel[verdict]}
    </span>
  );
}

export function UnavailableMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
      <span className="h-1.5 w-1.5 rounded-full border border-ink-faint" aria-hidden="true" />
      Verification unavailable
    </span>
  );
}

const relationTone: Record<EvidenceRelation, string> = {
  supporting: 'text-emerald-700',
  contradicting: 'text-rose-700',
  contextual: 'text-ink-muted',
};

export function RelationText({ relation }: { relation: EvidenceRelation }) {
  return <span className={`font-medium ${relationTone[relation]}`}>{relationLabel[relation]}</span>;
}

export function FreshnessText({ status }: { status: Freshness }) {
  if (status === 'outdated') return <span className="font-medium text-candy">Outdated</span>;
  if (status === 'unknown') return <span className="text-ink-muted">Freshness unknown</span>;
  return <span className="text-ink-muted">Current</span>;
}

const verdictIconStyle: Record<Verdict, { Icon: typeof CircleCheck; className: string }> = {
  supported: { Icon: CircleCheck, className: 'text-emerald-700' },
  contradicted: { Icon: CircleX, className: 'text-rose-700' },
  insufficient_evidence: { Icon: CircleHelp, className: 'text-amber-700' },
};

/** Verdict as an icon (shape differs per verdict) with an accessible label. */
export function VerdictIcon({ verdict, className = 'h-5 w-5' }: { verdict: Verdict | null; className?: string }) {
  if (!verdict) {
    return (
      <>
        <CloudOff className={`${className} shrink-0 text-ink-faint`} aria-hidden="true" />
        <span className="sr-only">Verification unavailable</span>
      </>
    );
  }
  const { Icon, className: tone } = verdictIconStyle[verdict];
  return (
    <>
      <Icon className={`${className} shrink-0 ${tone}`} aria-hidden="true" />
      <span className="sr-only">{verdictLabel[verdict]}</span>
    </>
  );
}
