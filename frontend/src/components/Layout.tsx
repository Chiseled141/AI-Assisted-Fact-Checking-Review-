import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigationType } from 'react-router-dom';
import { History, Menu, ScanLine, Settings, UserRound, X } from 'lucide-react';
import { t } from '../lib/i18n';
import { readItem, RUNNING_CHECK_KEY, writeItem } from '../lib/storage';
import { type Check, isTerminal } from '../types/models';
import { loadAccount, useAccount } from '../services/account';
import { LanguageSwitcher } from './LanguageSwitcher';

export interface CheckNavigationContext {
  reportCheck: (check: Pick<Check, 'id' | 'status'>) => void;
}

export function Layout() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const home = pathname === '/';
  const press = pathname.startsWith('/checks/');
  const atmosphere = home || press;
  const [pastComposer, setPastComposer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(() => readItem(RUNNING_CHECK_KEY) || null);
  const account = useAccount();
  const navId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const docked = !home || pastComposer;
  const reportCheck = useCallback<CheckNavigationContext['reportCheck']>((check) => {
    setRunningCheckId((current) => isTerminal(check.status) ? current === check.id ? null : current : check.id);
  }, []);

  // Who is signed in, for the name in the header. Signed out, it simply says "Account".
  useEffect(() => {
    if (account === undefined) loadAccount().catch(() => undefined);
  }, [account]);

  useEffect(() => {
    writeItem(RUNNING_CHECK_KEY, runningCheckId ?? '');
  }, [runningCheckId]);

  useLayoutEffect(() => {
    if (home && !hash && navigationType === 'PUSH') {
      document.scrollingElement?.scrollTo?.({ top: 0, behavior: 'instant' });
    }
  }, [home, hash, navigationType, key]);

  // Reveal the floating navigation once the home input has left the viewport.
  useEffect(() => {
    if (!home) {
      setPastComposer(false);
      return;
    }
    let frame = 0;
    const update = () => {
      const composer = document.getElementById('check-composer');
      setPastComposer(window.scrollY > 0 && (composer ? composer.getBoundingClientRect().bottom < 100 : window.scrollY > 160));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [home]);

  // Anchor actions also work after changing routes, without replacing a draft.
  useEffect(() => {
    setMenuOpen(false);
    if (!hash) return;
    const targets = ['#check-composer', '#how-it-works', '#find-check', '#check-results', '#followup-composer'];
    if (!targets.includes(hash)) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(hash.slice(1));
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target?.scrollIntoView?.({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
      if (hash === '#check-composer' || hash === '#followup-composer') {
        target?.querySelector('textarea')?.focus({ preventScroll: true });
      }
      if (hash === '#find-check') target?.querySelector('input')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      headerRef.current?.querySelector<HTMLButtonElement>('[aria-controls]')?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className={`flex min-h-screen flex-col ${atmosphere ? 'home-atmosphere' : ''} ${press ? 'press' : ''}`}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('Skip to content')}
      </a>
      <header
        ref={headerRef}
        className="site-header"
        data-docked={docked}
      >
        <div className="site-header-shell">
          <Link
            to="/"
            className="site-header-wordmark font-wordmark"
            aria-label={t('ClaimTrace home')}
          >
            ClaimTrace
          </Link>
          <div className="site-header-actions">
            <nav id={navId} aria-label={t('Main')} className={`site-header-nav ${menuOpen ? 'is-open' : ''}`}>
              <ul className="site-header-links">
                <li>
                  <Link to="/settings" className="site-header-link" aria-current={pathname === '/settings' ? 'page' : undefined}>
                    {!home && <Settings className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t('Settings')}
                  </Link>
                </li>
                <li>
                  <Link to="/history" className="site-header-link" aria-current={pathname === '/history' ? 'page' : undefined}>
                    {!home && <History className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t('History')}
                  </Link>
                </li>
                {!home && (
                  <li>
                    <Link to="/" className="site-header-check">
                      <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('New check')}
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
            <LanguageSwitcher />
            <Link to="/login" className="site-header-account"
              aria-label={account ? t('Account: {username}', { username: account.username }) : t('Account')}>
              <UserRound className="h-4 w-4" aria-hidden="true" />
              <span className="site-header-account-label max-w-[10rem] truncate">{account ? account.username : t('Account')}</span>
            </Link>
            <button
              type="button"
              className="site-header-menu"
              aria-label={menuOpen ? t('Close navigation') : t('Open navigation')}
              aria-expanded={menuOpen}
              aria-controls={navId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet context={{ reportCheck } satisfies CheckNavigationContext} />
      </main>
    </div>
  );
}
