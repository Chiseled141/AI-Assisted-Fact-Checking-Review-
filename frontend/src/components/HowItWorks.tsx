import { type ReactNode, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, CornerDownRight, Landmark, Search } from 'lucide-react';
import { config } from '../config';
import { getLanguage, t } from '../lib/i18n';

/** True while the element is on screen, so the demos only play when someone can see them. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

/**
 * The frame a demo is on, looping from 0 to `frames - 1` while it is visible.
 * Without motion (reduced motion, off screen at first, tests) it rests on the last frame, which shows everything.
 */
function useFrame(frames: number, active: boolean, ms = 1100) {
  const [frame, setFrame] = useState(frames - 1);
  useEffect(() => {
    if (!active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setFrame(0);
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frames), ms);
    return () => window.clearInterval(timer);
  }, [active, frames, ms]);
  return frame;
}

/** Fades and lifts a demo element in once its frame is reached. */
function Appear({ when, children, className = '' }: { when: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className={`transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        when ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

const panel = 'rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgb(0_0_0_/_0.04),0_8px_24px_-12px_rgb(0_0_0_/_0.12)]';

function ClaimsDemo({ frame }: { frame: number }) {
  const vi = getLanguage() === 'vi';
  const sentences = vi
    ? ['Tuyến đường sắt đô thị Cát Linh - Hà Đông chính thức vận hành thương mại ngày 6/11/2021.', ' Đây là tuyến đường sắt đô thị đầu tiên của Việt Nam.']
    : ['Hanoi’s Cát Linh - Hà Đông metro began commercial service on 6 November 2021.', ' It was Vietnam’s first urban railway line.'];
  const claims = [
    { icon: CalendarDays, text: vi ? 'Cát Linh - Hà Đông vận hành thương mại từ 6/11/2021' : 'Cát Linh - Hà Đông began service on 6 Nov 2021' },
    { icon: Landmark, text: vi ? 'Tuyến đường sắt đô thị đầu tiên của Việt Nam' : 'Vietnam’s first urban railway line' },
  ];
  return (
    <div className="space-y-3">
      <div className={`${panel} p-4 text-[14px] leading-[1.7] text-ink-soft`}>
        {sentences.map((sentence, index) => (
          <span
            key={sentence}
            className={`rounded-[4px] transition-colors duration-500 ${frame >= 1 + index * 2 ? 'bg-brand-100 text-ink' : ''}`}
          >
            {sentence}
          </span>
        ))}
      </div>
      {claims.map(({ icon: Icon, text }, index) => (
        <Appear key={text} when={frame >= 2 + index * 2} className="ml-5">
          <div className={`${panel} flex items-center gap-3 px-4 py-3 text-[14px] text-ink`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate">{text}</span>
          </div>
        </Appear>
      ))}
    </div>
  );
}

const demoSources = [
  { name: 'VnExpress', domain: 'vnexpress.net', logo: '/source-logos/vnexpress-net.svg' },
  { name: 'Tuổi Trẻ', domain: 'tuoitre.vn', logo: '/source-logos/tuoitre-vn.svg' },
  { name: 'Reuters', domain: 'reuters.com', logo: '/source-logos/reuters-com.svg' },
];

function SourcesDemo({ frame }: { frame: number }) {
  return (
    <div className="space-y-3">
      <div className={`${panel} flex items-center gap-2.5 px-4 py-3 text-[14px] text-ink-muted`}>
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{t('Searching rated sources')}</span>
        <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 ${frame < 4 ? 'animate-pulse' : 'opacity-0'}`} />
      </div>
      {demoSources.map((source, index) => (
        <Appear key={source.domain} when={frame >= 1 + index}>
          <div className={`${panel} flex items-center gap-3 px-4 py-3`}>
            <img src={source.logo} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-line bg-white object-contain p-1" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{source.name}</p>
              <div className="mt-1.5 flex gap-1.5">
                <span className="h-1.5 w-10 rounded-full bg-zinc-200" />
                <span className="h-1.5 w-16 rounded-full bg-brand-200" />
                <span className="h-1.5 w-8 rounded-full bg-zinc-200" />
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] text-brand-700">{t('Rated')}</span>
          </div>
        </Appear>
      ))}
      <Appear when={frame >= 4}>
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-faint">
          <span className="h-8 w-8 shrink-0 rounded-lg bg-zinc-100" />
          <span className="min-w-0 flex-1 truncate line-through">random-blog.example</span>
          <span className="shrink-0">{t('Skipped')}</span>
        </div>
      </Appear>
    </div>
  );
}

const demoJudges = config.judges.defaultIds.map((id) => config.judges.options.find((option) => option.id === id)!);

