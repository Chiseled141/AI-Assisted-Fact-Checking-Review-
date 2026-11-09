import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import { setLanguage, t, useLanguage } from '../../lib/i18n';
import { readItem, RUNNING_CHECK_KEY } from '../../lib/storage';
import { loadAccount, logIn, logOut, signUp, useAccount } from '../../services/account';
import { ValidationError } from '../../services';

/** Only a page of this app, so a crafted link can't send someone elsewhere after they log in. */
function safeDestination(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/';
}

/** Log in, create an account, or log out. The session is an HttpOnly cookie set by the backend. */
export function AccountPage({ embedded = false }: { embedded?: boolean } = {}) {
  const language = useLanguage();
  const account = useAccount();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [username, setUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [confirmationError, setConfirmationError] = useState(false);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const fieldId = useId();
  const runningCheckId = readItem(RUNNING_CHECK_KEY);

  useEffect(() => {
    if (!embedded) loadAccount().catch(() => undefined);
  }, [embedded]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    if (creatingAccount && password !== confirmation) {
      setConfirmationError(true);
      setNotice('');
      confirmationRef.current?.focus();
      return;
    }
    setConfirmationError(false);
    setNotice('');
    setSending(true);
    try {
      if (creatingAccount) await signUp(username, password, confirmation);
      else await logIn(username, password);
      if (!embedded) navigate(safeDestination(params.get('next')), { replace: true });
      else setSending(false);
    } catch (error) {
      setNotice(error instanceof ValidationError ? error.message : t('Could not reach ClaimTrace. Please try again.'));
      setSending(false);
    }
  }

  async function leave() {
    setSending(true);
    try {
      await logOut();
      setPassword('');
      setConfirmation('');
      setNotice('');
    } catch (error) {
      setNotice(error instanceof ValidationError ? error.message : t('Could not reach ClaimTrace. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const title = account ? t('Signed in as {username}', { username: account.username }) : creatingAccount ? t('Create account') : t('Log in');

  const content = (<>
          {embedded
            ? <h3 id={`${fieldId}-title`} className="text-base font-medium text-ink">{title}</h3>
            : <h1 id={`${fieldId}-title`} className="mt-4 text-sm font-normal text-ink-muted">{title}</h1>}
          {account ? (
            <div className="mt-10">
              <button type="button" onClick={leave} disabled={sending} className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-white transition-colors hover:bg-ink-soft disabled:opacity-60">{t('Log out')}</button>
              {notice && <p role="alert" className="mt-4 text-center text-sm leading-relaxed text-rose-700">{notice}</p>}
            </div>
          ) : (<>
          <form onSubmit={submit} className={`${embedded ? 'mt-5' : 'mt-10'} text-left`} aria-labelledby={`${fieldId}-title`}>
            <label htmlFor={`${fieldId}-username`} className="mb-2 ml-5 block text-xs text-ink-muted">{t('Username')}</label>
            <input id={`${fieldId}-username`} type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required
              value={username} onChange={(event) => {
                setUsername(event.target.value);
                setNotice('');
              }}
              placeholder={t('Enter your username')} className="account-input" />

            <div className="mt-6">
              <label htmlFor={`${fieldId}-password`} className="mb-2 ml-5 block text-xs text-ink-muted">{t('Password')}</label>
              <div className="relative">
                <input id={`${fieldId}-password`} type={passwordVisible ? 'text' : 'password'} required
                  value={password} onChange={(event) => {
                    setPassword(event.target.value);
                    setConfirmationError(false);
                    setNotice('');
                  }}
                  autoComplete={creatingAccount ? 'new-password' : 'current-password'}
                  placeholder={t('Enter your password')} className="account-input pr-14" />
                <button type="button" onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? t('Hide password') : t('Show password')} aria-pressed={passwordVisible}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:text-ink">
                  {passwordVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {creatingAccount && (
              <div className="mt-6">
                <label htmlFor={`${fieldId}-confirmation`} className="mb-2 ml-5 block text-xs text-ink-muted">{t('Confirm password')}</label>
                <div className="relative">
                  <input ref={confirmationRef} id={`${fieldId}-confirmation`} type={confirmationVisible ? 'text' : 'password'}
                    autoComplete="new-password" required value={confirmation}
                    onChange={(event) => {
                      setConfirmation(event.target.value);
                      setConfirmationError(false);
                      setNotice('');
                    }}
                    aria-invalid={confirmationError}
                    aria-describedby={confirmationError ? `${fieldId}-confirmation-error` : undefined}
                    placeholder={t('Enter your password again')} className="account-input pr-14 aria-[invalid=true]:border-rose-400" />
                  <button type="button" onClick={() => setConfirmationVisible((visible) => !visible)}
                    aria-label={confirmationVisible ? t('Hide password confirmation') : t('Show password confirmation')} aria-pressed={confirmationVisible}
                    className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:text-ink">
                    {confirmationVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                {confirmationError && <p id={`${fieldId}-confirmation-error`} role="alert" className="ml-5 mt-2 text-xs text-rose-700">{t('The passwords do not match.')}</p>}
              </div>
            )}

            <button type="submit" disabled={sending} className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-white transition-colors hover:bg-ink-soft disabled:opacity-60">{title}</button>
            {notice && <p role="alert" className="mt-4 text-center text-sm leading-relaxed text-rose-700">{notice}</p>}
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-1 text-[13px] text-ink-muted">
            <span>{creatingAccount ? t('Already have an account?') : t('Don’t have an account?')}</span>
            <button
              type="button"
              onClick={() => {
                setCreatingAccount((creating) => !creating);
                setPassword('');
                setConfirmation('');
                setConfirmationVisible(false);
                setConfirmationError(false);
                setPasswordVisible(false);
                setNotice('');
              }}
              className="inline-flex min-h-11 items-center rounded-md px-1 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              {creatingAccount ? t('Log in') : t('Create account')}
            </button>
          </div>
          </>)}
  </>);

  if (embedded) return <div className="mx-auto w-full max-w-sm p-5 sm:p-6">{content}</div>;

  return (
    <main className="account-page">
      <section className="account-story" aria-label={t('About ClaimTrace')}>
        <div className="account-story-content">
          <h2 className="max-w-[9em] text-[38px] font-normal leading-[1.35] tracking-[-0.035em] xl:text-[48px]">
            {t('Trace the facts.')}<br />{t('Understand the story.')}
          </h2>
          <p className="mt-7 max-w-sm text-[15px] leading-[1.8] text-white/65">
            {t('Check claims against cited sources, with two AI models to help you examine the evidence.')}
          </p>
          <Link to="/#how-it-works" className="mt-10 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-zinc-100">
            {t('How it works')}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className="account-panel" aria-labelledby={`${fieldId}-title`}>
        <div className="account-tools">
          <Link to={runningCheckId ? `/checks/${runningCheckId}` : '/'} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs text-ink-muted transition-colors hover:bg-zinc-50 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{t('Back to checking')}
          </Link>
          <button type="button" onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
            className="min-h-11 min-w-11 rounded-full px-3 text-xs text-ink-muted transition-colors hover:bg-zinc-50 hover:text-ink"
            aria-label={t('Change language')}>
            {language === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>
        <div className="account-form-wrap">
          <Link to="/" aria-label={t('ClaimTrace home')} className="inline-block font-wordmark text-[36px] font-medium leading-none tracking-[-0.045em] text-ink">
            claimtrace
          </Link>
          {content}
        </div>
        <p className="account-footer">{t('AI can be wrong. Review the evidence.')}</p>
      </section>
    </main>
  );
}
