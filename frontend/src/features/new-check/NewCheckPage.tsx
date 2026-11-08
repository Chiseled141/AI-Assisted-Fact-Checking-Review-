import { useRef } from 'react';
import { ArrowUpRight, ChevronDown, Info } from 'lucide-react';
import { exampleInputs } from '../../data/examples';
import { WorldEvidenceMap } from '../../components/WorldEvidenceMap';
import { HowItWorks } from '../../components/HowItWorks';
import { CheckComposer, type ComposerHandle } from './CheckComposer';
import { getLanguage, t } from '../../lib/i18n';

export function NewCheckPage() {
  const composerRef = useRef<ComposerHandle>(null);

  function applyExample(id: string) {
    const example = exampleInputs.find((item) => item.id === id);
    if (example) composerRef.current?.fill(getLanguage() === 'vi' ? example.valueVi : example.value);
  }

  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <WorldEvidenceMap />
        <div className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-5xl flex-col items-center justify-center px-4 py-12 sm:px-8">
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-center text-[13px] text-ink-muted sm:text-sm">
            <Info className="h-4 w-4" aria-hidden="true" />
            {t('AI can be wrong. Review the evidence.')}
          </p>

          <h1 className="mt-6 max-w-3xl text-center text-[30px] font-normal leading-[1.08] tracking-[-0.04em] text-ink sm:text-[42px] lg:text-[48px]">
            <span className="font-bold text-primary">{t('Trace claims.')}</span>
            <span className="block text-ink-muted">{t('Examine evidence.')}</span>
          </h1>

          <div className="mt-8 w-full max-w-5xl sm:mt-10">
            <CheckComposer ref={composerRef} variant="home" />

            <section aria-labelledby="examples-heading" className="mt-5 flex flex-col items-center sm:mt-6">
              <h2 id="examples-heading" className="sr-only">
                {t('Examples')}
              </h2>
              <ul className="flex flex-wrap justify-center gap-2.5">
                {exampleInputs.map((example) => (
                  <li key={example.id}>
                    <button type="button" className="home-pill" onClick={() => applyExample(example.id)}>
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