function JudgesDemo({ frame }: { frame: number }) {
  const confidences = [86, 81];
  return (
    <div className="space-y-3">
      {demoJudges.map((judge, index) => {
        const done = frame >= 1 + index;
        return (
          <div key={judge.id} className={`${panel} px-4 py-3.5`}>
            <div className="flex items-center gap-3">
              <img src={judge.logo} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-line bg-white object-contain p-1.5" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{judge.name}</span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] transition-colors duration-500 ${
                  done ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-ink-muted'
                }`}
              >
                {done ? t('Supported') : t('Reading…')}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-700 transition-[width] duration-700 ease-out"
                  style={{ width: done ? `${confidences[index]}%` : '0%' }}
                />
              </div>
              <span className={`w-9 text-right text-[12px] tabular-nums text-ink-muted transition-opacity ${done ? 'opacity-100' : 'opacity-0'}`}>
                {confidences[index]}%
              </span>
            </div>
          </div>
        );
      })}
      <Appear when={frame >= 3}>
        <p className="flex items-center gap-2 px-1 text-[14px] text-ink-soft">
          <Check className="h-4 w-4 text-emerald-700" />
          {t('Both models agree')}
        </p>
      </Appear>
    </div>
  );
}

function FollowUpDemo({ frame }: { frame: number }) {
  return (
    <div className="space-y-3">
      <Appear when={frame >= 1} className="flex flex-col items-end">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] text-ink-faint">
          <CornerDownRight className="h-3.5 w-3.5" />
          {t('Replying to VnExpress')}
        </p>
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-[14px] leading-[1.6] text-ink">
          {t('Does this source give the exact opening date?')}
        </p>
      </Appear>
      <div className="min-h-[7.5rem]">
        {frame === 2 ? (
          <div className="flex gap-1 px-1 py-3">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" style={{ animationDelay: `${dot * 150}ms` }} />
            ))}
          </div>
        ) : (
          <Appear when={frame >= 3}>
            <p className="text-[14px] leading-[1.7] text-ink-soft">
              {t('Yes. The saved passage gives 6 November 2021 as the first day of commercial service.')}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[12px] text-ink-muted">
                <img src={demoSources[0].logo} alt="" className="h-3.5 w-3.5 object-contain" />
                {demoSources[0].domain}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] text-ink-muted">{t('Verdict unchanged')}</span>
            </div>
          </Appear>
        )}
      </div>
    </div>
  );
}

const cards = [
  {
    title: 'Split into claims',
    text: 'Paste text, a link or a file. Up to five factual claims are kept, each with its date, and opinions are left out.',
    frames: 6,
    Demo: ClaimsDemo,
  },
  {
    title: 'Search rated sources',
    text: 'Each claim is searched only on sites rated reliable. The exact passages used are saved, so every verdict can be traced.',
    frames: 7,
    Demo: SourcesDemo,
  },
  {
    title: 'Two models judge',
    text: 'Two AI models read the same passages and give separate verdicts with citations. When they disagree, you see both.',
    frames: 6,
    Demo: JudgesDemo,
  },
  {
    title: 'Ask about the results',
    text: 'Ask follow-up questions about a source, a chart or a verdict. The selected model can search when needed. Answers never change a verdict.',
    frames: 6,
    Demo: FollowUpDemo,
  },
];

function HowItWorksCard({ title, text, frames, Demo }: (typeof cards)[number]) {
  const [ref, inView] = useInView<HTMLElement>();
  const frame = useFrame(frames, inView);
  return (
    <article
      ref={ref}
      className="flex min-w-0 flex-col overflow-hidden rounded-[28px] border border-line bg-white/70 backdrop-blur-sm"
    >
      <div className="px-6 pt-7 sm:px-9 sm:pt-9">
        <h3 className="text-[19px] font-medium leading-snug tracking-[-0.015em] text-ink sm:text-[21px]">{t(title)}</h3>
        <p className="mt-2 max-w-[28rem] text-[15px] leading-[1.65] text-ink-soft">{t(text)}</p>
      </div>
      {/* The picture repeats what the text says, so screen readers skip it. */}
      <div aria-hidden="true" className="mt-auto px-6 pb-7 pt-8 sm:px-9 sm:pb-9 sm:pt-10">
        <div className="mx-auto max-w-[26rem]">
          <Demo frame={frame} />
        </div>
      </div>
    </article>
  );
}

/** "How it works": four cards, one per stage of a check, each with a small looping picture of it. */
export function HowItWorks({ action }: { action?: ReactNode }) {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-medium text-brand-600">{t('Guide')}</p>
          <h2
            id="how-heading"
            className="mt-2.5 text-[28px] font-medium leading-[1.15] tracking-[-0.025em] text-ink sm:mt-3 sm:text-[38px]"
          >
            {t('How it works')}
          </h2>
          <p className="mx-auto mt-2.5 max-w-[30rem] text-[15px] leading-[1.65] text-ink-soft">
            {t('How a check runs — and where each verdict comes from.')}
          </p>
          {action}
        </div>
        <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <HowItWorksCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}
