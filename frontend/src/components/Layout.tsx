import { type MouseEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigationType } from 'react-router-dom';
import { History, Menu, ScanLine, Settings, X } from 'lucide-react';
import { t } from '../lib/i18n';
import { readItem, RUNNING_CHECK_KEY, writeItem } from '../lib/storage';
import { type Check, isTerminal } from '../types/models';
import { loadAccount, useAccount } from '../services/account';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AccountAvatar } from './AccountAvatar';
import { AccountPage } from '../features/account/AccountPage';
import { ProfileForm } from '../features/account/ProfilePage';
import { HistoryPanel } from '../features/history/HistoryPage';
import { SettingsPage } from '../features/settings/SettingsPage';

type Panel = 'settings' | 'history' | 'account';
const panelTitles = { settings: 'Settings', history: 'History', account: 'Account' } as const;

export interface CheckNavigationContext {
  reportCheck: (check: Pick<Check, 'id' | 'status'>) => void;
}

export function Layout() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const home = pathname === '/';
  const atmosphere = home || pathname.startsWith('/checks/');
  const [pastComposer, setPastComposer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(() => readItem(RUNNING_CHECK_KEY) || null);
  const account = useAccount();
  const navId = useId();
  const panelId = useId();
  const panelTitleId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const panelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const docked = !home || pastComposer || panel !== null;
  const PanelIcon = panel === 'settings' ? Settings : History;
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
    setPanel(null);
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

  const closePanel = useCallback((restoreFocus = true) => {
    setPanel(null);
    if (restoreFocus) panelTriggerRef.current?.focus({ preventScroll: true });
  }, []);

  function togglePanel(next: Panel, event: MouseEvent<HTMLButtonElement>) {
    if (panel === next) {
      closePanel();
      return;
    }
    panelTriggerRef.current = menuOpen && event.currentTarget.closest('nav') ? menuTriggerRef.current : event.currentTarget;
    setMenuOpen(false);
    setPanel(next);
  }

  useLayoutEffect(() => {
    if (panel) panelTitleRef.current?.focus({ preventScroll: true });
  }, [panel, account?.id]);

  useEffect(() => {
    if (!menuOpen && !panel) return;
    // History's delete confirmation is portaled above the header and handles its own dismissal.
    const modalIsOpen = () => document.querySelector('[aria-modal="true"]') !== null;
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node) && !modalIsOpen()) {
        setMenuOpen(false);
        closePanel(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || modalIsOpen()) return;
      event.preventDefault();
      if (panel) closePanel();
      else {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, panel, closePanel]);

  function panelTrigger(next: Panel) {
    return {
      'aria-haspopup': 'dialog' as const,
      'aria-expanded': panel === next,
      'aria-controls': panel === next ? panelId : undefined,
      onClick: (event: MouseEvent<HTMLButtonElement>) => togglePanel(next, event),
    };
  }

  return (
    <div className={`flex min-h-screen flex-col ${atmosphere ? 'home-atmosphere' : ''}`}>
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
        data-panel={panel ?? undefined}
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
                  <button type="button" className="site-header-link" {...panelTrigger('settings')}>
                    {!home && <Settings className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t('Settings')}
                  </button>
                </li>
                <li>
                  <button type="button" className="site-header-link" {...panelTrigger('history')}>
                    {!home && <History className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t('History')}
                  </button>
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
            <button type="button" className="site-header-account" {...panelTrigger('account')}
              aria-label={account ? t('Account: {username}', { username: account.username }) : t('Account')}>
              <AccountAvatar avatar={account?.avatar} />
              <span className="site-header-account-label max-w-[10rem] truncate">{account ? account.username : t('Account')}</span>
            </button>
            <button
              ref={menuTriggerRef}
              type="button"
              className="site-header-menu"
              aria-label={menuOpen ? t('Close navigation') : t('Open navigation')}
              aria-expanded={menuOpen}
              aria-controls={navId}
              onClick={() => {
                closePanel(false);
                setMenuOpen((open) => !open);
              }}
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
          {panel && (
            <section id={panelId} role="dialog" aria-labelledby={panelTitleId} className="site-header-panel">
              <div className="site-header-panel-heading">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true">
                  {panel === 'account' ? <AccountAvatar avatar={account?.avatar} /> : <PanelIcon size={16} />}
                </span>
                <h2 ref={panelTitleRef} id={panelTitleId} tabIndex={-1} className="min-w-0 flex-1 text-base font-semibold text-ink focus:outline-none">
                  {t(panelTitles[panel])}
                </h2>
                <button type="button" className="site-header-panel-close" onClick={() => closePanel()} aria-label={t('Close')}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="site-header-panel-body">
                {panel === 'settings' && <SettingsPage onManageAccount={() => setPanel('account')} />}
                {panel === 'history' && (account
                  ? <HistoryPanel onNavigate={() => closePanel(false)} />
                  : <AccountPage embedded />)}
                {panel === 'account' && (account
                  ? <ProfileForm key={account.id} account={account} embedded />
                  : <AccountPage embedded />)}
              </div>
            </section>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet context={{ reportCheck } satisfies CheckNavigationContext} />
      </main>
    </div>
  );
}
