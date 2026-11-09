import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ImagePlus, LockKeyhole, LogOut, UserRound } from 'lucide-react';
import { AccountAvatar } from '../../components/AccountAvatar';
import { t } from '../../lib/i18n';
import { changePassword, loadAccount, logOut, updateProfile, useAccount } from '../../services/account';
import { ValidationError } from '../../services/errors';
import type { Account } from '../../types/models';

const input = 'min-h-11 w-full rounded-xl border border-line bg-zinc-50 px-3.5 text-sm text-ink transition-colors focus:border-brand-200 focus:bg-white';
const field = 'grid gap-1.5 text-sm font-medium text-ink';
const secondaryAction = 'btn-secondary min-h-11 rounded-full px-4';
const maxAvatarBytes = 4 * 1024 * 1024;
const avatarError = 'Choose a JPEG, PNG, or WebP image up to 4 MB and 20 megapixels.';

type Notice = { text: string; error?: boolean } | null;

function Message({ notice }: { notice: Notice }) {
  return notice && (
    <p role={notice.error ? 'alert' : 'status'} className={`text-sm ${notice.error ? 'text-rose-700' : 'text-brand-700'}`}>
      {notice.text}
    </p>
  );
}

function errorNotice(error: unknown): Notice {
  return {
    error: true,
    text: error instanceof ValidationError ? error.message : t('Could not reach ClaimTrace. Please try again.'),
  };
}

export function ProfileForm({ account, embedded = false }: { account: Account; embedded?: boolean }) {
  const [avatarDraft, setAvatarDraft] = useState<string | null>();
  const [readingAvatar, setReadingAvatar] = useState(false);
  const [pending, setPending] = useState(false);
  const [identityNotice, setIdentityNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [logoutNotice, setLogoutNotice] = useState<Notice>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);
  const navigate = useNavigate();
  const id = useId();
  const avatar = avatarDraft === undefined ? account.avatar : avatarDraft;

  useEffect(() => () => reader.current?.abort(), []);

  async function perform(work: () => Promise<void>, notice: (value: Notice) => void, success?: string) {
    if (pending) return;
    setPending(true);
    notice(null);
    try {
      await work();
      if (success) notice({ text: success });
    } catch (error) {
      notice(errorNotice(error));
    } finally {
      setPending(false);
    }
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxAvatarBytes) {
      setIdentityNotice({ error: true, text: t(avatarError) });
      return;
    }
    reader.current?.abort();
    const next = new FileReader();
    reader.current = next;
    setReadingAvatar(true);
    setIdentityNotice(null);
    next.onload = () => {
      if (typeof next.result === 'string') setAvatarDraft(next.result);
      setReadingAvatar(false);
    };
    next.onerror = () => {
      setIdentityNotice({ error: true, text: t(avatarError) });
      setReadingAvatar(false);
    };
    next.readAsDataURL(file);
  }

  function saveAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (avatarDraft === undefined || readingAvatar) return;
    void perform(async () => {
      await updateProfile({ avatar: avatarDraft === null ? null : avatarDraft.split(',')[1] });
      setAvatarDraft(undefined);
    }, setIdentityNotice, t('Profile updated.'));
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const next = String(values.get('newPassword') ?? '');
    const confirmation = String(values.get('confirmation') ?? '');
    if (next !== confirmation) {
      setPasswordNotice({ error: true, text: t('The passwords do not match.') });
      return;
    }
    void perform(async () => {
      await changePassword(String(values.get('currentPassword') ?? ''), next, confirmation);
      form.reset();
    }, setPasswordNotice, t('Password updated.'));
  }

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14'}>
      {!embedded && <h1 className="mb-5 text-2xl font-medium tracking-tight text-ink">{t('Profile')}</h1>}
      <div className={`divide-y divide-line ${embedded ? '' : 'rounded-2xl border border-line bg-white'}`}>
        <form className="space-y-4 px-4 py-4 sm:px-6 sm:py-5" onSubmit={saveAvatar} aria-labelledby={`${id}-identity`}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 id={`${id}-identity`} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
              <UserRound size={16} className="shrink-0 text-brand-700" aria-hidden="true" />{t('Account details')}
            </h2>
            <button type="button" className="btn-ghost min-h-11 rounded-full px-3 font-medium" disabled={pending} onClick={() => {
              void perform(async () => { await logOut(); navigate('/', { replace: true }); }, setLogoutNotice);
            }}>
              <LogOut size={15} aria-hidden="true" />{t('Log out')}
            </button>
          </div>
          <Message notice={logoutNotice} />
          <div className="flex flex-wrap items-center gap-4">
            <AccountAvatar avatar={avatar} large />
            <div className="min-w-0 space-y-1">
              <p className="break-all text-sm font-semibold text-ink">{account.username}</p>
              <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={chooseAvatar} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={secondaryAction} disabled={pending || readingAvatar} onClick={() => avatarInput.current?.click()}>
                  <ImagePlus size={16} aria-hidden="true" />{t('Change avatar')}
                </button>
                {avatar && (
                  <button type="button" className="btn-ghost min-h-11 rounded-full px-3 font-medium" disabled={pending || readingAvatar}
                    onClick={() => { setAvatarDraft(null); setIdentityNotice(null); }}>
                    {t('Remove avatar')}
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-muted">{t('JPEG, PNG or WebP, up to 4 MB.')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-panel-primary" disabled={pending || readingAvatar || avatarDraft === undefined}>
              {t('Save avatar')}
            </button>
            <Message notice={identityNotice} />
          </div>
        </form>

        <form className="space-y-4 px-4 py-5 sm:px-6" onSubmit={savePassword} aria-labelledby={`${id}-password`}>
          <h2 id={`${id}-password`} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
            <LockKeyhole size={16} className="shrink-0 text-brand-700" aria-hidden="true" />{t('Change password')}
          </h2>
          <label className={field}>
            {t('Current password')}
            <input className={input} type="password" name="currentPassword" autoComplete="current-password" maxLength={128} required disabled={pending} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field}>
              {t('New password')}
              <input className={input} type="password" name="newPassword" autoComplete="new-password" minLength={8} maxLength={128} required disabled={pending} />
            </label>
            <label className={field}>
              {t('Confirm password')}
              <input className={input} type="password" name="confirmation" autoComplete="new-password" minLength={8} maxLength={128} required disabled={pending} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-panel-primary" disabled={pending}>{t('Update password')}</button>
            <Message notice={passwordNotice} />
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const account = useAccount();
  const [failed, setFailed] = useState(false);

  function fetchAccount() {
    setFailed(false);
    loadAccount().catch(() => setFailed(true));
  }

  useEffect(() => {
    if (account === undefined) fetchAccount();
  }, [account]);

  if (account === null) return <Navigate to="/login?next=%2Fprofile" replace />;
  if (account) return <ProfileForm key={account.id} account={account} />;
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      {failed
        ? <button type="button" className="btn-secondary" onClick={fetchAccount}>{t('Try again')}</button>
        : <p role="status">{t('Loading profile…')}</p>}
    </div>
  );
}
