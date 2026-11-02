import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NewCheckPage } from './features/new-check/NewCheckPage';
import { CheckPage } from './features/check/CheckPage';
import { HistoryPage } from './features/history/HistoryPage';
import { t, useLanguage } from './lib/i18n';

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

export function App() {
  // Reading the language here re-renders the whole app when it changes, without losing form state.
  useLanguage();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<NewCheckPage />} />
        <Route path="checks/:checkId" element={<CheckPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
