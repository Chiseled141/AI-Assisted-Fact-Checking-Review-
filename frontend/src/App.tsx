import { useEffect } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NewCheckPage } from './features/new-check/NewCheckPage';
import { CheckPage } from './features/check/CheckPage';
import { HistoryPage } from './features/history/HistoryPage';
import { AccountPage } from './features/account/AccountPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { t, useLanguage } from './lib/i18n';
import { onSignInRequired } from './services/account';

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-extrabold tracking-[-0.025em] text-3xl text-ink">{t('Page not found')}</h1>
      <p className="mt-3 text-ink-soft">{t('The page you were looking for does not exist.')}</p>
      <Link to="/" className="btn-primary mt-6">
        {t('Start a new check')}
      </Link>
    </div>
  );
}

/** Opens the login page when a page's data needs an account, and comes back here afterwards. */
function useSignInRedirect() {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  useEffect(
    () => onSignInRequired(() => {
      if (pathname !== '/login') navigate(`/login?next=${encodeURIComponent(pathname + search + hash)}`, { replace: true });
    }),
    [navigate, pathname, search, hash],
  );
}

export function App() {
  // Reading the language here re-renders the whole app when it changes, without losing form state.
  useLanguage();
  useSignInRedirect();
  return (
    <Routes>
      <Route path="login" element={<AccountPage />} />
      <Route element={<Layout />}>
        <Route index element={<NewCheckPage />} />
        <Route path="checks/:checkId" element={<CheckPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
