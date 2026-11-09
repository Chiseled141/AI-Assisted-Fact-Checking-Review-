import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Languages, Search, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { config } from '../../config';
import { t } from '../../lib/i18n';
import { updateProfile, useAccount } from '../../services/account';
import { ValidationError } from '../../services/errors';
import type { Account } from '../../types/models';

type PreferenceOption = { value: string; label: string; lang?: string; logo?: string };

function PreferenceSelect({ label, help, icon, value, disabled, onChange, options }: {
  label: string;
  help: string;
  icon: ReactNode;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: PreferenceOption[];
}) {
  const id = useId();
  const listId = `${id}-options`;
  const pickerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: '', lastKeyAt: 0 });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];
  const open = activeIndex !== null && !disabled;
  const activeId = open ? `${listId}-${activeIndex}` : undefined;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || activeIndex === null) return;
    const option = list.children[activeIndex] as HTMLElement;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    const overflow = option.offsetTop + option.offsetHeight - list.clientHeight - list.scrollTop;
    if (overflow > 0) list.scrollTop += overflow;
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setActiveIndex(null);
    }
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open]);

  function select(option: PreferenceOption) {
    setActiveIndex(null);
    if (option.value !== value) onChange(option.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(activeIndex === null ? selectedIndex : Math.max(0, Math.min(activeIndex + direction, options.length - 1)));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (open && (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape')) {
      event.preventDefault();
      if (event.key === 'Escape') setActiveIndex(null);
      else select(options[activeIndex]);
    } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const previous = typeahead.current;
      const prefix = `${now - previous.lastKeyAt < 500 ? previous.text : ''}${event.key}`.toLocaleLowerCase();
      typeahead.current = { text: prefix, lastKeyAt: now };
      const match = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(prefix));
      if (match !== -1) setActiveIndex(match);
    }
  }

  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        {icon}
        {label}
      </label>
      <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-ink-muted">{help}</p>
      <div ref={pickerRef} className="mt-2.5">
        <button
          id={id}
          type="button"
          role="combobox"
          disabled={disabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-help`}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={activeId}
          onBlur={() => setActiveIndex(null)}
          onClick={() => setActiveIndex(open ? null : selectedIndex)}
          onKeyDown={handleKeyDown}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-full border border-line bg-zinc-50 px-4 py-2 text-left text-sm font-medium text-ink transition-colors enabled:cursor-pointer enabled:hover:border-brand-200 enabled:hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 aria-expanded:border-brand-200 aria-expanded:bg-brand-50 disabled:text-ink-muted"
        >
          {selected.logo && <img src={selected.logo} alt="" className="h-4 w-4 shrink-0" />}
          <span lang={selected.lang} className="min-w-0 flex-1">{selected.label}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted motion-safe:transition-transform ${open ? 'rotate-180 text-brand-700' : ''}`} aria-hidden="true" />
        </button>
        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="soft-scroll relative mt-1.5 max-h-[min(16rem,40dvh)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white p-1.5 shadow-[0_10px_24px_-16px_rgb(18_56_41_/_0.35)]"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(option)}
                  className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-brand-50 ${isSelected ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink'} ${activeIndex === index ? 'ring-1 ring-inset ring-brand-200' : ''}`}
                >
                  {option.logo && <img src={option.logo} alt="" className="h-4 w-4 shrink-0" />}
                  <span lang={option.lang} className="min-w-0 flex-1">{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SearchPreferences({ account }: { account: Account | null | undefined }) {
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [draftLanguage, setDraftLanguage] = useState<'vi' | 'en'>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const savedModel = config.judges.options.find((model) => model.id === account?.preferredSearchModelId)?.id ?? '';
  const savedLanguage = account?.preferredSourceLanguage ?? null;
  const modelId = draftModel ?? savedModel;
  const sourceLanguage = draftLanguage ?? savedLanguage;
  const modelChanged = modelId !== savedModel;
  const languageChanged = sourceLanguage !== null && sourceLanguage !== savedLanguage;
  const disabled = !account || saving;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || (!modelChanged && !languageChanged)) return;
    setSaving(true);
    setNotice(undefined);
    try {
      await updateProfile({
        ...(modelChanged ? { preferredSearchModelId: modelId || null } : {}),
        ...(languageChanged ? { preferredSourceLanguage: sourceLanguage } : {}),
      });
      setDraftModel(null);
      setDraftLanguage(undefined);
      setNotice({ text: t('Search preferences saved.') });
    } catch (error) {
      setNotice({
        text: error instanceof ValidationError ? error.message : t('Could not reach ClaimTrace. Please try again.'),
        error: true,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 px-4 py-4 sm:px-5">
      <PreferenceSelect
        label={t('Tavily search model')}
        help={t('This model writes Tavily queries and selects sources for new checks.')}
        icon={<Search className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
        value={modelId}
        disabled={disabled}
        options={[
          { value: '', label: t('Server default') },
          ...config.judges.options.map(({ id, name, logo }) => ({ value: id, label: name, logo })),
        ]}
        onChange={(value) => {
          setDraftModel(value);
          setNotice(undefined);
        }}
      />
      <PreferenceSelect
        label={t('Preferred source language')}
        help={t('This sets the default for new checks. Claims in Vietnamese or about Vietnam prioritize Vietnamese outlets.')}
        icon={<Languages className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
        value={sourceLanguage ?? ''}
        disabled={disabled}
        options={[
          ...(savedLanguage === null ? [{ value: '', label: t('Server default') }] : []),
          { value: 'vi', label: 'Tiếng Việt', lang: 'vi' },
          { value: 'en', label: 'English', lang: 'en' },
        ]}
        onChange={(value) => {
          setDraftLanguage(value === 'vi' || value === 'en' ? value : undefined);
          setNotice(undefined);
        }}
      />
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {account === null && <p className="mr-auto text-xs text-ink-muted">{t('Log in to save search preferences.')}</p>}
        {notice && <p role={notice.error ? 'alert' : 'status'} className={`mr-auto text-xs ${notice.error ? 'text-rose-700' : 'text-brand-700'}`}>{notice.text}</p>}
        <button
          type="submit"
          className="btn-panel-primary"
          disabled={disabled || (!modelChanged && !languageChanged)}
        >
          {t('Save')}
        </button>
      </div>
    </form>
  );
}

export function SettingsPage({ onManageAccount }: { onManageAccount?: () => void } = {}) {
  const account = useAccount();
  const accountClass = 'flex min-h-14 w-full items-center gap-3 rounded-b-2xl px-4 text-left text-sm font-medium text-ink transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 sm:px-5';
  const accountLabel = <>
    <UserRound className="h-4 w-4 text-ink-muted" aria-hidden="true" />
    {t('Manage account')}
    <ChevronRight className="ml-auto h-4 w-4 text-ink-muted" aria-hidden="true" />
  </>;
  return (
    <div className={onManageAccount ? 'p-4 sm:p-5' : 'mx-auto w-full max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16'}>
      {!onManageAccount && <h1 className="mb-6 text-2xl font-medium tracking-tight text-ink">{t('Settings')}</h1>}
      <div className="divide-y divide-line rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <span className="flex items-center gap-3 text-sm font-medium text-ink">
            <Languages className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            {t('Language')}
          </span>
          <LanguageSwitcher />
        </div>
        <SearchPreferences key={account?.id} account={account} />
        {onManageAccount
          ? <button type="button" onClick={onManageAccount} className={accountClass}>{accountLabel}</button>
          : <Link to={account ? '/profile' : '/login?next=%2Fprofile'} className={accountClass}>{accountLabel}</Link>}
      </div>
    </div>
  );
}
