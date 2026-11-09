import { useId, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { t, useLanguage } from '../../lib/i18n';
import type { StockMarket } from '../../types/models';

interface Company {
  symbol: string;
  ticker: string;
  name: string;
}

interface Market {
  id: StockMarket;
  label: string;
  title: string;
  dataSource: string;
  embed?: boolean;
  companies?: Company[];
}

const markets: Market[] = [
  { id: 'us', label: 'United States', title: 'All U.S. stocks', dataSource: 'AllUSA', embed: true },
  {
    id: 'cn', label: 'Mainland China', title: 'Mainland China stocks', dataSource: 'AllCN',
    companies: [
      { symbol: 'SSE-601398', ticker: '601398', name: 'ICBC' },
      { symbol: 'SSE-601288', ticker: '601288', name: 'Agricultural Bank of China' },
      { symbol: 'SSE-601857', ticker: '601857', name: 'PetroChina' },
    ],
  },
  {
    id: 'jp', label: 'Japan', title: 'Japanese stocks', dataSource: 'AllJP',
    companies: [
      { symbol: 'TSE-8306', ticker: '8306', name: 'Mitsubishi UFJ Financial' },
      { symbol: 'TSE-7203', ticker: '7203', name: 'Toyota' },
      { symbol: 'TSE-9984', ticker: '9984', name: 'SoftBank Group' },
    ],
  },
  { id: 'hk', label: 'Hong Kong', title: 'Hang Seng China Enterprises Index', dataSource: 'HSCEI', embed: true },
  { id: 'in', label: 'India', title: 'S&P BSE Sensex Index', dataSource: 'SENSEX', embed: true },
  {
    id: 'vn', label: 'Vietnam · VN-Index', title: 'Vietnamese stocks', dataSource: 'AllVN',
    companies: [
      { symbol: 'HOSE-VIC', ticker: 'VIC', name: 'Vingroup' },
      { symbol: 'HOSE-VHM', ticker: 'VHM', name: 'Vinhomes' },
      { symbol: 'HOSE-VCB', ticker: 'VCB', name: 'Vietcombank' },
    ],
  },
];

const settingsHash = (settings: object) => encodeURIComponent(JSON.stringify(settings));
const embedHost = 'https://www.tradingview-widget.com/embed-widget';
const marketLinkClass = 'btn min-h-11 max-w-full whitespace-normal border border-white/20 bg-white/5 text-slate-100 hover:bg-white/10';

export function StockHeatmap({ marketIds }: { marketIds: StockMarket[] }) {
  const language = useLanguage();
  const headingId = useId();
  const selectorId = useId();
  const [selection, setSelection] = useState('');
  const available = markets.filter(({ id }) => marketIds.includes(id));
  const market = available.find(({ id }) => id === selection) ?? available[0];
  if (!market) return null;
  const tradingView = language === 'vi' ? 'https://vn.tradingview.com' : 'https://www.tradingview.com';
  const settings = { dataSource: market.dataSource, blockColor: 'change', blockSize: 'market_cap_basic', grouping: 'sector' };
  const heatmapUrl = `${tradingView}/heatmap/stock/#${settingsHash(settings)}`;
  const embedUrl = `${embedHost}/stock-heatmap/?locale=${language}#${settingsHash({
    ...settings, colorTheme: 'dark', hasTopBar: true, isDataSetEnabled: false,
  })}`;

  return (
    <section aria-labelledby={headingId} className="mt-8 min-w-0 rounded-2xl bg-[#252931] p-4 text-slate-100 sm:p-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={headingId} className="text-[24px] font-semibold tracking-tight text-white">{t('Stock heatmap')}</h2>
          <p className="mt-1 text-sm text-slate-300">{t('Latest available session on TradingView.')}</p>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            {t('Stocks are grouped by sector. Tile size shows market cap and color shows daily price change.')}
          </p>
        </div>
        {available.length > 1 && (
          <div className="sm:w-52 sm:shrink-0">
            <label className="mb-1.5 block text-sm font-semibold" htmlFor={selectorId}>{t('Stock market')}</label>
            <select
              className="min-h-11 w-full rounded-lg border border-white/20 bg-[#414555] px-3 py-2 text-sm [color-scheme:dark]"
              id={selectorId}
              value={market.id}
              onChange={(event) => setSelection(event.target.value)}
            >
              {available.map(({ id, label }) => <option key={id} value={id}>{t(label)}</option>)}
            </select>
          </div>
        )}
      </header>

      {market.id === 'vn' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/20 px-3 py-2">
          <div>
            <h3 className="font-semibold">VN-Index</h3>
            <p className="text-sm text-slate-300">HOSE:VNINDEX</p>
          </div>
          <a className={marketLinkClass} href={`${tradingView}/symbols/HOSE-VNINDEX/`}
            target="_blank" rel="noopener noreferrer">
            {t('View VN-Index on TradingView')}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </a>
        </div>
      )}

      <div className="mt-5 border-t border-white/20 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">{t(market.title)}</h3>
          <a className={marketLinkClass} href={heatmapUrl} target="_blank" rel="noopener noreferrer">
            {t('View heatmap on TradingView')}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </a>
        </div>

        {market.embed ? (
          <iframe
            key={embedUrl}
            className="mt-4 block h-[clamp(420px,70vh,760px)] w-full rounded-lg border border-white/20 bg-[#252931]"
            src={embedUrl}
            loading="lazy"
            title={t('{market} stock heatmap', { market: t(market.label) })}
          />
        ) : (
          <p className="mt-2 text-sm text-slate-300">{t('TradingView hosts this market’s heatmap on its own site.')}</p>
        )}

        {market.companies && (
          <div className="mt-5 border-t border-white/20 pt-4">
            <p className="text-sm font-semibold">{t('Selected large-cap companies')}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {market.companies.map(({ symbol, ticker, name }) => (
                <li key={symbol}>
                  <a className="flex min-h-14 items-center gap-3 rounded-lg border border-white/20 bg-white/5 px-3 py-2 hover:bg-white/10"
                    href={`${tradingView}/symbols/${symbol}/`} target="_blank" rel="noopener noreferrer">
                    <img className="shrink-0 rounded-full" src={`${import.meta.env.BASE_URL}market-logos/${ticker}.svg`}
                      width="32" height="32" alt="" loading="lazy" />
                    <span className="min-w-0 text-sm leading-snug">
                      {name}
                      <span className="block text-xs text-slate-300">{ticker}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-300">{t('Company logos from TradingView')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
