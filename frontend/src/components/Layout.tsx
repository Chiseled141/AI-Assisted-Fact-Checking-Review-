import { NavLink, Outlet, Link } from 'react-router-dom';
import { Moon, ScanSearch, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

/** Thin vertical frame lines marking the content column. */
function Frame() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden sm:block">
      <div className="mx-auto h-full max-w-6xl border-x border-line" />
    </div>
  );
}

/** Small square marker where a horizontal rule meets the frame. */
export function CornerMarks() {
  return (
    <>
      <span aria-hidden="true" className="absolute -bottom-[4px] -left-[4px] hidden h-2 w-2 border border-line-strong bg-page sm:block" />
      <span aria-hidden="true" className="absolute -bottom-[4px] -right-[4px] hidden h-2 w-2 border border-line-strong bg-page sm:block" />
    </>
  );
}

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
  `whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm transition-colors sm:px-3 ${
    isActive ? 'bg-zinc-100 font-medium text-ink' : 'text-ink-muted hover:text-ink'
  }`;

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Frame />
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-t-2 border-b-line border-t-flame bg-page/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2 rounded-lg text-ink" aria-label="ClaimTrace home">
            <ScanSearch className="h-5 w-5 text-flame" strokeWidth={2.2} aria-hidden="true" />
            <span className="text-lg font-semibold tracking-tight">ClaimTrace</span>
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
          <CornerMarks />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-5 font-mono text-xs text-ink-muted sm:px-6">
          ClaimTrace demo · simulated results using illustrative fixture data · no AI or network calls
        </div>
      </footer>
    </div>
  );
}
