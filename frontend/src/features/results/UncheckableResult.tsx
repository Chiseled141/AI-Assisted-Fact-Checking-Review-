import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { Check, CheckDetail } from '../../types/models';
import { t } from '../../lib/i18n';

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
    <div className="mx-auto w-full max-w-[1040px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <section className="rounded-2xl border border-line bg-white p-6 sm:p-10" aria-labelledby="input-result-heading">
        <p className="text-sm font-medium text-ink-muted">{t('Input assessment')}</p>
        <h1 id="input-result-heading" className="mt-3 break-words text-[24px] font-medium leading-snug tracking-[-0.02em] text-ink sm:text-[32px]">
          {check.inputText && check.inputText.length <= 1000 ? check.inputText : check.title}
        </h1>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full border border-line-strong bg-page px-3 py-1 text-sm text-ink-soft">{inputCategoryLabel(check.inputCategory)}</span>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm text-indigo-700">{t('No factual verdict')}</span>
        </div>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
          {failed ? t('The model could not finish interpreting this input. Try again; no factual verdict was produced.') : explanation(check.inputCategory)}
        </p>
        <h2 className="mt-6 text-sm font-semibold text-ink">{t('How to make this checkable')}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {t('State a specific fact and, when relevant, a date, place or measurable criterion.')}
          {check.inputCategory === 'subjective' && <> {t('For a “GOAT” question, choose a competition and a record to compare instead of asking who is best.')}</>}
        </p>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink py-2 pl-4 pr-3.5 text-sm font-medium text-page hover:opacity-90">
          {t('Start a new check')}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
