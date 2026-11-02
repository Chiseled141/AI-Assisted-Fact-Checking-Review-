import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, ImageIcon, Info, TriangleAlert } from 'lucide-react';
import type {
  Claim,
  EvidenceRelation,
  EvidenceSnapshot,
  FreshnessJudgment,
  PageCapture,
  SourceAnalysis,
} from '../../types/models';
import { formatCalendarDate, formatExactDateTime, formatExactParts, safeHref, safeImageSrc } from '../../lib/format';
import { findSource, isVietnameseSource } from '../../lib/sources';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { FreshnessText, RelationChip, SourceTrustMark } from '../../components/Badges';
import { SourceLogo } from '../../components/SourceLogo';
import { judgeColor, RatingChart } from './RatingChart';
import { judgeLogo } from '../../lib/judges';
import { demoMode } from '../../services';
import { getLanguage, t, translated } from '../../lib/i18n';

function CaptureView({ capture, title }: { capture: PageCapture; title: string }) {
  const [open, setOpen] = useState(false);
  const src = safeImageSrc(capture.url);
  if (!src) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t(open ? 'Hide page capture of {title}' : 'Show page capture of {title}', { title })}
        className="inline-flex min-h-6 items-center gap-1 text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? t('Hide page capture') : t('Page capture')}
      </button>
      {open && (
        <img
          src={src}
          alt={t('Page capture of {title}', { title })}
          width={capture.width}
          height={capture.height}
          className="rise-in mt-2 w-full border border-line"
        />
      )}
    </div>
  );
}

/**
 * The article's lead image behind a card's content. The image comes from the publisher, so it can
 * disappear at any time; then, or when a source has no image, a solid dark block keeps white text readable.
 */
