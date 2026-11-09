import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../lib/i18n';
import { checkService } from '../../services';

export function RelatedChecks({ checkId, saved }: { checkId: string; saved?: string[] | null }) {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<string[] | 'loading' | 'error'>('loading');
  const suggestions = saved ?? loaded;

  useEffect(() => {
    if (saved != null) return;
    let active = true;
    // Let a remount or navigation cancel the request before starting a paid model call.
    const timer = window.setTimeout(() => {
      checkService.suggestCheckInputs(checkId).then(
        ({ suggestions }) => { if (active) setLoaded(Array.isArray(suggestions) ? suggestions : 'error'); },
        () => { if (active) setLoaded('error'); },
      );
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [checkId, saved, attempt]);

  if (suggestions.length === 0) return null;

  return (
    <section className="mt-6 max-w-prose" aria-labelledby="related-checks-heading">
      <h3 id="related-checks-heading" className="text-sm font-semibold text-brand-700">{t('Related facts to check')}</h3>
      {suggestions === 'loading' ? (
        <p role="status" className="mt-2 text-sm text-ink-muted">{t('Finding related facts…')}</p>
      ) : suggestions === 'error' ? (
        <button
          type="button"
          className="min-h-11 rounded text-left text-sm font-medium text-brand-700 underline underline-offset-4"
          onClick={() => {
            setLoaded('loading');
            setAttempt((value) => value + 1);
          }}
        >
          {t('Retry suggestions')}
        </button>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">{t('Choose a question to fill in on the home page.')}</p>
          <ul className="mt-2 divide-y divide-brand-200/70 border-y border-brand-200/70">
            {suggestions.map((suggestedClaim) => (
              <li key={suggestedClaim}>
                <button
                  type="button"
                  className="min-h-11 w-full rounded-sm py-2.5 text-left text-sm font-medium leading-relaxed text-ink-soft hover:text-brand-700 hover:underline hover:underline-offset-4"
                  onClick={() => navigate('/', { state: { suggestedClaim } })}
                >
                  {suggestedClaim}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
