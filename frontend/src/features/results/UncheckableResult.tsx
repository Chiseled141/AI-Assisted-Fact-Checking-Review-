import type { Check, CheckDetail } from '../../types/models';
import { t } from '../../lib/i18n';
import { RelatedChecks } from './RelatedChecks';

export function inputCategoryLabel(category: Check['inputCategory']): string {
  switch (category) {
    case 'subjective': return t('Subjective opinion');
    case 'advice': return t('Advice request');
    case 'prediction': return t('Future prediction');
    case 'unclear': return t('Needs clarification');
    default: return t('No factual claim identified');
  }
}

function explanation(category: Check['inputCategory']): string {
  switch (category) {
    case 'subjective': return t('This asks for an opinion or ranking without a measurable criterion. There is no single factual answer to verify.');
    case 'advice': return t('This asks for a recommendation. State the factual information behind the decision that you want to check.');
    case 'prediction': return t('This concerns an outcome that has not been established yet. You can check an existing forecast or announcement, but not treat the future outcome as a fact.');
    case 'unclear': return t('The input needs a clearer subject or meaning before evidence can be compared. Specify who or what you mean and the information to verify.');
    default: return t('No checkable factual claim was identified in this input. This does not mean the input is false.');
  }
}

/** A completed input assessment, separate from factual verdicts. Older checks retain a neutral category. */
export function UncheckableResult({ check }: { check: CheckDetail }) {
  const failed = check.progress?.some((task) => task.task === 'rephrasing' && task.status === 'failed');
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:px-6">
      <section className="sm:ml-10" aria-labelledby="input-result-heading">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-semibold text-brand-700">{t('Input assessment')}</p>
          <p className="text-xs font-medium text-ink-muted">{t('No factual verdict')}</p>
        </header>
        <div aria-hidden="true" className="mb-4 mt-3 h-px bg-gradient-to-r from-brand-500/60 via-brand-200 to-transparent" />
        <h2 id="input-result-heading" className="text-balance text-xl font-strong leading-tight tracking-tight text-ink sm:text-2xl">
          {inputCategoryLabel(check.inputCategory)}
        </h2>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
          {failed ? t('The model could not finish interpreting this input. Try again; no factual verdict was produced.') : explanation(check.inputCategory)}
        </p>
        <div className="mt-5 border-l-2 border-brand-500/60 pl-3.5 sm:pl-4">
          <h3 className="text-sm font-semibold text-brand-700">{t('How to make this checkable')}</h3>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
            {t('State a specific fact and, when relevant, a date, place or measurable criterion.')}
            {check.inputCategory === 'subjective' && <> {t('For a “GOAT” question, choose a competition and a record to compare instead of asking who is best.')}</>}
          </p>
        </div>
        <RelatedChecks checkId={check.id} saved={check.inputSuggestions} />
      </section>
    </div>
  );
}