function SourcePhoto({ item, fade }: { item: EvidenceSnapshot; fade: 'low' | 'full' }) {
  const [failed, setFailed] = useState(false);
  const src = item.imageUrl && !failed ? safeImageSrc(item.imageUrl) : null;
  if (!src) return null;
  return (
    <>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="press-photo absolute inset-0 h-full w-full object-cover"
      />
      {/* A light fade plus a text shadow keeps the text readable and the photo visible. */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t ${
          fade === 'low' ? 'h-[90%] from-black/75 via-black/45 to-transparent sm:h-2/3 sm:from-black/70 sm:via-black/35' : 'h-full from-black/70 via-black/30 to-black/10'
        }`}
      />
    </>
  );
}

/** An open source: one chip at the top, everything else low on the photo. */
function OpenCardContent({ item, judgment }: { item: EvidenceSnapshot; judgment?: FreshnessJudgment }) {
  const href = safeHref(item.url);
  const source = findSource(item.url);
  const hostname = href ? new URL(href).hostname : item.url;

  return (
    <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
      <div>
        <RelationChip relation={item.relation} />
      </div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64 text-[#fff] [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]">
          <h4 className="text-[20px] font-medium leading-[1.2] tracking-[-0.015em] sm:text-[22px]">{item.sourceTitle}</h4>
          <p className="mt-2 flex items-center gap-2 text-[14px] font-semibold leading-snug text-[#a5d8ff]">
            {source && (
              <span className="shrink-0 rounded bg-[#fff] p-0.5">
                <SourceLogo source={source} decorative={!!item.publisher} />
              </span>
            )}
            <span className="min-w-0">{item.publisher ?? hostname}</span>
          </p>
          {source?.about && <p className="mt-0.5 text-xs leading-snug text-[#fff]/75">{t(source.about)}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#fff]/75">
            <SourceTrustMark trust={source?.trust ?? null} onPhoto />
            {judgment?.status === 'outdated' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#fcd34d]">{t('Outdated')}</span>
              </>
            )}
          </p>
        </div>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={item.url}
            aria-label={t('Visit source: {title} (opens in a new tab)', { title: item.sourceTitle })}
            className="press-lift inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#fff]/60 bg-black/40 px-3 text-xs font-medium text-[#fff] backdrop-blur-sm hover:border-[#fff] hover:bg-black/60"
          >
            {t('Visit source')}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

/** A closed source: a narrow strip with its title running up the side. */
function ClosedCardContent({ item, onOpen }: { item: EvidenceSnapshot; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={t('Show source: {title}', { title: item.sourceTitle })}
      className="relative flex h-full w-full flex-col justify-between overflow-hidden p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#fff]"
    >
      <span className="block max-w-full">
        <RelationChip relation={item.relation} />
      </span>
      <span className="flex rotate-180 flex-col gap-1 self-start text-[#fff] [text-shadow:0_1px_6px_rgb(0_0_0/0.6)] [writing-mode:vertical-rl]">
        <span className="max-h-[300px] truncate text-[16px] font-medium leading-tight tracking-[-0.01em]">{item.sourceTitle}</span>
        {item.publisher && <span className="max-h-[300px] truncate text-xs font-semibold leading-tight text-[#a5d8ff]">{item.publisher}</span>}
      </span>
    </button>
  );
}

const relationSentence = translated<EvidenceRelation>({
  supporting: 'This source supports the claim.',
  contradicting: 'This source contradicts the claim.',
  contextual: 'This source gives background but does not settle the claim.',
});

const relationTone: Record<EvidenceRelation, string> = {
  supporting: 'text-emerald-700',
  contradicting: 'text-rose-600',
  contextual: 'text-ink-muted',
};

/** Marked with a "+", in the style of the spec lists on the reference page. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3">
      <dt className="flex gap-2 text-[14px] leading-snug text-ink-muted before:font-semibold before:text-orange-600 before:content-['+']">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-[14px] font-medium leading-snug text-ink">{children}</dd>
    </div>
  );
}

/**
 * The longer reading of a source, sliding open below its details. It stays mounted so the height can
 * animate; `visibility` keeps it out of the tab order and away from screen readers while closed.
 */
function AnalysisPanel({ id, analysis, open }: { id: string; analysis: SourceAnalysis; open: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const everOpened = useRef(open);
  everOpened.current ||= open;
  return (
    <div
      id={id}
      ref={panel}
      style={{ gridTemplateRows: open ? '1fr' : '0fr', visibility: open ? 'visible' : 'hidden' }}
      onTransitionEnd={(event) => {
        if (open && event.target === panel.current && event.propertyName === 'grid-template-rows') {
          panel.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }}
      className="grid scroll-mb-6 scroll-mt-20 transition-[grid-template-rows,visibility] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
    >
      <div className="min-h-0 overflow-hidden">
        <div className="mt-6 border-t border-line pt-6">
          {/* The one bold block on the page, like the reference page's dark panels. */}
          <div className="grid gap-6 rounded-xl bg-indigo-950 p-5 sm:p-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
            <section>
              <h3 className="text-[13px] font-medium text-orange-300">{t('Analysis')}</h3>
              <p className="mt-3 text-[20px] font-medium leading-[1.35] tracking-[-0.02em] text-page sm:text-[24px]">
                {analysis.assessment}
              </p>
            </section>
            <section>
              <h3 className="text-[13px] font-medium text-orange-300">{t('In the article')}</h3>
              <ul className="mt-3 space-y-2.5 text-[14px] leading-[1.55] text-page">
                {analysis.keyPoints.map((point) => (
                  <li key={point} className="flex gap-2.5 before:font-semibold before:text-orange-300 before:content-['+']">
                    <span className="min-w-0">{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
            <section>
              <h3 className="inline text-[20px] font-semibold tracking-[-0.02em] text-ink">
                {t('How both AI models rated this source')}
              </h3>{' '}
              <span className="ml-1 whitespace-nowrap text-[18px] italic tracking-[-0.01em] text-orange-700">{t('(out of 100.)')}</span>
              <div className="mt-3">
                <RatingChart notes={analysis.judgeNotes} showChart={everOpened.current} />
              </div>
            </section>
            <section>
              <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">{t('Comments from both AI models')}</h3>
              <ul className="mt-4 space-y-5">
                {analysis.judgeNotes.map(({ judge, note }, index) => (
                  <li key={judge}>
                    <span
                      className="inline-flex items-center gap-1.5 rounded py-1 pl-1 pr-2 text-[13px] font-semibold leading-none text-on-primary"
                      style={{ backgroundColor: judgeColor[index] }}
                    >
                      {/* On white, because some labs' logos are dark and others are in color. */}
                      {judgeLogo(judge) && (
                        <img src={judgeLogo(judge)} alt="" className="h-[18px] w-[18px] shrink-0 rounded-[3px] bg-white p-0.5" draggable={false} />
                      )}
                      {judge}
                    </span>
                    <p className="mt-2 text-[15px] leading-[1.6] text-ink-soft">{note}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <p className="mt-6 flex items-start gap-1.5 text-[13px] text-ink-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {demoMode
              ? t('Demo: the analysis, scores and comments are simulated, not produced by a real AI model.')
              : t('Written by the AI models from this page’s text. They can be wrong, so check the source.')}
          </p>
        </div>
      </div>
    </div>
  );
}

/** What the source says and how it relates to the claim, beside the facts about the snapshot. */
function SourceDetail({
  item,
  cited,
  judgment,
  className = '',
}: {
  item: EvidenceSnapshot;
  cited: boolean;
  judgment?: FreshnessJudgment;
  className?: string;
}) {
  // Kept when another source opens, so the analysis stays open while moving between sources.
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const source = findSource(item.url);
  const href = safeHref(item.url);
  const analysisId = `source-analysis-${item.id}`;
  return (
    <div className={className}>
      <div key={item.id} className="rise-in grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        <div>
          {source?.trust === 'red' && (
            <p className="mb-3 flex items-start gap-1.5 text-[13px] text-rose-700">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('This source is rated unreliable, so it should not be treated as evidence.')}
            </p>
          )}

          <p className="text-[13px] font-medium text-ink-muted">{t('What this source says')}</p>
          <blockquote className="mt-2 text-[22px] font-semibold leading-[1.2] tracking-[-0.025em] text-ink sm:text-[28px]">
            <span className="sr-only">{t('Saved excerpt:')} </span>“{item.excerpt}”
          </blockquote>
          <p className={`mt-2 text-[18px] italic leading-snug tracking-[-0.01em] sm:text-[22px] ${relationTone[item.relation]}`}>
            {relationSentence[item.relation]}
          </p>
          {item.analysis && <p className="mt-4 text-[15px] leading-[1.65] text-ink-soft">{item.analysis.summary}</p>}

          {judgment?.reason && judgment.status === 'outdated' && (
            <p className="mt-2 text-[13px] text-ink-soft">
              <span className="font-semibold text-candy">{t('Why outdated:')} </span>
              {judgment.reason}
            </p>
          )}

          {item.analysis && (
            <button
              type="button"
              onClick={() => setAnalysisOpen((v) => !v)}
              aria-expanded={analysisOpen}
              aria-controls={analysisId}
              aria-label={t(analysisOpen ? 'Hide analysis: {title}' : 'See analysis: {title}', { title: item.sourceTitle })}
              className="press-lift mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-indigo-700 px-4 text-sm font-medium text-on-primary transition-colors hover:bg-indigo-800"
            >
              {analysisOpen ? t('Hide analysis') : t('See analysis')}
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${analysisOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        <div>
          <dl className="space-y-3 lg:pt-6">
            <DetailRow label={t('Website')}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-4 transition-colors hover:text-indigo-800 hover:decoration-indigo-700"
                >
                  {new URL(href).hostname}
                </a>
              ) : (
                item.url
              )}
            </DetailRow>
            <DetailRow label={t('Used in verdict')}>
              <span
                className={`inline-block rounded px-2 py-0.5 text-[13px] font-semibold ${
                  cited ? 'bg-indigo-700 text-on-primary' : 'bg-zinc-200 text-ink'
                }`}
              >
                {cited ? t('Yes') : t('No')}
              </span>
            </DetailRow>
            <DetailRow label={t('Published')}>
              {item.publishedAt ? <time dateTime={item.publishedAt}>{formatCalendarDate(item.publishedAt)}</time> : t('Unknown')}
            </DetailRow>
            <DetailRow label={t('Retrieved')}>
              <time dateTime={item.retrievedAt} title={formatExactDateTime(item.retrievedAt)}>
                {formatExactParts(item.retrievedAt).date}
                <span className="block text-[13px] font-normal text-ink-muted">{formatExactParts(item.retrievedAt).time}</span>
              </time>
            </DetailRow>
            {item.updatedAt && (
              <DetailRow label={t('Updated')}>
                <time dateTime={item.updatedAt}>{formatCalendarDate(item.updatedAt)}</time>
              </DetailRow>
            )}
            {cited && judgment?.status !== 'outdated' && (
              <DetailRow label={t('Freshness')}>
                <FreshnessText status={judgment?.status ?? 'unknown'} />
                {judgment?.reason && <span className="mt-0.5 block text-[13px] font-normal text-ink-muted">{judgment.reason}</span>}
              </DetailRow>
            )}
          </dl>
          {item.capture && (
            <div className="mt-2 text-[13px]">
              <CaptureView capture={item.capture} title={item.sourceTitle} />
            </div>
          )}
        </div>
      </div>
      {item.analysis && <AnalysisPanel id={analysisId} analysis={item.analysis} open={analysisOpen} />}
    </div>
  );
}

const HOVER_OPEN_DELAY_MS = 120;

function CardShell({
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  className: string;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}) {
  return (
    <li
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`press-card press-rise overflow-hidden rounded-xl border-2 border-ink ${className}`}
    >
      {children}
    </li>
  );
}

interface Props {
  claim: Claim;
  items: EvidenceSnapshot[];
  citedIds: Set<string>;
  freshness: Record<string, FreshnessJudgment>;
}

/**
 * The sources behind a claim. Wide screens: a row of cards where one is open and the rest are narrow
 * strips. Phones: strips can't hold their text, so every source is shown open, stacked.
 */
export function SourceDeck({ claim, items: allItems, citedIds, freshness }: Props) {
  // In Vietnamese, Vietnamese newspapers come first.
  const items =
    getLanguage() === 'vi'
      ? [...allItems].sort((a, b) => Number(isVietnameseSource(b.url)) - Number(isVietnameseSource(a.url)))
      : allItems;
  const wide = useMediaQuery('(min-width: 1024px)');
  const [openId, setOpenId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Hovering a strip opens it, after a short pause so crossing the row on the way elsewhere doesn't.
  function hoverOpen(id: string) {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpenId(id), HOVER_OPEN_DELAY_MS);
  }
  const judgmentFor = (id: string) => (citedIds.has(id) ? freshness[id] : undefined);
  const label = t('Evidence snapshots for claim {position}', { position: claim.position });

  if (!wide) {
    return (
      <ol className="space-y-5" aria-label={label}>
        {items.map((item) => (
          <CardShell key={item.id} className="bg-white">
            <div className="relative min-h-[300px] overflow-hidden bg-[#16181a] sm:aspect-[16/9] sm:min-h-0">
              <SourcePhoto item={item} fade="low" />
              <div className="relative h-full min-h-[300px] sm:min-h-0">
                <OpenCardContent item={item} judgment={judgmentFor(item.id)} />
              </div>
            </div>
            <SourceDetail
              item={item}
              cited={citedIds.has(item.id)}
              judgment={judgmentFor(item.id)}
              className="px-4 pb-4 pt-4 sm:px-5"
            />
          </CardShell>
        ))}
      </ol>
    );
  }

  const open = items.find((item) => item.id === openId) ?? items[0];

  return (
    <>
      <ol className="flex h-[400px] w-full gap-3.5" aria-label={label}>
        {items.map((item, index) => {
          const isOpen = item.id === open.id;
          return (
            <CardShell
              key={item.id}
              className={`relative min-w-0 bg-[#16181a] transition-[flex-grow,max-width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isOpen ? 'max-w-[1240px]' : 'max-w-[124px]'
              }`}
              style={{ flexGrow: isOpen ? 3 : 1, flexBasis: 0, '--press-delay': `${index * 70}ms` } as CSSProperties}
              onMouseEnter={() => hoverOpen(item.id)}
              onMouseLeave={() => clearTimeout(hoverTimer.current)}
            >
              <SourcePhoto item={item} fade={isOpen ? 'low' : 'full'} />
              {isOpen ? (
                <div className="press-rise relative h-full" style={{ '--press-delay': '180ms' } as CSSProperties}>
                  <OpenCardContent item={item} judgment={judgmentFor(item.id)} />
                </div>
              ) : (
                <ClosedCardContent item={item} onOpen={() => setOpenId(item.id)} />
              )}
            </CardShell>
          );
        })}
      </ol>
      <SourceDetail item={open} cited={citedIds.has(open.id)} judgment={judgmentFor(open.id)} className="mt-5" />
    </>
  );
}
