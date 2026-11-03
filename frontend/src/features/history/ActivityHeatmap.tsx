import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { checkService } from '../../services';
import { formatCalendarDate, pluralize } from '../../lib/format';
import { locale, t, useLanguage } from '../../lib/i18n';

const WEEKS = 53;
const API_PAGE_SIZE = 100;
const MAX_PAGES = 20;

// One hue from light to dark, the page's green, so more checks always read as darker.
const levelColor = ['bg-line', 'bg-brand-200', 'bg-brand-500', 'bg-brand-700', 'bg-brand-900'];

function levelOf(count: number) {
  if (count >= 5) return 4;
  if (count >= 3) return 3;
  return count;
}

/** A local calendar day as YYYY-MM-DD, so a late-night check lands on the day the reader saw it. */
function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Every day from the Monday 52 weeks back up to today, in columns of one week. */
function buildDays(today: Date) {
  const mondayOffset = (today.getDay() + 6) % 7;
  const days: { key: string; date: Date; column: number; row: number }[] = [];
  for (let index = 0; ; index++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset - (WEEKS - 1) * 7 + index);
    if (date > today) return days;
    days.push({ key: dayKey(date), date, column: Math.floor(index / 7), row: index % 7 });
  }
}

/** The list endpoint is paged and newest first, so reading stops at the first check before the window. */
async function loadCreatedDates(since: Date) {
  const dates: string[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await checkService.listChecks({ page, pageSize: API_PAGE_SIZE });
    dates.push(...result.items.map((check) => check.createdAt));
    const oldest = result.items[result.items.length - 1];
    if (page >= result.totalPages || !oldest || new Date(oldest.createdAt) < since) break;
  }
  return dates;
}

type Tooltip = { key: string; x: number; y: number; align: string };

/** Checks per day over the past year. Always counts every check, whatever filters the list below has. */
export function ActivityHeatmap() {
  const language = useLanguage();
  const days = useMemo(() => buildDays(new Date()), []);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [failed, setFailed] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadCreatedDates(days[0].date)
      .then((dates) => {
        if (cancelled) return;
        const next = new Map<string, number>();
        for (const iso of dates) {
          const date = new Date(iso);
          if (Number.isNaN(date.getTime())) continue;
          const key = dayKey(date);
          next.set(key, (next.get(key) ?? 0) + 1);
        }
        setCounts(next);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [days, language]);

  // On a phone the year scrolls sideways; the latest weeks are the ones worth seeing first.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  if (failed) return null;

  const activeDays = counts ? days.filter((day) => counts.get(day.key)) : [];
  const total = activeDays.reduce((sum, day) => sum + (counts?.get(day.key) ?? 0), 0);
  const summary = t('{count} in the past year', { count: pluralize(total, 'check') });
  const monthLabel = new Intl.DateTimeFormat(locale(), { month: 'short' });
  const weekdayLabel = new Intl.DateTimeFormat(locale(), { weekday: 'short' });

  function showTooltip(event: PointerEvent<HTMLDivElement>) {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-day]');
    if (!cell || !wrapper.current) return setTooltip(null);
    const box = wrapper.current.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - box.left;
    const share = x / box.width;
    setTooltip({
      key: cell.dataset.day!,
      x,
      y: rect.top - box.top,
      // Near an edge the tooltip grows inward, so it never leaves the box.
      align: share < 0.15 ? '-translate-x-0' : share > 0.85 ? '-translate-x-full' : '-translate-x-1/2',
    });
  }

  return (
    <div ref={wrapper} className="relative">
      <div
        ref={scroller}
        role="img"
        aria-label={counts ? summary : t('Checks per day')}
        tabIndex={0}
        onPointerOver={showTooltip}
        onPointerLeave={() => setTooltip(null)}
        className="overflow-x-auto"
      >
        <div
          // The bottom padding keeps a phone's scrollbar off the last row.
          className="grid min-w-[680px] pb-2"
          style={{ gridTemplateColumns: `auto repeat(${WEEKS}, minmax(0, 1fr))` }}
        >
          {days
            .filter((day) => day.row === 0)
            .map((monday) => {
              const firstOfMonth = monday.date.getDate() <= 7;
              if (!firstOfMonth) return null;
              return (
                <span
                  key={monday.key}
                  style={{ gridColumn: monday.column + 2, gridRow: 1 }}
                  // A label in the last weeks hangs leftward, or it would widen the grid and clip the weekdays.
                  className={`whitespace-nowrap pb-1.5 text-[12px] leading-none text-ink-muted ${
                    monday.column >= WEEKS - 2 ? 'justify-self-end pr-px' : 'pl-px'
                  }`}
                >
                  {/* "Tháng 11" is too wide for a month's column, and the two last months would touch. */}
                  {language === 'vi'
                    ? `T${monday.date.getMonth() + 1}`
                    : monthLabel.format(new Date(monday.date.getFullYear(), monday.date.getMonth(), 1))}
                </span>
              );
            })}
          {days
            .filter((day) => day.column === 0 && day.row % 2 === 0 && day.row < 6)
            .map((day) => (
              <span
                key={day.key}
                style={{ gridColumn: 1, gridRow: day.row + 2 }}
                className="self-center whitespace-nowrap pr-2 text-[12px] leading-none text-ink-muted"
              >
                {weekdayLabel.format(day.date)}
              </span>
            ))}
          {days.map((day) => (
            // The padding is the gap between cells, so the hover target has no dead spots.
            <span key={day.key} data-day={day.key} style={{ gridColumn: day.column + 2, gridRow: day.row + 2 }} className="p-[1.5px]">
              <span className={`block aspect-square rounded-[3px] ${levelColor[levelOf(counts?.get(day.key) ?? 0)]}`} />
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1 text-[12px] text-ink-muted" aria-hidden="true">
        <span className="mr-1">{t('Less')}</span>
        {levelColor.map((color) => (
          <span key={color} className={`h-3 w-3 rounded-[3px] ${color}`} />
        ))}
        <span className="ml-1">{t('More')}</span>
      </div>

      {tooltip && (
        <div
          aria-hidden="true"
          style={{ left: tooltip.x, top: tooltip.y - 4 }}
          className={`pointer-events-none absolute z-10 -translate-y-full whitespace-nowrap rounded bg-ink px-2 py-1 text-[12px] tabular-nums text-page ${tooltip.align}`}
        >
          {pluralize(counts?.get(tooltip.key) ?? 0, 'check')} · {formatCalendarDate(tooltip.key)}
        </div>
      )}

      {activeDays.length > 0 && (
        <table className="sr-only">
          <caption>{t('Checks per day')}</caption>
          <tbody>
            {activeDays.map((day) => (
              <tr key={day.key}>
                <th scope="row">{formatCalendarDate(day.key)}</th>
                <td>{pluralize(counts!.get(day.key)!, 'check')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
