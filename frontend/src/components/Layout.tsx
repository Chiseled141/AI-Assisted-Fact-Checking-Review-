import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Moon, ScanSearch, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className="btn-ghost p-2">
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-zinc-100 sm:px-3 ${
    isActive ? 'font-strong text-ink' : 'font-medium text-ink-muted hover:text-ink'
  }`;

export function Layout() {
  const home = useLocation().pathname === '/';
  const [scrolled, setScrolled] = useState(false);

  // The home header sits directly on the page background. Once content starts
  // sliding underneath it, soften into a frosted bar so text stays legible.
  useEffect(() => {
    if (!home) {
      setScrolled(false);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [home]);

  return (
    <div className={`flex min-h-screen flex-col ${home ? 'home-atmosphere' : ''}`}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header
        className={`sticky top-0 z-30 border-b transition-colors ${
          home
            ? scrolled
              ? 'border-line bg-page/85 backdrop-blur-md'
              : 'border-transparent bg-transparent'
            : 'border-line bg-page dark:border-white/[0.07] dark:bg-[#111715]'
        }`}
      >
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 rounded-md text-ink" aria-label="ClaimTrace home">
            <ScanSearch className="h-[22px] w-[22px] text-brand-600" strokeWidth={2.2} aria-hidden="true" />
            <span className="font-logo text-[19px] font-bold tracking-[-0.025em]">
              claimtrace<span className="text-brand-600">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <nav aria-label="Main">
              <ul className="flex items-center gap-1">
                <li>
                  <NavLink to="/" end className={navClass}>
                    New Check
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/history" className={navClass}>
                    History
                  </NavLink>
                </li>
              </ul>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
