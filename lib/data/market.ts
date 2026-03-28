import { MarketSnapshot } from '@/lib/types';
import { calcSMA, calcRSI, calcMACD } from '@/lib/indicators';

const SYMBOLS = {
  aapl:   { symbol: 'AAPL',  name: 'Apple Inc.' },
  sp500:  { symbol: '^GSPC', name: 'S&P 500' },
  nasdaq: { symbol: '^IXIC', name: 'NASDAQ' },
  btc:    { symbol: 'BTC-USD', name: 'Bitcoin' },
};

async function fetchYahoo(symbol: string): Promise<MarketSnapshot> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=60d`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Yahoo Finance error for ${symbol}: ${res.status}`);

  const data = await res.json();
  const result = data.chart.result[0];
  const meta = result.meta;
  const quotes = result.indicators.quote[0];
  const closes: number[] = quotes.close.filter(Boolean);

  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  const name = SYMBOLS[symbol as keyof typeof SYMBOLS]?.name ?? symbol;

  return {
    symbol,
    name,
    price,
    changePercent,
    volume: meta.regularMarketVolume ?? 0,
    prices30d: closes.slice(-30),
    sma20: calcSMA(closes, 20),
    sma50: calcSMA(closes, 50),
    rsi: calcRSI(closes),
    macdSignal: calcMACD(closes),
  };
}

export async function fetchAllMarkets(): Promise<{
  aapl: MarketSnapshot;
  sp500: MarketSnapshot;
  nasdaq: MarketSnapshot;
  btc: MarketSnapshot;
}> {
  const [aapl, sp500, nasdaq, btc] = await Promise.all([
    fetchYahoo('AAPL'),
    fetchYahoo('^GSPC'),
    fetchYahoo('^IXIC'),
    fetchYahoo('BTC-USD'),
  ]);
  return { aapl, sp500, nasdaq, btc };
}
