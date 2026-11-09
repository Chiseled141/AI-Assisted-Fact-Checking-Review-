import { useId } from 'react';
import { ArrowUpRight, ChevronDown, Gamepad2, Trophy } from 'lucide-react';
import { SourceLogo } from '../../components/SourceLogo';
import { lightMatchTeamLogos, matchTeamImages } from '../../data/matchTeams';
import { safeHref } from '../../lib/format';
import { t } from '../../lib/i18n';
import { findSource } from '../../lib/sources';
import type { MatchResultData } from '../../types/models';
import { ChartReply } from './ChartReply';

function MatchTeam({ name, asset, showImage }: { name: string; asset: string | null; showImage: boolean }) {
  return (
    <div className="min-w-0">
      {showImage && (
        <div className="mx-auto mb-2 flex size-10 items-center justify-center sm:size-14">
          {asset && (
            <img
              src={`${import.meta.env.BASE_URL}team-logos/${asset}`}
              alt=""
              width={56}
              height={56}
              decoding="async"
              className={`size-full object-contain ${lightMatchTeamLogos.has(asset) ? 'rounded-lg bg-neutral-900 p-1.5 sm:p-2' : ''}`}
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
          )}
        </div>
      )}
      <p className="text-sm font-strong text-ink [overflow-wrap:anywhere] sm:text-lg">{name}</p>
    </div>
  );
}

export function MatchResult({ match, onReply }: { match: MatchResultData; onReply?: (title: string) => void }) {
  const heading = useId();
  const [left, right] = match.teams;
  const [leftScore, rightScore] = match.scores;
  const [leftImage, rightImage] = matchTeamImages(match);
  const showImages = Boolean(leftImage || rightImage);
  const Icon = match.kind === 'esport' ? Gamepad2 : Trophy;
  const metadata = [match.competition, match.stage, match.dateLabel].filter(Boolean).join(' · ');
  const href = safeHref(match.url);
  const source = findSource(match.url);
  const maps = match.kind === 'esport' ? match.maps ?? [] : [];
  const moments = match.kind === 'sport' ? match.moments ?? [] : [];

  return (
    <section aria-labelledby={heading} className="mt-8 overflow-hidden rounded-2xl border border-line-strong bg-white">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="min-w-0">
          <h2 id={heading} className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Icon size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
            {t('Match result')}
          </h2>
          {metadata && <p className="mt-1 text-sm text-ink-muted">{metadata}</p>}
        </div>
        <ChartReply title={`${left} – ${right}`} onReply={onReply} />
      </div>

      <div className="mx-3 my-4 rounded-xl bg-page px-2 py-5 sm:mx-6 sm:px-6 sm:py-7">
        <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 text-center sm:gap-5 ${showImages ? 'items-start' : 'items-center'}`}>
          <MatchTeam name={left} asset={leftImage} showImage={showImages} />
          <div className="self-center">
            <p className="whitespace-nowrap text-3xl font-strong leading-none tracking-[-0.04em] text-ink tabular-nums sm:text-5xl">
              {leftScore} <span className="text-ink-muted">–</span> {rightScore}
            </p>
            <p className="mt-2 text-xs font-medium text-ink-muted">{t('Match finished')}</p>
            {match.shootout && (
              <p className="mt-1 text-xs text-ink-soft">
                {t('Penalties {score}', { score: match.shootout.join('–') })}
              </p>
            )}
          </div>
          <MatchTeam name={right} asset={rightImage} showImage={showImages} />
        </div>
      </div>

      {(maps.length > 0 || moments.length > 0) && (
        <details className="group mx-4 border-t border-line sm:mx-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-sm text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            {t(maps.length > 0 ? 'Map scores' : 'Match events')}
            <ChevronDown size={16} className="shrink-0 text-ink-muted group-open:rotate-180" aria-hidden="true" />
          </summary>
          {maps.length > 0 ? (
            <table className="mb-3 w-full table-fixed text-left text-sm [overflow-wrap:anywhere]">
              <thead className="border-b border-line text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="pb-2 pr-3 font-medium">{t('Game or map')}</th>
                  <th scope="col" className="px-2 pb-2 text-right font-medium">{left}</th>
                  <th scope="col" className="pb-2 pl-2 text-right font-medium">{right}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {maps.map(({ name, scores }) => (
                  <tr key={name}>
                    <th scope="row" className="py-2 pr-3 font-medium">{name}</th>
                    <td className="px-2 py-2 text-right tabular-nums">{scores[0]}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{scores[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ol className="mb-3 divide-y divide-line text-sm">
              {moments.map(({ minute, label }) => (
                <li key={`${minute}-${label}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-2 py-2">
                  <span className="font-medium text-ink-muted tabular-nums">{minute}′</span>
                  <span className="text-ink [overflow-wrap:anywhere]">{label}</span>
                </li>
              ))}
            </ol>
          )}
        </details>
      )}

      <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-4 py-2 text-xs text-ink-muted sm:px-6">
        {t('Result source')}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-2 rounded-sm font-medium text-ink hover:underline">
            {source && <SourceLogo source={source} decorative />}
            <span className="[overflow-wrap:anywhere]">{source?.name ?? match.publisher}</span>
            <ArrowUpRight size={13} className="shrink-0 text-ink-muted" aria-hidden="true" />
          </a>
        ) : match.publisher}
      </div>
    </section>
  );
}
