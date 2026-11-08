import { type KeyboardEvent, useRef } from 'react';
import { type Language, setLanguage, t, useLanguage } from '../lib/i18n';

const languages: { code: Language; short: string; name: string }[] = [
  { code: 'vi', short: 'VI', name: 'Tiếng Việt' },
  { code: 'en', short: 'EN', name: 'English' },
];

/** Two-way language toggle. The white pill slides under the chosen language. */
export function LanguageSwitcher() {
  const current = useLanguage();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, languages.findIndex(({ code }) => code === current));

  // Radio-group keys: arrows move the choice and the focus together.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + languages.length) % languages.length;
    setLanguage(languages[next].code);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('Language')}
      onKeyDown={onKeyDown}
      className="relative ml-1 grid grid-cols-2 rounded-full border border-line bg-zinc-100/70 p-0.5"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0_/_0.12)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {languages.map(({ code, short, name }, i) => (
        <button
          key={code}
          ref={(button) => {
            buttons.current[i] = button;
          }}
          type="button"
          role="radio"
          aria-checked={current === code}
          aria-label={name}
          lang={code}
          tabIndex={current === code ? 0 : -1}
          onClick={() => setLanguage(code)}
          className={`relative z-10 min-h-9 min-w-8 rounded-full px-1.5 text-xs font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:min-h-7 sm:min-w-11 sm:px-3 ${
            current === code ? 'text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {short}
        </button>
      ))}
    </div>
  );
}
