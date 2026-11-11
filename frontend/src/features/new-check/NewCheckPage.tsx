import { useEffect, useRef } from 'react';
import { ArrowUpRight, ChevronDown, Info } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { exampleInputs } from '../../data/examples';
import { WorldEvidenceMap } from '../../components/WorldEvidenceMap';
import { HowItWorks } from '../../components/HowItWorks';
import { CheckComposer, type ComposerHandle } from './CheckComposer';
import { getLanguage, t } from '../../lib/i18n';

export function NewCheckPage() {
  const composerRef = useRef<ComposerHandle>(null);
  const { state } = useLocation();

  useEffect(() => {
    if (typeof state?.suggestedClaim === 'string') {
      composerRef.current?.fill(state.suggestedClaim, { submitOnEnter: true });
    }
  }, [state]);

  const language = getLanguage();

  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <WorldEvidenceMap />
        <div className="relative mx-auto flex min-h-[calc(100svh-68px)] max-w-5xl flex-col items-center justify-center px-4 py-10 sm:px-8 sm:py-12 md:min-h-[calc(100svh-72px)]">
          <h1 className="max-w-3xl text-center text-[30px] font-normal leading-[1.08] tracking-[-0.04em] sm:text-[42px] lg:text-[48px]">
            <span className="block font-bold text-pop">{t('Trace claims.')}</span>
            <span className="block text-ink-muted">{t('Examine evidence.')}</span>
          </h1>

          <div className="mt-6 w-full min-w-0 sm:mt-8">
            <p className="mb-2.5 flex items-start justify-center gap-1.5 px-2 text-center text-[13px] leading-5 text-ink-muted sm:mb-3 sm:text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('AI can be wrong. Review the evidence.')}</span>
            </p>
            <CheckComposer ref={composerRef} variant="home" />

            <section aria-labelledby="examples-heading" className="mt-5 sm:mt-6">
              <h2 id="examples-heading" className="sr-only">{t('Examples')}</h2>
              <ul className="flex flex-wrap justify-center gap-2.5">
                {exampleInputs.map((example) => (
                  <li key={example.id}>
                    <button
                      type="button"
                      className="home-pill"
                      onClick={() => composerRef.current?.fill(language === 'vi' ? example.valueVi : example.value)}
                    >
                      <example.icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      {t(example.label)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-5 flex flex-col items-center gap-1 sm:mt-6">
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink-faint transition-colors hover:text-ink"
              >
                <ChevronDown className="h-3.5 w-3.5 motion-safe:animate-bounce" aria-hidden="true" />
                {t('How it works')}
              </a>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks
        action={
          <a
            href="#check-composer"
            onClick={() => requestAnimationFrame(() => composerRef.current?.focus())}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink py-2.5 pl-4 pr-3.5 text-sm font-medium text-page transition-opacity hover:opacity-90"
          >
            {t('Start a check')}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        }
      />
    </div>
  );
}
