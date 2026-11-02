import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { type Language, setLanguage, t, useLanguage } from '../lib/i18n';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-zinc-100 sm:px-3 sm:text-base ${
    isActive ? 'font-strong text-ink' : 'font-medium text-ink-muted hover:text-ink'
  }`;

const languages: { code: Language; short: string; name: string }[] = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'vi', short: 'VI', name: 'Tiếng Việt' },
];

function LanguageSwitcher() {
  const current = useLanguage();
  return (
    <div role="group" aria-label={t('Language')} className="flex items-center border-l border-line pl-1.5 sm:pl-2">
      {languages.map(({ code, short, name }) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-label={name}
          title={name}
          aria-pressed={current === code}
          onClick={() => setLanguage(code)}
          className={`rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-zinc-100 sm:text-base ${
            current === code ? 'font-strong text-ink' : 'font-medium text-ink-muted hover:text-ink'
          }`}
        >
          {short}
        </button>
      ))}
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
              ? 'border-line bg-page/85 backdrop-blur-md'
              : 'border-transparent bg-transparent'
            : 'border-line bg-page'
        }`}
      >
        <div
          className={`relative mx-auto flex items-center justify-between gap-4 px-4 py-3 ${
            press ? 'max-w-[1240px] sm:px-8' : 'max-w-6xl sm:px-6'
          }`}
        >
          <Link to="/" className="flex items-center gap-2 rounded-md text-ink" aria-label={t('ClaimTrace home')}>
            <ScanSearch className="h-[22px] w-[22px] text-brand-600 sm:h-[26px] sm:w-[26px]" strokeWidth={2.2} aria-hidden="true" />
            <span className="hidden font-logo text-[19px] font-bold tracking-[-0.025em] min-[440px]:inline sm:text-[23px]">
              claimtrace<span className="text-brand-600">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
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
