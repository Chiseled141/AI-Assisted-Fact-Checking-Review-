import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CheckReview, ReviewAnswer, ReviewQuestion } from '../../types/models';
import { checkService, ValidationError } from '../../services';
import { t } from '../../lib/i18n';

const MAX_ANSWER = 300;
const ALL = 'all';
// A model writes the other answers, so these can't look like one.
const AS_WRITTEN = '\u0000as-written';
const TYPED = '\u0000typed';

function Choice({ name, checked, onSelect, children }: { name: string; checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[14px] leading-snug transition-colors ${
        checked ? 'border-brand-500 bg-brand-50 text-ink' : 'border-line bg-white text-ink-soft hover:border-line-strong'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 shrink-0 accent-brand-600" />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}

/** The last row of every question: the reader's own words, typed right in the row. */
function OtherChoice({ name, checked, onSelect, value, onChange, placeholder, label }: {
  name: string; checked: boolean; onSelect: () => void; value: string; onChange: (value: string) => void; placeholder: string; label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label
      className={`flex cursor-text items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-colors ${
        checked ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:border-line-strong'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        aria-label={t('Other')}
        onChange={() => {
          onSelect();
          input.current?.focus();
        }}
        className="shrink-0 accent-brand-600"
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
    </label>
  );
}

function claimText(review: CheckReview, position: number) {
  return review.claims.find((claim) => claim.position === position)?.text ?? '';
}

/** What the check asks before it searches: which claims to check, and what an unclear claim means. */
export function ReviewCard({ checkId, review, onAnswered }: { checkId: string; review: CheckReview; onAnswered: () => void }) {
  const [claim, setClaim] = useState<number | typeof ALL | typeof TYPED>(ALL);
  const [typedClaim, setTypedClaim] = useState('');
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Picking one claim leaves nothing to ask about the others.
  const questions = review.questions.filter((question) => claim === ALL || question.claim === claim);
  const ready = questions.every(isAnswered) && (claim !== TYPED || Boolean(typedClaim.trim()));

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
      await checkService.answerReview(
        checkId,
        claim === TYPED ? { claim: null, answers: [], typedClaim: typedClaim.trim() } : { claim: claim === ALL ? null : claim, answers: questions.map(replyTo) },
      );
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
          <legend className="mb-2 text-[15px] font-medium text-ink">{t('Which claim should ClaimTrace check?')}</legend>
          <Choice name="claim" checked={claim === ALL} onSelect={() => setClaim(ALL)}>{t('All claims')}</Choice>
          {review.claims.map((item) => (
            <Choice key={item.position} name="claim" checked={claim === item.position} onSelect={() => setClaim(item.position)}>
              {item.text}
            </Choice>
          ))}
          <OtherChoice
            name="claim"
            checked={claim === TYPED}
            onSelect={() => setClaim(TYPED)}
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
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={sending || !ready}>
          {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {t('Continue')}
        </button>
      </div>
    </form>
  );
}

/** What the reader answered, kept in the chat once the check has moved on. */
export function ReviewSummary({ review }: { review: CheckReview }) {
  const { answer } = review;
  if (!answer) return null;
  const questionFor = (position: number) => review.questions.find((question) => question.claim === position)?.question ?? '';
  return (
    <dl className="mt-3 space-y-2 border-l-2 border-line pl-4 text-[13px] leading-relaxed">
      {review.choose && (
        <div>
          <dt className="text-ink-muted">{t('Claims to check')}</dt>
          <dd className="text-ink">{answer.typedClaim ?? (answer.claim ? claimText(review, answer.claim) : t('All claims'))}</dd>
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
