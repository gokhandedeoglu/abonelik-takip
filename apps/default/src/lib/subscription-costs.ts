import {
  getFieldNumber,
  getFieldValue,
  getTitle,
  type GenesisNode,
} from '@/lib/genesis-data';
import {
  CATEGORY_LABELS,
  getDayKey,
  STATUS_LABELS,
  type SubscriptionCategory,
  type SubscriptionStatus,
} from '@/lib/subscriptions';

export interface BillingInterval {
  kind: 'months' | 'days';
  amount: number;
  days: number;
  label: string;
}

export interface SubscriptionRecord {
  id: string;
  name: string;
  category: SubscriptionCategory;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  duration: string;
  planType: string;
  providerCompany: string;
  fee: number | null;
  currency: string;
}

export interface RenewalEvent {
  id: string;
  name: string;
  category: SubscriptionCategory;
  dueDate: string;
  amount: number;
  currency: string;
}

function normalizeCategory(value: string | null): SubscriptionCategory {
  if (value === 'ai' || value === 'Yapay zekâ' || value === 'Süper Zeka') return 'ai';
  if (value === 'egitim' || value === 'Online eğitim') return 'egitim';
  if (value === 'domain' || value === 'Domain') return 'domain';
  if (value === 'egitim_sitesi' || value === 'Eğitim sitesi') return 'egitim_sitesi';
  if (value === 'eglence' || value === 'Eğlence') return 'eglence';
  if (value === 'mobil_uygulama' || value === 'Mobil Uygulama') return 'mobil_uygulama';
  if (value === 'hosting' || value === 'Hosting') return 'hosting';
  return 'diger';
}

function normalizeStatus(value: string | null): SubscriptionStatus {
  if (value === 'paused' || value === 'Duraklatıldı') return 'paused';
  if (value === 'cancelled' || value === 'İptal edildi') return 'cancelled';
  return 'active';
}

function parseDayKey(value: string): { year: number; month: number; day: number; dayNumber: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, dayNumber: Math.floor(date.getTime() / 86_400_000) };
}

function dayKeyFromNumber(dayNumber: number): string {
  const date = new Date(dayNumber * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function monthIndex(dayKey: string): number | null {
  const parsed = parseDayKey(dayKey);
  return parsed == null ? null : parsed.year * 12 + parsed.month - 1;
}

function billDate(startDate: string, intervalMonths: number, occurrence: number): string | null {
  const parsed = parseDayKey(startDate);
  if (parsed == null) return null;
  const targetMonthIndex = parsed.year * 12 + parsed.month - 1 + intervalMonths * occurrence;
  const year = Math.floor(targetMonthIndex / 12);
  const month = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(parsed.day, lastDay)).padStart(2, '0')}`;
}

export function getBillingInterval(startDate: string, endDate: string): BillingInterval | null {
  const start = parseDayKey(startDate);
  const end = parseDayKey(endDate);
  if (start == null || end == null || end.dayNumber < start.dayNumber) return null;

  const elapsedDays = end.dayNumber - start.dayNumber;
  const monthsApart = (end.year - start.year) * 12 + end.month - start.month;
  if (monthsApart > 0 && billDate(startDate, monthsApart, 1) === endDate) {
    const label = monthsApart % 12 === 0
      ? `${monthsApart / 12} yıl`
      : `${monthsApart} ay`;
    return { kind: 'months', amount: monthsApart, days: elapsedDays, label };
  }

  const days = Math.max(1, elapsedDays);
  const label = days === 7 ? '1 hafta' : `${days} gün`;
  return { kind: 'days', amount: days, days, label };
}

export function durationLabel(startDate: string, endDate: string): string {
  return getBillingInterval(startDate, endDate)?.label ?? 'Süre için tarihleri gir';
}

export function toSubscription(node: GenesisNode): SubscriptionRecord {
  const startDate = getDayKey(getFieldValue(node, 'Başlangıç tarihi', '@strt1'));
  const endDate = getDayKey(getFieldValue(node, 'Bitiş tarihi', '@endd2'));
  return {
    id: node.id,
    name: getTitle(node, 'Abonelik adı', '@sN4me') ?? 'Adsız abonelik',
    category: normalizeCategory(getFieldValue(node, 'Hizmet Türü', '@tYp3x')),
    startDate,
    endDate,
    status: normalizeStatus(getFieldValue(node, 'Durum', '@stat5')),
    duration: getBillingInterval(startDate, endDate)?.label ?? '',
    planType: getFieldValue(node, 'Abonelik Türü', '@plan9')?.trim() ?? '',
    providerCompany: getFieldValue(node, 'Sağlayıcı Firma', '@1c4ce')?.trim() ?? '',
    fee: getFieldNumber(node, 'Abonelik Ücreti', '@prc01'),
    currency: getFieldValue(node, 'Para Birimi', '@cur01')?.trim().toUpperCase() ?? '',
  };
}

export function isCurrencyCode(value: string): boolean {
  if (!/^[A-Za-z]{3}$/.test(value.trim())) return false;
  try {
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: value.trim().toUpperCase() });
    return true;
  } catch {
    return false;
  }
}

export function formatMoney(amount: number, currency: string): string {
  if (isCurrencyCode(currency)) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(amount)} ${currency}`.trim();
}

