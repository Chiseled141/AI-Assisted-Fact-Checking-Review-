import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Check, ChevronDown, Globe, ScanSearch } from 'lucide-react';
import { type Language, setLanguage, t, useLanguage } from '../lib/i18n';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-sm transition-colors hover:bg-zinc-100 sm:min-h-8 ${
    isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'
  }`;

const languages: { code: Language; short: string; name: string }[] = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'vi', short: 'VI', name: 'Tiếng Việt' },
];

function LanguageSwitcher() {
  const current = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = languages.find(({ code }) => code === current) ?? languages[0];

  useEffect(() => {
    if (!open) return;
    items.current[languages.indexOf(selected)]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, selected]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = items.current.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items.current[(index + step + languages.length) % languages.length]?.focus();
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={`${t('Language')}: ${selected.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink sm:min-h-8"
      >
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
        {/* A phone has room for the code only. */}
        <span className="sm:hidden">{selected.short}</span>
        <span className="hidden sm:inline">{selected.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('Language')}
          onKeyDown={onMenuKeyDown}
          className="rise-in absolute right-0 top-full z-40 mt-1 min-w-36 rounded-md border border-line bg-white p-1 shadow-sm"
        >
          {languages.map(({ code, name }, index) => (
            <button
              key={code}
              ref={(item) => {
                items.current[index] = item;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={current === code}
              lang={code}
              onClick={() => {
                setLanguage(code);
                setOpen(false);
                trigger.current?.focus();
              }}
              className="flex min-h-11 w-full items-center justify-between gap-4 rounded px-2 text-left text-sm text-ink transition-colors hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none sm:min-h-8"
            >
              {name}
              {current === code && <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const home = pathname === '/';
  const press = pathname.startsWith('/checks/');
  const atmosphere = home || press;
  const [scrolled, setScrolled] = useState(false);

  // The home header sits directly on the page background. Once content starts
  // sliding underneath it, soften into a frosted bar so text stays legible.
  useEffect(() => {
    if (!atmosphere) {
      setScrolled(false);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [atmosphere]);

  return (
    <div className={`flex min-h-screen flex-col ${atmosphere ? 'home-atmosphere' : ''} ${press ? 'press' : ''}`}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('Skip to content')}
      </a>
      <header
        className={`sticky top-0 z-30 border-b transition-colors ${
          atmosphere
            ? scrolled
              ? 'border-line bg-page/95 backdrop-blur-md'
              : 'border-transparent bg-transparent'
            : 'border-line bg-page'
        }`}
      >
        <div
          className={`relative mx-auto flex items-center justify-between gap-2 px-4 py-2 sm:gap-4 ${
            press ? 'max-w-[1240px] sm:px-8' : 'max-w-6xl sm:px-6'
          }`}
        >
          <Link to="/" className="flex min-h-11 min-w-8 items-center gap-2 min-[360px]:min-w-11 rounded-md text-ink sm:min-h-0 sm:min-w-0" aria-label={t('ClaimTrace home')}>
            <ScanSearch className="h-5 w-5 text-brand-600" strokeWidth={2} aria-hidden="true" />
            <span className="hidden font-logo text-[17px] font-medium tracking-[-0.02em] min-[440px]:inline">
              claimtrace<span className="text-brand-600">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <nav aria-label={t('Main')}>
              <ul className="flex items-center gap-1">
                <li>
                  <NavLink to="/" end className={navClass}>
                    {t('New Check')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/history" className={navClass}>
                    {t('History')}
                  </NavLink>
                </li>
              </ul>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
