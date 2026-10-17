export const PROJECT_ID = 'jn59xRvo13UJUeW5';

export type SubscriptionCategory = 'ai' | 'egitim' | 'domain' | 'egitim_sitesi' | 'eglence' | 'mobil_uygulama' | 'hosting' | 'diger';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export const CATEGORY_OPTIONS: { value: SubscriptionCategory; label: string }[] = [
  { value: 'ai', label: 'Süper Zeka' },
  { value: 'egitim', label: 'Online eğitim' },
  { value: 'domain', label: 'Domain' },
  { value: 'egitim_sitesi', label: 'Eğitim sitesi' },
  { value: 'eglence', label: 'Eğlence' },
  { value: 'mobil_uygulama', label: 'Mobil Uygulama' },
  { value: 'hosting', label: 'Hosting' },
  { value: 'diger', label: 'Diğer' },
];

export const CATEGORY_LABELS: Record<SubscriptionCategory, string> = {
  ai: 'Süper Zeka',
  egitim: 'Online eğitim',
  domain: 'Domain',
  egitim_sitesi: 'Eğitim sitesi',
  eglence: 'Eğlence',
  mobil_uygulama: 'Mobil Uygulama',
  hosting: 'Hosting',
  diger: 'Diğer',
};

export const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'active', label: 'Aktif' },
  { value: 'paused', label: 'Duraklatıldı' },
  { value: 'cancelled', label: 'İptal edildi' },
];

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  cancelled: 'İptal edildi',
};

export function getDayKey(value: string | null): string {
  if (value == null) return '';
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

export function getIstanbulToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toDayNumber(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000);
}

export function getDaysUntil(date: string, today: string): number | null {
  const targetDay = toDayNumber(date);
  const todayDay = toDayNumber(today);
  return targetDay == null || todayDay == null ? null : targetDay - todayDay;
}

export function formatSubscriptionDate(value: string): string {
  const dayKey = getDayKey(value);
  const dayNumber = toDayNumber(dayKey);
  if (dayNumber == null) return 'Tarih eklenmedi';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(dayNumber * 86_400_000 + 43_200_000));
}
