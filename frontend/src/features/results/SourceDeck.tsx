import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import type {
  Claim,
  EvidenceRelation,
  EvidenceSnapshot,
  FreshnessJudgment,
} from '../../types/models';
import { safeHref, safeImageSrc } from '../../lib/format';
import { findSource, isVietnameseSource } from '../../lib/sources';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { RelationChip } from '../../components/Badges';
import { SourceLogo } from '../../components/SourceLogo';
import { getLanguage, t, translated } from '../../lib/i18n';
import { useAccount } from '../../services/account';

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
      {/* A dark fade plus a text shadow keeps the text readable on bright photos. Both stay mounted so one can fade into the other. */}
      <div
        aria-hidden="true"
        style={{ opacity: fade === 'low' ? 1 : 0 }}
        className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-black/90 via-black/60 to-black/5 transition-opacity duration-500 sm:h-3/4 sm:from-black/85 sm:via-black/55 sm:to-transparent"
      />
      <div
        aria-hidden="true"
        style={{ opacity: fade === 'full' ? 1 : 0 }}
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/70 to-black/50 transition-opacity duration-500"
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
          {source?.about && <p className="mt-0.5 text-xs leading-snug text-[#fff]/90">{t(source.about)}</p>}
          {judgment?.status === 'outdated' && (
            <p className="mt-1.5 text-xs font-semibold text-[#fcd34d]">{t('Outdated')}</p>
          )}
        </div>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={item.url}
            aria-label={t('Visit source: {title} (opens in a new tab)', { title: item.sourceTitle })}
            className="press-lift relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#fff]/60 bg-black/40 px-3 after:absolute after:inset-x-0 after:-inset-y-2 text-xs font-medium text-[#fff] backdrop-blur-sm hover:border-[#fff] hover:bg-black/60"
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
        <span className="max-h-[300px] truncate text-[16px] font-medium leading-tight tracking-[-0.01em]">
          {item.sourceTitle}
        </span>
        {item.publisher && (
          <span className="max-h-[300px] truncate text-xs font-semibold leading-tight text-[#a5d8ff]">{item.publisher}</span>
        )}
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

/** The saved passage and its relation to the claim, without a second AI assessment. */
function SourceDetail({ item, judgment, className = '' }: {
  item: EvidenceSnapshot;
  judgment?: FreshnessJudgment;
  className?: string;
}) {
  const source = findSource(item.url);
  // The quote always stays as the source wrote it. A translation only ever appears beside it.
  const translation = item.translations?.[getLanguage()];
  return (
    <div className={className}>
      {source?.trust === 'red' && (
        <p className="mb-3 flex items-start gap-1.5 text-[13px] text-rose-700">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('This source is rated unreliable, so it should not be treated as evidence.')}
        </p>
      )}
      <p className="text-[13px] font-medium text-ink-muted">{t('What this source says')}</p>
      <blockquote className="mt-2 break-words text-[22px] font-semibold leading-[1.2] tracking-[-0.025em] text-ink sm:text-[28px]">
        <span className="sr-only">{t('Saved excerpt:')} </span>“{item.excerpt}”
      </blockquote>
      {translation && (
        <p className="mt-2 break-words text-[15px] leading-[1.5] text-ink-soft">
          <span className="font-medium text-ink-muted">{t('Translation:')} </span>{translation}
        </p>
      )}
      <p className={`mt-2 text-[18px] italic leading-snug tracking-[-0.01em] sm:text-[22px] ${relationTone[item.relation]}`}>
        {relationSentence[item.relation]}
      </p>
      {judgment?.reason && judgment.status === 'outdated' && (
        <p className="mt-3 text-[13px] text-ink-soft">
          <span className="font-semibold text-candy">{t('Why outdated:')} </span>{judgment.reason}
        </p>
      )}
    </div>
  );
}

const HOVER_OPEN_DELAY_MS = 120;
const TEXT_FADE_MS = 120;
const CLOSED_CARD_WIDTH = 124;
const CARD_GAP = 14;
const CARD_BORDERS = 4;
const OPEN_CARD_MAX_WIDTH = 1240;

/**
 * The text inside a card in the row. The card's width animates, so the open text is held at the width
 * it ends up with: the card reveals it instead of rewrapping it. The old text fades out before the new one comes in.
 */
function DeckCardContent({
  item,
  isOpen,
  cardCount,
  judgment,
  onOpen,
}: {
  item: EvidenceSnapshot;
  isOpen: boolean;
  cardCount: number;
  judgment?: FreshnessJudgment;
  onOpen: () => void;
}) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [showOpen, setShowOpen] = useState(isOpen);

  useEffect(() => {
    if (showOpen === isOpen) return;
    const timer = setTimeout(() => setShowOpen(isOpen), reduceMotion ? 0 : TEXT_FADE_MS);
    return () => clearTimeout(timer);
  }, [isOpen, showOpen, reduceMotion]);

  const closedSpace = (cardCount - 1) * (CLOSED_CARD_WIDTH + CARD_GAP) + CARD_BORDERS;
  return (
    <div
      style={{ opacity: showOpen === isOpen ? 1 : 0, transitionDuration: `${TEXT_FADE_MS}ms` }}
      className="absolute inset-0 transition-opacity"
    >
      {showOpen ? (
        <div
          key="open"
          className="press-rise absolute inset-y-0 left-0"
          style={
            {
              width: `min(${OPEN_CARD_MAX_WIDTH - CARD_BORDERS}px, calc(100cqw - ${closedSpace}px))`,
              '--press-delay': '120ms',
            } as CSSProperties
          }
        >
          <OpenCardContent item={item} judgment={judgment} />
        </div>
      ) : (
        <div key="closed" className="press-rise h-full" style={{ '--press-delay': '200ms' } as CSSProperties}>
          <ClosedCardContent item={item} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}

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
  const preference = useAccount()?.preferredSourceLanguage;
  const vietnameseFirst = (preference ?? getLanguage()) === 'vi';
  const items = preference || vietnameseFirst
    ? [...allItems].sort((a, b) =>
      (Number(isVietnameseSource(b.url)) - Number(isVietnameseSource(a.url))) * (vietnameseFirst ? 1 : -1))
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
            <SourceDetail item={item} judgment={judgmentFor(item.id)} className="px-4 pb-4 pt-4 sm:px-5" />
          </CardShell>
        ))}
      </ol>
    );
  }

  const open = items.find((item) => item.id === openId) ?? items[0];

  return (
    <>
      <ol className="flex h-[400px] w-full gap-3.5 [container-type:inline-size]" aria-label={label}>
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
              <DeckCardContent
                item={item}
                isOpen={isOpen}
                cardCount={items.length}
                judgment={judgmentFor(item.id)}
                onOpen={() => setOpenId(item.id)}
              />
            </CardShell>
          );
        })}
      </ol>
      <SourceDetail item={open} judgment={judgmentFor(open.id)} className="mt-5" />
    </>
  );
}
