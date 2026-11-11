import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { CheckReview, ReviewAnswer, ReviewQuestion } from '../../types/models';
import { checkService, ValidationError } from '../../services';
import { t } from '../../lib/i18n';

const MAX_ANSWER = 300;
// A model writes the other answers, so these can't look like one.
const AS_WRITTEN = '\u0000as-written';
const TYPED = '\u0000typed';

function Choice({ name, checked, onSelect, children, type = 'radio', mixed = false }: {
  name: string; checked: boolean; onSelect: () => void; children: ReactNode; type?: 'radio' | 'checkbox'; mixed?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[14px] leading-snug transition-colors focus-within:ring-2 focus-within:ring-brand-500/20 ${
        checked ? 'border-brand-500 bg-brand-50 text-ink' : 'border-line bg-white text-ink-soft hover:border-line-strong'
      }`}
    >
      <input
        ref={(input) => { if (input) input.indeterminate = mixed; }}
        type={type}
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 accent-brand-700"
      />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}

/** The last row of every question: the reader's own words, typed right in the row. */
function OtherChoice({ name, checked, onSelect, onClear, value, onChange, placeholder, label }: {
  name: string; checked: boolean; onSelect: () => void; onClear?: () => void;
  value: string; onChange: (value: string) => void; placeholder: string; label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-colors focus-within:ring-2 focus-within:ring-brand-500/20 ${
        checked ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:border-line-strong'
      }`}
    >
      <input
        type={onClear ? 'checkbox' : 'radio'}
        name={name}
        checked={checked}
        aria-label={t('Other')}
        onChange={(event) => {
          if (!event.target.checked) return onClear?.();
          onSelect();
          input.current?.focus();
        }}
        className="size-4 shrink-0 cursor-pointer accent-brand-700"
      />
      <input
        ref={input}
        type="text"
        maxLength={MAX_ANSWER}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onFocus={onSelect}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent py-1 text-[14px] text-ink placeholder:text-ink-soft focus:outline-none"
      />
    </div>
  );
}

function claimText(review: CheckReview, position: number) {
  return review.claims.find((claim) => claim.position === position)?.text ?? '';
}

