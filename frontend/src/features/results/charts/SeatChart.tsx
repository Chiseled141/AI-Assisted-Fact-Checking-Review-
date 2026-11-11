import { ChartReply } from './ChartReply';
import { PartyLogo } from '../../../components/PartyLogo';
import { findPartyIdentity, seatChartCountry } from '../../../data/partyRegistry';
import { lazy, Suspense, type ReactNode } from 'react';
import type { SeatChartData } from '../../../types/models';
import { formatCalendarDate, safeHref } from '../../../lib/format';
import { locale, t } from '../../../lib/i18n';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { seatChart } from './chartSettings';

const SeatPlot = lazy(() => import('./SeatPlot'));

const plotHeight = 340;
const phonePlotHeight = 220;

const seats = (count: number) => new Intl.NumberFormat(locale()).format(count);

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  const href = safeHref(url);
  if (!href) return <span className="text-xs text-ink-muted">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="relative text-xs text-ink-muted underline decoration-line-strong underline-offset-2 after:absolute after:-inset-1.5 hover:text-ink"
    >
      {children}
    </a>
  );
}

/**
 * Seats won in an election, drawn as a parliament. Claims without `seatChart` never reach this,
 * so Highcharts only loads when there is a chart to show.
 */
export function SeatChart({ chart, onReply }: { chart: SeatChartData; onReply?: (title: string) => void }) {
  const title = t('Seats in {body}', { body: chart.body });
  const country = seatChartCountry(chart.body, chart.parties.map((party) => party.name));
  const listed = chart.parties.reduce((sum, party) => sum + party.seats, 0);
  const notListed = chart.total - listed;
  const majority = Math.floor(chart.total / 2) + 1;
  const phone = useMediaQuery('(max-width: 639px)');
  const height = phone ? phonePlotHeight : plotHeight;

  return (
    <section aria-labelledby="seat-chart-heading" className="mt-8">
      {/* A white panel, the same as the other charts'. */}
      <div className="rounded-2xl border border-ink bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="seat-chart-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <ChartReply title={title} onReply={onReply} />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          {[chart.year, t('{count} seats', { count: seats(chart.total) })].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
          {/* The height matches the chart's, so nothing jumps when it loads. */}
          <div className="min-w-0 self-center" style={{ height }} aria-hidden="true">
            <Suspense fallback={null}>
              <SeatPlot chart={chart} height={height} notListed={notListed} phone={phone} />
            </Suspense>
          </div>
          <div className="min-w-0 self-start">
            <h3 className="text-[15px] font-medium leading-[1.3] text-ink">{t('Seats from the sources')}</h3>
            <div className="mt-3 space-y-3">
              <div className="overflow-hidden rounded-xl border border-line-strong bg-white">
                <h4 className="border-b border-line bg-page px-4 py-2.5 text-[13px] font-medium text-ink">
                  {t('Final seat counts')}
                </h4>
                <dl className="divide-y divide-line">
                  {chart.parties.map((party, index) => (
                    <div key={party.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                      <dt className="flex items-center gap-2 text-[13px] leading-[1.4] text-ink-soft">
                        <PartyLogo party={findPartyIdentity(party.name, country)}
                          color={seatChart.partyColors[index % seatChart.partyColors.length]} />
                        <span>
                          {party.name}
                          {party.others.length > 0 && (
                            <span className="mt-1.5 block w-fit whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
                              {t('Sources differ')}
                            </span>
                          )}
                        </span>
                      </dt>
                      <dd className="space-y-2 text-right">
                        {[party, ...party.others].map((count) => (
                          <div key={`${count.seats}-${count.publisher}`}>
                            <div className="text-[15px] font-medium leading-[1.3] text-ink">{seats(count.seats)}</div>
                            <SourceLink url={count.url}>{count.publisher}</SourceLink>
                          </div>
                        ))}
                      </dd>
                    </div>
                  ))}
                  {notListed > 0 && (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                      <dt className="flex items-baseline gap-2 text-[13px] leading-[1.4] text-ink-soft">
                        <span
                          className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-[3px]"
                          style={{ backgroundColor: seatChart.unreportedColor }}
                          aria-hidden="true"
                        />
                        <span>{t('Not verified in the sources')}</span>
                      </dt>
                      <dd className="text-right text-[15px] font-medium leading-[1.3] text-ink">{seats(notListed)}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="overflow-hidden rounded-xl border border-line-strong bg-white">
                <dl className="divide-y divide-line">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                    <dt className="text-[13px] leading-[1.4] text-ink-soft">{t('Seats in the chamber')}</dt>
                    <dd className="text-right">
                      <div className="text-[15px] font-medium leading-[1.3] text-ink">{seats(chart.total)}</div>
                      <SourceLink url={chart.totalSource.url}>{chart.totalSource.publisher}</SourceLink>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                    <dt className="text-[13px] leading-[1.4] text-ink-soft">{t('Needed for a majority')}</dt>
                    <dd className="text-right text-[15px] font-medium leading-[1.3] text-ink">{seats(majority)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {t(
          'Each count is copied from the article it links to, retrieved {date}. Seats that could not be verified in the sources are grey. This chart is context and did not decide the verdict.',
          {
            date: formatCalendarDate(chart.retrievedAt.slice(0, 10)),
          },
        )}
      </p>
    </section>
  );
}
