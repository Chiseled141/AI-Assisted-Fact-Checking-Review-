import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Ban, Check, ChevronDown, ChevronRight, Globe, Languages, Library, ListChecks, Lock, Minus, Monitor, Moon, PenLine, Plus, Repeat, Search, Sun, Telescope, UserRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { config } from '../../config';
import { t } from '../../lib/i18n';
import { setTheme, type Theme, useTheme } from '../../lib/theme';
import { updateProfile, useAccount } from '../../services/account';
import { ValidationError } from '../../services/errors';
import type { Account, ApiProvider, SearchOptions } from '../../types/models';

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

function Stepper({ label, icon, value, limits, disabled, onChange }: {
  label: string;
  icon: ReactNode;
  value: number | null;
  limits: { min: number; max: number; serverDefault: number };
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const shown = value ?? limits.serverDefault;
  // Stepping back onto the server's number clears the setting, so a later change on the server still applies.
  const step = (by: number) => {
    const next = Math.max(limits.min, Math.min(limits.max, shown + by));
    onChange(next === limits.serverDefault ? null : next);
  };
  const stepClass = 'grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ink transition-colors enabled:hover:border-brand-200 enabled:hover:bg-brand-50 enabled:hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:text-zinc-300';
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-zinc-50 py-2 pl-4 pr-2">
      <span id={`${id}-label`} className="flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium text-ink">
        {icon}
        {label}
      </span>
      <button type="button" className={stepClass} disabled={disabled || shown <= limits.min} onClick={() => step(-1)} aria-label={`${t('Fewer')}: ${label}`}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span aria-live="polite" className="w-10 text-center leading-tight">
        <span className="block text-base font-semibold tabular-nums text-ink">{shown}</span>
        <span className={`block text-[0.65rem] text-ink-muted ${value === null ? '' : 'invisible'}`}>{t('default')}</span>
      </span>
      <button type="button" className={stepClass} disabled={disabled || shown >= limits.max} onClick={() => step(1)} aria-label={`${t('More')}: ${label}`}>
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function Toggle({ label, help, icon, checked, disabled, onChange }: {
  label: string;
  help: string;
  icon: ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <span id={`${id}-label`} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          {icon}
          {label}
        </span>
        <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-ink-muted">{help}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 enabled:cursor-pointer disabled:opacity-50 ${checked ? 'bg-brand-700' : 'bg-zinc-300'}`}
      >
        <span className={`h-5 w-5 rounded-full bg-white shadow-sm motion-safe:transition-transform ${checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

/** A bare host, as the backend keeps it: "https://www.Example.com/news" becomes "example.com". */
function hostOf(entry: string): string | null {
  const host = entry.trim().toLowerCase().split('://').pop()!.split('/')[0].replace(/^www\./, '').replace(/\.$/, '');
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host) ? host : null;
}

function DomainList({ label, help, value, disabled, onChange }: {
  label: string;
  help: string;
  value: readonly string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const full = value.length >= config.search.maxBlockedDomains;

  function add() {
    const entries = draft.split(/[\s,]+/).filter(Boolean);
    if (!entries.length) return;
    const hosts = entries.map(hostOf);
    const bad = entries.find((_, index) => !hosts[index]);
    if (bad) return setError(t('“{entry}” is not a website address.', { entry: bad }));
    const next = [...new Set([...value, ...(hosts as string[])])];
    if (next.length > config.search.maxBlockedDomains) {
      return setError(t('You can block at most {count} sites.', { count: config.search.maxBlockedDomains }));
    }
    setDraft('');
    setError(undefined);
    onChange(next);
  }

  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <Ban className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
        {label}
      </label>
      <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-ink-muted">{help}</p>
      <div className="mt-2.5 flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-zinc-50 px-2 py-1.5 transition-colors focus-within:border-brand-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20">
        {value.map((host) => (
          <span key={host} className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink">
            {host}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((item) => item !== host))}
              aria-label={t('Remove {site}', { site: host })}
              className="grid h-5 w-5 place-items-center rounded-full text-ink-muted enabled:hover:bg-zinc-100 enabled:hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={disabled || full}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            } else if (event.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={add}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          aria-invalid={Boolean(error)}
          placeholder={value.length ? '' : 'example.com'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-ink outline-none placeholder:text-ink-muted disabled:text-ink-muted"
        />
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

const NO_OPTIONS: SearchOptions = {
  sourcesPerClaim: null, searchesPerClaim: null, searchOutsideList: null, searchDepth: null, claimsPerCheck: null,
  blockedDomains: null,
};

/** One spelling for each setting, so an unset one and one put back to the server's value compare equal. */
function tidy(options: SearchOptions): SearchOptions {
  return {
    ...NO_OPTIONS,
    ...options,
    searchDepth: options.searchDepth === 'advanced' ? 'advanced' : null,
    blockedDomains: options.blockedDomains?.length ? options.blockedDomains : null,
  };
}

function sameOptions(a: SearchOptions, b: SearchOptions) {
  return JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));
}

function SearchPreferences({ account, logIn }: { account: Account | null | undefined; logIn: ReactNode }) {
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [draftLanguage, setDraftLanguage] = useState<'vi' | 'en'>();
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [draftOptions, setDraftOptions] = useState<SearchOptions | null>(null);
  const [draftProvider, setDraftProvider] = useState<ApiProvider | null>();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const noteId = useId();
  const providerId = useId();
  const provider = draftProvider === undefined ? account?.apiProvider ?? null : draftProvider;
  const providerChanged = JSON.stringify(provider) !== JSON.stringify(account?.apiProvider ?? null) || Boolean(apiKey);
  const duplicateJudges = provider && provider.judgeModels[0].trim() !== '' && provider.judgeModels[0].trim() === provider.judgeModels[1].trim();
  const needsKey = !account?.hasApiKey || provider?.baseUrl.trim().replace(/\/+$/, '') !== account?.apiProvider?.baseUrl;
  const savedModel = config.judges.options.find((model) => model.id === account?.preferredSearchModelId)?.id ?? '';
  const savedLanguage = account?.preferredSourceLanguage ?? null;
  const savedNote = account?.searchInstructions ?? '';
  const savedOptions = tidy({ ...NO_OPTIONS, ...account?.searchOptions });
  const modelId = draftModel ?? savedModel;
  const sourceLanguage = draftLanguage ?? savedLanguage;
  const note = draftNote ?? savedNote;
  const options = draftOptions ?? savedOptions;
  const modelChanged = modelId !== savedModel;
  const languageChanged = sourceLanguage !== null && sourceLanguage !== savedLanguage;
  const noteChanged = note.trim() !== savedNote;
  const optionsChanged = !sameOptions(options, savedOptions);
  const changed = modelChanged || languageChanged || noteChanged || optionsChanged || providerChanged;
  const disabled = !account || saving;
  const { noteMaxLength } = config.search;

  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setNotice(undefined);
    };
  }
  const setOption = <K extends keyof SearchOptions>(key: K) => edit((value: SearchOptions[K]) => setDraftOptions({ ...options, [key]: value }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !changed) return;
    if (duplicateJudges) return;
    setSaving(true);
    setNotice(undefined);
    try {
      await updateProfile({
        ...(modelChanged ? { preferredSearchModelId: modelId || null } : {}),
        ...(languageChanged ? { preferredSourceLanguage: sourceLanguage } : {}),
        ...(noteChanged ? { searchInstructions: note.trim() || null } : {}),
        ...(optionsChanged ? { searchOptions: tidy(options) } : {}),
        ...(providerChanged ? { apiProvider: provider, ...(provider && apiKey.trim() ? { apiKey: apiKey.trim() } : {}) } : {}),
      });
      setDraftModel(null);
      setDraftLanguage(undefined);
      setDraftNote(null);
      setDraftOptions(null);
      setDraftProvider(undefined);
      setApiKey('');
      setNotice({ text: t(providerChanged ? 'API settings saved.' : 'Search preferences saved.') });
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
      {account === null && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-brand-200 bg-brand-50 py-2 pl-4 pr-2">
          <p className="flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium text-ink">
            <Lock className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            {t('Log in to change your search preferences.')}
          </p>
          {logIn}
        </div>
      )}
      <div className="space-y-4 border-b border-line pb-5">
        <Toggle
          label={t('Use a third-party API')}
          help={t('Use your own OpenAI-compatible endpoint for every AI step, including two judge models.')}
          icon={<Globe className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
          checked={Boolean(provider)}
          disabled={disabled}
          onChange={(on) => {
            setDraftProvider(on ? { baseUrl: '', model: '', judgeModels: ['', ''], supportsJsonMode: true } : null);
            setApiKey('');
            setNotice(undefined);
          }}
        />
        {provider && (
          <fieldset disabled={disabled} className="space-y-4">
            <legend className="sr-only">{t('Custom API settings')}</legend>
            <p className="text-xs leading-relaxed text-ink-muted">
              {t('Your key stays in server memory. Re-enter it after a server restart or after 30 days. Web search still uses Tavily.')}
            </p>
            {account?.apiProvider && !account.hasApiKey && (
              <p role="status" className="text-xs text-orange-700">{t('Re-enter your custom API key in Settings to use this endpoint.')}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                { key: 'baseUrl', label: 'API base URL', type: 'url', placeholder: 'https://api.example.com/v1', value: provider.baseUrl, maxLength: 500 },
                { key: 'apiKey', label: 'API key', type: 'password', placeholder: account?.hasApiKey && !needsKey ? t('Key saved; leave blank to keep it') : '', value: apiKey, maxLength: 4096 },
                { key: 'model', label: 'Extraction, search & follow-up model', type: 'text', placeholder: 'model-id', value: provider.model, maxLength: 200 },
                { key: 'judge1', label: 'First judge model', type: 'text', placeholder: 'judge-model-id', value: provider.judgeModels[0], maxLength: 200 },
                { key: 'judge2', label: 'Second judge model', type: 'text', placeholder: 'another-judge-model-id', value: provider.judgeModels[1], maxLength: 200 },
              ] as const).map((field) => (
                <div key={field.key} className={field.key === 'model' ? 'sm:col-span-2' : ''}>
                  <label htmlFor={`${providerId}-${field.key}`} className="text-sm font-semibold text-ink">{t(field.label)}</label>
                  <input
                    id={`${providerId}-${field.key}`}
                    type={field.type}
                    value={field.value}
                    required={field.key !== 'apiKey' || needsKey}
                    pattern={field.key === 'baseUrl' ? 'https://.*' : undefined}
                    maxLength={field.maxLength}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={field.key === 'judge2' && Boolean(duplicateJudges)}
                    aria-describedby={field.key === 'judge2' && duplicateJudges ? `${providerId}-judge-error` : undefined}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (field.key === 'apiKey') setApiKey(value);
                      else if (field.key === 'judge1' || field.key === 'judge2') {
                        const judges: [string, string] = [...provider.judgeModels];
                        judges[field.key === 'judge1' ? 0 : 1] = value;
                        setDraftProvider({ ...provider, judgeModels: judges });
                      } else setDraftProvider({ ...provider, [field.key]: value });
                      setNotice(undefined);
                    }}
                    className="mt-2 block min-h-11 w-full rounded-xl border border-line bg-zinc-50 px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-brand-200 focus:bg-white focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
                  />
                  {field.key === 'judge2' && duplicateJudges && (
                    <p id={`${providerId}-judge-error`} role="alert" className="mt-1.5 text-xs text-rose-700">{t('Enter two different judge model IDs.')}</p>
                  )}
                </div>
              ))}
            </div>
            <Toggle
              label={t('JSON response format')}
              help={t('Turn off if your provider does not support JSON mode. Answers are still validated.')}
              icon={<Check className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
              checked={provider.supportsJsonMode}
              disabled={disabled}
              onChange={(on) => { setDraftProvider({ ...provider, supportsJsonMode: on }); setNotice(undefined); }}
            />
          </fieldset>
        )}
      </div>
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        <div className="space-y-4">
          <PreferenceSelect
            label={t('Tavily search model')}
            help={t(provider ? 'Your custom API model handles search while the third-party API is enabled.' : 'This model writes Tavily queries and selects sources for new checks.')}
            icon={<Search className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
            value={modelId}
            disabled={disabled || Boolean(provider)}
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
          <Toggle
            label={t('Search beyond approved sources')}
            help={t('When approved sources find nothing usable, look at original reporting from other publishers after an editorial review.')}
            icon={<Globe className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
            checked={options.searchOutsideList !== false}
            disabled={disabled}
            onChange={(on) => setOption('searchOutsideList')(on ? null : false)}
          />
          <Toggle
            label={t('Advanced search')}
            help={t('Every search reads deeper into each page. It finds more and uses twice the Tavily credit.')}
            icon={<Telescope className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
            checked={options.searchDepth === 'advanced'}
            disabled={disabled}
            onChange={(on) => setOption('searchDepth')(on ? 'advanced' : null)}
          />
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor={noteId} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
              <PenLine className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
              {t('Search prompt')}
            </label>
            <p id={`${noteId}-help`} className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              {t('Tell the search model where to look. Only it reads this note; the judges never see it, so it can’t change a verdict.')}
            </p>
            <div className="mt-2.5 rounded-2xl border border-line bg-zinc-50 px-3 pb-2 pt-2.5 transition-colors focus-within:border-brand-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20">
              <textarea
                id={noteId}
                value={note}
                disabled={disabled}
                maxLength={noteMaxLength}
                rows={3}
                onChange={(event) => edit(setDraftNote)(event.target.value)}
                aria-describedby={`${noteId}-help ${noteId}-count`}
                placeholder={t('For example: prefer official statistics agencies and reporting from Southeast Asia.')}
                className="block w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted disabled:text-ink-muted"
              />
              <p id={`${noteId}-count`} className={`mt-1 text-right text-[0.7rem] tabular-nums ${note.length >= noteMaxLength ? 'text-orange-700' : 'text-ink-muted'}`}>
                {note.length}/{noteMaxLength}
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <Stepper
              label={t('Sources per claim')}
              icon={<Library className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
              value={options.sourcesPerClaim}
              limits={config.search.sourcesPerClaim}
              disabled={disabled}
              onChange={setOption('sourcesPerClaim')}
            />
            <Stepper
              label={t('Searches per claim')}
              icon={<Repeat className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
              value={options.searchesPerClaim}
              limits={config.search.searchesPerClaim}
              disabled={disabled}
              onChange={setOption('searchesPerClaim')}
            />
            <Stepper
              label={t('Claims per check')}
              icon={<ListChecks className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
              value={options.claimsPerCheck}
              limits={config.search.claimsPerCheck}
              disabled={disabled}
              onChange={setOption('claimsPerCheck')}
            />
          </div>
          <DomainList
            label={t('Blocked sources')}
            help={t('Sites your checks never use as a source. Type a site and press Enter.')}
            value={options.blockedDomains ?? []}
            disabled={disabled}
            onChange={setOption('blockedDomains')}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {notice && <p role={notice.error ? 'alert' : 'status'} className={`mr-auto text-xs ${notice.error ? 'text-rose-700' : 'text-brand-700'}`}>{notice.text}</p>}
        <button
          type="submit"
          className="btn-panel-primary"
          disabled={disabled || !changed}
        >
          {t('Save')}
        </button>
      </div>
    </form>
  );
}

const themeOptions = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Follow device', Icon: Monitor },
] as const satisfies ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }>;

function AppearanceSettings() {
  const theme = useTheme();
  const groupName = useId();

  return (
    <div className="px-4 py-4 sm:px-5">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">{t('Appearance')}</legend>
        <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-2xl border border-line bg-zinc-50 p-1">
          {themeOptions.map(({ value, label, Icon }) => (
            <label key={value} className="relative cursor-pointer">
              <input
                type="radio"
                name={groupName}
                value={value}
                checked={theme === value}
                onChange={() => setTheme(value)}
                className="peer sr-only"
              />
              <span className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1.5 text-center text-xs font-medium text-ink-muted hover:bg-zinc-100 peer-checked:bg-white peer-checked:text-brand-700 peer-checked:ring-1 peer-checked:ring-inset peer-checked:ring-line-strong peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(label)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
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
        <AppearanceSettings />
        <SearchPreferences
          key={account?.id}
          account={account}
          logIn={onManageAccount
            ? <button type="button" onClick={onManageAccount} className="btn-panel-primary">{t('Log in')}</button>
            : <Link to="/login?next=%2Fsettings" className="btn-panel-primary">{t('Log in')}</Link>}
        />
        {onManageAccount
          ? <button type="button" onClick={onManageAccount} className={accountClass}>{accountLabel}</button>
          : <Link to={account ? '/profile' : '/login?next=%2Fprofile'} className={accountClass}>{accountLabel}</Link>}
      </div>
    </div>
  );
}
