import { getFieldValue, type GenesisNode } from '@/lib/genesis-data';

export const FX_PROJECT_ID = '6Jn8YRhbGgfdzxMa';
export const TRY_CURRENCY = 'TRY';

export interface TcmbRateSnapshot {
  publishedDate: string;
  rates: Record<string, number>;
}

export interface RenewalConversion {
  amountTry: number | null;
  rate: number | null;
  rateDate: string | null;
  estimated: boolean;
}

function parsePublishedDate(xml: string): string | null {
  const match = xml.match(/<Tarih_Date\b[^>]*\bTarih=["'](\d{2})\.(\d{2})\.(\d{4})["']/i);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseRate(value: string | null): number | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/,/g, '.');
  const rate = Number(normalized);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function ratesFromXml(xml: string): TcmbRateSnapshot | null {
  const publishedDate = parsePublishedDate(xml);
  if (publishedDate == null) return null;
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) return null;

  const rates: Record<string, number> = { TRY: 1 };
  Array.from(document.getElementsByTagName('Currency')).forEach((currency) => {
    const code = currency.getAttribute('CurrencyCode')?.trim().toUpperCase();
    const unit = Number(currency.getAttribute('Unit') ?? '1');
    const selling = parseRate(currency.getElementsByTagName('ForexSelling')[0]?.textContent ?? null);
    if (code && selling != null && Number.isFinite(unit) && unit > 0) rates[code] = selling / unit;
  });

  return Object.keys(rates).length > 1 ? { publishedDate, rates } : null;
}

export function parseTcmbRateSnapshots(nodes: GenesisNode[]): TcmbRateSnapshot[] {
  const snapshots = nodes.flatMap((node) => {
    const xml = getFieldValue(node, 'TCMB XML', '@fxxml');
    if (xml == null || xml.trim() === '') return [];
    const snapshot = ratesFromXml(xml);
    return snapshot == null ? [] : [snapshot];
  });
  const byDate = new Map<string, TcmbRateSnapshot>();
  snapshots.sort((a, b) => a.publishedDate.localeCompare(b.publishedDate)).forEach((snapshot) => {
    byDate.set(snapshot.publishedDate, snapshot);
  });
  return Array.from(byDate.values()).sort((a, b) => a.publishedDate.localeCompare(b.publishedDate));
}

export function findRenewalConversion(
  amount: number,
  currency: string,
  dueDate: string,
  today: string,
  snapshots: TcmbRateSnapshot[],
): RenewalConversion {
  const normalizedCurrency = currency.trim().toUpperCase();
  const estimated = dueDate > today;
  if (normalizedCurrency === TRY_CURRENCY) {
    return { amountTry: amount, rate: 1, rateDate: null, estimated };
  }

  const eligible = estimated
    ? snapshots
    : snapshots.filter((snapshot) => snapshot.publishedDate <= dueDate);
  const snapshot = eligible[eligible.length - 1];
  const rate = snapshot?.rates[normalizedCurrency] ?? null;
  return {
    amountTry: rate == null ? null : amount * rate,
    rate,
    rateDate: snapshot?.publishedDate ?? null,
    estimated,
  };
}

export function getLatestRateDate(snapshots: TcmbRateSnapshot[]): string | null {
  return snapshots[snapshots.length - 1]?.publishedDate ?? null;
}