/** What the check asks before it searches: which claims to check, and what an unclear claim means. */
export function ReviewCard({ checkId, review, onAnswered }: { checkId: string; review: CheckReview; onAnswered: () => void }) {
  const [selection, setSelection] = useState<number[] | typeof TYPED>([]);
  const [typedClaim, setTypedClaim] = useState('');
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const custom = selection === TYPED;
  const selected = custom ? [] : selection;
  const all = selected.length > 0 && selected.length === review.claims.length;
  const questions = review.questions.filter((question) => !review.choose || selected.includes(question.claim));
  const hasScope = custom ? Boolean(typedClaim.trim()) : selected.length > 0;
  const ready = (!review.choose || hasScope) && questions.every(isAnswered);

  function toggleClaim(position: number) {
    setSelection((current) => {
      if (current === TYPED) return [position];
      return current.includes(position) ? current.filter((item) => item !== position) : [...current, position];
    });
  }

  function isAnswered(question: ReviewQuestion) {
    const choice = picked[question.claim];
    return choice === TYPED ? Boolean(typed[question.claim]?.trim()) : choice !== undefined;
  }

  function replyTo(question: ReviewQuestion): ReviewAnswer['answers'][number] {
    const choice = picked[question.claim];
    const answer = choice === AS_WRITTEN ? null : choice === TYPED ? typed[question.claim].trim() : choice;
    return { claim: question.claim, answer };
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (sending || !ready) return;
    setSending(true);
    setError(null);
    try {
      const answer: ReviewAnswer = { claim: null, answers: questions.map(replyTo) };
      if (custom) answer.typedClaim = typedClaim.trim();
      else if (review.choose && !all) answer.selectedClaims = [...selected].sort((left, right) => left - right);
      await checkService.answerReview(checkId, answer);
      onAnswered();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : t('Your answer could not be sent. Please try again.'));
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} aria-label={t('Before searching')} className="rise-in mt-4 space-y-5 rounded-2xl border border-line bg-white p-4">
      {review.choose && (
        <fieldset className="space-y-2">
          <legend className="text-[15px] font-medium text-ink">{t('Which claims should ClaimTrace check?')}</legend>
          <p className="text-[13px] text-ink-muted">{t('Select one or more claims to check.')}</p>
          <Choice name="all-claims" type="checkbox" checked={all} mixed={selected.length > 0 && !all}
            onSelect={() => setSelection(all ? [] : review.claims.map((item) => item.position))}>
            <span className="font-medium">{t('Select all claims')}</span>
          </Choice>
          {review.claims.map((item) => (
            <Choice key={item.position} name="claims" type="checkbox" checked={selected.includes(item.position)} onSelect={() => toggleClaim(item.position)}>
              {item.text}
            </Choice>
          ))}
          <OtherChoice
            name="custom-claim"
            checked={custom}
            onSelect={() => setSelection(TYPED)}
            onClear={() => setSelection([])}
            value={typedClaim}
            onChange={setTypedClaim}
            placeholder={t('Other: type what to check')}
            label={t('What else to check')}
          />
        </fieldset>
      )}

      {questions.map((question) => {
        const name = `question-${question.claim}`;
        const choice = picked[question.claim];
        const select = (value: string) => setPicked((current) => ({ ...current, [question.claim]: value }));
        return (
          <fieldset key={question.claim} className="space-y-2">
            <legend className="mb-2">
              <span className="block text-[13px] leading-relaxed text-ink-muted">{claimText(review, question.claim)}</span>
              <span className="mt-0.5 block text-[15px] font-medium text-ink">{question.question}</span>
            </legend>
            {question.options.map((option, index) => (
              <Choice key={index} name={name} checked={choice === option} onSelect={() => select(option)}>{option}</Choice>
            ))}
            <Choice name={name} checked={choice === AS_WRITTEN} onSelect={() => select(AS_WRITTEN)}>{t('Skip, check as written')}</Choice>
            <OtherChoice
              name={name}
              checked={choice === TYPED}
              onSelect={() => select(TYPED)}
              value={typed[question.claim] ?? ''}
              onChange={(value) => setTyped((current) => ({ ...current, [question.claim]: value }))}
              placeholder={t('Other: type your answer')}
              label={t('Your answer')}
            />
          </fieldset>
        );
      })}

      {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
      <div className="flex items-center gap-3 border-t border-line pt-3">
        {review.choose && !custom && (
          <p role="status" className="text-[13px] text-ink-muted tabular-nums">
            {t('{count} of {total} claims selected', { count: selected.length, total: review.claims.length })}
          </p>
        )}
        <button type="submit" className="btn-panel-primary ml-auto shrink-0" disabled={sending || !ready}>
          {t('Continue')}
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}

/** What the reader answered, kept in the chat once the check has moved on. */
export function ReviewSummary({ review }: { review: CheckReview }) {
  const { answer } = review;
  if (!answer) return null;
  const single = answer.selectedClaims?.[0] ?? answer.claim;
  const questionFor = (position: number) => review.questions.find((question) => question.claim === position)?.question ?? '';
  return (
    <dl className="mt-3 space-y-2 border-l-2 border-line pl-4 text-[13px] leading-relaxed">
      {review.choose && (
        <div>
          <dt className="text-ink-muted">{t('Claims to check')}</dt>
          <dd className="text-ink">
            {answer.selectedClaims && answer.selectedClaims.length > 1 ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {answer.selectedClaims.map((position) => <li key={position}>{claimText(review, position)}</li>)}
              </ul>
            ) : answer.typedClaim ?? (single == null ? t('All claims') : claimText(review, single))}
          </dd>
        </div>
      )}
      {answer.answers.map((reply) => (
        <div key={reply.claim}>
          <dt className="text-ink-muted">{questionFor(reply.claim)}</dt>
          <dd className="text-ink">{reply.answer ?? t('Skip, check as written')}</dd>
        </div>
      ))}
    </dl>
  );
}
