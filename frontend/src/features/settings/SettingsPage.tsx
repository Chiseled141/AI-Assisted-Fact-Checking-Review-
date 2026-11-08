import { ChevronRight, Languages, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { t } from '../../lib/i18n';

export function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <h1 className="text-2xl font-medium tracking-tight text-ink">{t('Settings')}</h1>
      <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <span className="flex items-center gap-3 text-sm font-medium text-ink">
            <Languages className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            {t('Language')}
          </span>
          <LanguageSwitcher />
        </div>
        <Link to="/login" className="flex min-h-14 items-center gap-3 rounded-b-2xl px-4 text-sm font-medium text-ink transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 sm:px-5">
          <UserRound className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          {t('Manage account')}
          <ChevronRight className="ml-auto h-4 w-4 text-ink-muted" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