export function isCostComplete(item: SubscriptionRecord): boolean {
  return item.fee != null && item.fee >= 0 && getBillingInterval(item.startDate, item.endDate) != null &&
    (item.fee === 0 || isCurrencyCode(item.currency));
}

export function isForecastable(item: SubscriptionRecord): boolean {
  return isCostComplete(item) && item.fee != null && item.fee > 0 &&
    item.startDate !== '' && item.endDate !== '' && item.endDate >= item.startDate;
}

export function getMonthlyEquivalent(item: SubscriptionRecord): number | null {
  const interval = getBillingInterval(item.startDate, item.endDate);
  if (item.fee == null || interval == null) return null;
  return interval.kind === 'months'
    ? item.fee / interval.amount
    : item.fee * 365.2425 / 12 / interval.days;
}

function nextBillingDate(startDate: string, interval: BillingInterval, occurrence: number): string | null {
  if (interval.kind === 'months') return billDate(startDate, interval.amount, occurrence);
  const start = parseDayKey(startDate);
  return start == null ? null : dayKeyFromNumber(start.dayNumber + interval.amount * occurrence);
}

export function getRenewalsForYear(items: SubscriptionRecord[], year: number): RenewalEvent[] {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const yearStartMonth = monthIndex(yearStart);
  const yearEndMonth = monthIndex(yearEnd);
  if (yearStartMonth == null || yearEndMonth == null) return [];

  return items.flatMap((item) => {
    if (item.status !== 'active' || !isForecastable(item) || item.fee == null) return [];
    const interval = getBillingInterval(item.startDate, item.endDate);
    const startMonth = monthIndex(item.startDate);
    if (interval == null || startMonth == null || item.startDate >= yearEnd) return [];

    let firstOccurrence = 0;
    if (interval.kind === 'months' && startMonth < yearStartMonth) {
      firstOccurrence = Math.max(0, Math.floor((yearStartMonth - startMonth) / interval.amount) - 1);
    } else if (interval.kind === 'days') {
      const start = parseDayKey(item.startDate);
      const target = parseDayKey(yearStart);
      if (start != null && target != null && start.dayNumber < target.dayNumber) {
        firstOccurrence = Math.max(0, Math.floor((target.dayNumber - start.dayNumber) / interval.days) - 1);
      }
    }

    const events: RenewalEvent[] = [];
    for (let occurrence = firstOccurrence; occurrence < 5000; occurrence += 1) {
      const dueDate = nextBillingDate(item.startDate, interval, occurrence);
      if (dueDate == null || dueDate >= yearEnd) break;
      if (dueDate >= yearStart) {
        events.push({ id: item.id, name: item.name, category: item.category, dueDate, amount: item.fee, currency: item.currency });
      }
    }
    return events;
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, 'tr-TR'));
}

export function groupAmountsByCurrency(items: { amount: number; currency: string }[]): Record<string, number> {
  return items.reduce<Record<string, number>>((totals, item) => {
    totals[item.currency] = (totals[item.currency] ?? 0) + item.amount;
    return totals;
  }, {});
}

export function categoryLabel(category: SubscriptionCategory): string {
  return CATEGORY_LABELS[category];
}

export function statusLabel(status: SubscriptionStatus): string {
  return STATUS_LABELS[status];
}
