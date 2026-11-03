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
  UserCheck,
} from 'lucide-react';
import type { CheckStatus, EvidenceRelation, Freshness, RevisionKind, SourceTrust, Verdict } from '../types/models';
import { isTerminal } from '../types/models';
import { relationLabel, statusLabel, verdictLabel } from '../lib/format';
import { sourceTrustDescription, sourceTrustLabel } from '../lib/sources';
import { t } from '../lib/i18n';

const verdictStyle: Record<Verdict, { className: string; Icon: typeof CircleCheck }> = {
  supported: { className: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CircleCheck },
  contradicted: { className: 'border-rose-200 bg-rose-50 text-rose-800', Icon: CircleX },
  insufficient_evidence: { className: 'border-amber-200 bg-amber-50 text-amber-900', Icon: CircleHelp },
  outdated: { className: 'border-slate-300 bg-slate-100 text-slate-700', Icon: CalendarX },
};

const pill = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold';

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { className, Icon } = verdictStyle[verdict];
  return (
    <span className={`${pill} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {verdictLabel[verdict]}
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
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${className}`}
      title={t('Whether this source applies to the claim’s time period. Separate from the verdict.')}
    >
      <Icon className={`h-3 w-3 ${status === 'outdated' ? 'text-candy' : ''}`} aria-hidden="true" />
      {t(label)}
    </span>
  );
}

export function RevisionKindBadge({ kind, version }: { kind: RevisionKind; version?: number }) {
  const human = kind === 'human_correction';
  const Icon = human ? UserCheck : Bot;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${human ? 'text-brand-700' : 'text-ink-muted'}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{`${human ? t('Human correction') : t('AI assessment')}${version !== undefined ? ` · ${t('rev {version}', { version })}` : ''}`}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  const failed = status === 'failed';
  const done = status === 'completed';
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-xs text-ink-muted">
      <span
        className={`h-1.5 w-1.5 rounded-full ${failed ? 'bg-rose-600' : done ? 'bg-brand-600' : 'bg-brand-500'} ${
          isTerminal(status) ? '' : 'motion-safe:animate-pulse'
        }`}
        aria-hidden="true"
      />
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
      {t('Demo · simulated')}
    </span>
  );
}

/* Minimal text markers: a colored dot or word instead of a pill. Used on the results page. */

const verdictTone: Record<Verdict, { dot: string; text: string }> = {
  supported: { dot: 'bg-emerald-700', text: 'text-emerald-700' },
  contradicted: { dot: 'bg-rose-600', text: 'text-rose-600' },
  insufficient_evidence: { dot: 'bg-amber-700', text: 'text-amber-700' },
  outdated: { dot: 'bg-slate-600', text: 'text-slate-600' },
};

export function VerdictMark({ verdict, className = '' }: { verdict: Verdict; className?: string }) {
  const tone = verdictTone[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {verdictLabel[verdict]}
    </span>
  );
}

/** The selected claim's verdict, as the largest thing in its panel. */
export function VerdictHeadline({ verdict }: { verdict: Verdict | null }) {
  const className = 'text-[24px] font-medium leading-[1.2] tracking-[-0.025em] sm:text-[30px]';
  if (!verdict) return <p className={`${className} text-ink-muted`}>{t('Verification unavailable.')}</p>;
  return <p className={`${className} ${verdictTone[verdict].text}`}>{verdictLabel[verdict]}.</p>;
}

const relationChip: Record<EvidenceRelation, string> = {
  supporting: 'bg-emerald-700 text-page',
  contradicting: 'bg-rose-600 text-page',
  contextual: 'bg-white text-ink',
};

/** Sits on a source's photo, so it is a solid chip rather than plain text. */
export function RelationChip({ relation }: { relation: EvidenceRelation }) {
  return (
    <span className={`inline-block max-w-full truncate rounded-md px-2 py-1 align-top text-[13px] font-semibold ${relationChip[relation]}`}>
      {relationLabel[relation]}
    </span>
  );
}

const sourceTrustTone: Record<SourceTrust, { dot: string; text: string }> = {
  green: { dot: 'bg-emerald-700', text: 'text-emerald-700' },
  yellow: { dot: 'bg-amber-700', text: 'text-amber-700' },
  red: { dot: 'bg-rose-600', text: 'text-rose-600' },
};

const sourceTrustOnPhoto: Record<SourceTrust, { dot: string; text: string }> = {
  green: { dot: 'bg-[#6ee7b7]', text: 'text-[#6ee7b7]' },
  yellow: { dot: 'bg-[#fcd34d]', text: 'text-[#fcd34d]' },
  red: { dot: 'bg-[#fca5a5]', text: 'text-[#fca5a5]' },
};

/**
 * Worded "… source" so a rating is never mistaken for a verdict. `null` means not in the list.
 * `onPhoto` uses lighter colors for text sitting on a photo or dark block.
 */
export function SourceTrustMark({ trust, onPhoto = false }: { trust: SourceTrust | null; onPhoto?: boolean }) {
  if (!trust) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs ${onPhoto ? 'text-[#fff]/90' : 'text-ink-muted'}`}
        title={t('This source is not in the rated list.')}
      >
        <span className={`h-1.5 w-1.5 rounded-full border ${onPhoto ? 'border-[#fff]/90' : 'border-ink-faint'}`} aria-hidden="true" />
        {t('Not rated')}
      </span>
    );
  }
  const tone = onPhoto ? sourceTrustOnPhoto[trust] : sourceTrustTone[trust];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone.text}`} title={sourceTrustDescription[trust]}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {sourceTrustLabel[trust]}
    </span>
  );
}

const verdictIconStyle: Record<Verdict, { Icon: typeof CircleCheck; className: string }> = {
  supported: { Icon: CircleCheck, className: 'text-emerald-700' },
  contradicted: { Icon: CircleX, className: 'text-rose-600' },
  insufficient_evidence: { Icon: CircleHelp, className: 'text-amber-700' },
  outdated: { Icon: CalendarX, className: 'text-slate-600' },
};

/** Verdict as an icon (shape differs per verdict) with an accessible label. */
export function VerdictIcon({ verdict, className = 'h-5 w-5' }: { verdict: Verdict | null; className?: string }) {
  if (!verdict) {
    return (
      <>
        <CloudOff className={`${className} shrink-0 text-ink-faint`} aria-hidden="true" />
        <span className="sr-only">{t('Verification unavailable')}</span>
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
