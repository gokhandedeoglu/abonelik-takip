import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { useLiveNodes } from '@/hooks/use-live-nodes';
import { CATEGORY_OPTIONS, getIstanbulToday, PROJECT_ID, formatSubscriptionDate } from '@/lib/subscriptions';
import {
  formatMoney,
  getBillingInterval,
  getMonthlyEquivalent,
  getRenewalsForYear,
  groupAmountsByCurrency,
  isCostComplete,
  isCurrencyCode,
  toSubscription,
} from '@/lib/subscription-costs';
import { findRenewalConversion, FX_PROJECT_ID, getLatestRateDate, parseTcmbRateSnapshots } from '@/lib/tcmb-rates';
import { RefreshCw } from '@/lib/icons';

const MONTHS = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2026, index, 1));
  const label = new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(date);
  return { value: index + 1, label: label.charAt(0).toLocaleUpperCase('tr-TR') + label.slice(1) };
});

function CurrencyTotals({ totals, emptyLabel }: { totals: Record<string, number>; emptyLabel: string }) {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {entries.map(([currency, amount]) => (
        <li key={currency} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{currency}</span>
          <span className="font-semibold tabular-nums text-foreground">{formatMoney(amount, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function TryTotal({ amount, missing, converted, rateDate, label }: {
  amount: number;
  missing: number;
  converted: number;
  rateDate: string | null;
  label: string;
}) {
  const value = missing > 0 && converted === 0
    ? `Kur bekleniyor (${missing} kalem)`
    : `${formatMoney(amount, 'TRY')}${missing > 0 ? ` · ${missing} kur eksik` : ''}`;
  return (
    <div className="mt-4 border-t pt-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">TRY karşılığı</span>
        <span className="text-right font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {label}{rateDate ? ` · Güncel kur referansı: ${formatSubscriptionDate(rateDate)}` : ''}
      </p>
    </div>
  );
}

function summarizeTryConversions(conversions: ReturnType<typeof findRenewalConversion>[]) {
  return conversions.reduce((total, conversion) => {
    if (conversion.amountTry == null) total.missing += 1;
    else {
      total.amount += conversion.amountTry;
      total.converted += 1;
    }
    return total;
  }, { amount: 0, missing: 0, converted: 0 });
}

function CategoryBreakdownValue({ totals, tryTotal }: {
  totals: Record<string, number>;
  tryTotal: { amount: number; missing: number; converted: number };
}) {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0 && tryTotal.missing === 0 && tryTotal.converted === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const tryValue = tryTotal.missing > 0 && tryTotal.converted === 0
    ? `Kur bekleniyor (${tryTotal.missing})`
    : `${formatMoney(tryTotal.amount, 'TRY')}${tryTotal.missing > 0 ? ` · ${tryTotal.missing} kur eksik` : ''}`;
  return (
    <div className="min-w-32 space-y-1">
      {entries.map(([currency, amount]) => (
        <div key={currency} className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">{currency}</span>
          <span className="text-right tabular-nums">{formatMoney(amount, currency)}</span>
        </div>
      ))}
      <p className="border-t pt-1 text-xs font-medium tabular-nums">TRY {tryValue}</p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Rapor hazırlanıyor">
      {[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl border bg-card" />)}
    </div>
  );
}

export default function ReportsPage() {
  const { nodes, loading, error, updatedAt, refresh } = useLiveNodes(PROJECT_ID);
  const { nodes: fxNodes, loading: fxLoading, error: fxError, updatedAt: fxUpdatedAt, refresh: refreshFx } = useLiveNodes(FX_PROJECT_ID);
  const today = getIstanbulToday();
  const [yearInput, setYearInput] = useState(today.slice(0, 4));
  const parsedYear = Number(yearInput);
  const year = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100
    ? parsedYear
    : Number(today.slice(0, 4));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));

  useEffect(() => {
    document.title = 'Maliyet Raporları | Abonelik Takipçisi';
    document.documentElement.lang = 'tr';
    document.documentElement.dir = 'ltr';
  }, []);

  const subscriptions = useMemo(() => nodes.map(toSubscription), [nodes]);
  const snapshots = useMemo(() => parseTcmbRateSnapshots(fxNodes), [fxNodes]);
  const latestRateDate = getLatestRateDate(snapshots);
  const active = useMemo(() => subscriptions.filter((item) => item.status === 'active'), [subscriptions]);
  const complete = useMemo(() => active.filter(isCostComplete), [active]);
  const missingCosts = active.filter((item) => item.fee == null || item.fee < 0 || (item.fee > 0 && !isCurrencyCode(item.currency))).length;
  const missingDates = active.filter((item) => getBillingInterval(item.startDate, item.endDate) == null).length;

  const monthlyTotals = useMemo(() => groupAmountsByCurrency(
    complete.flatMap((item) => {
      const amount = getMonthlyEquivalent(item);
      return amount == null || item.fee === 0 || !item.currency ? [] : [{ amount, currency: item.currency }];
    }),
  ), [complete]);
  const monthlyTry = useMemo(() => {
    let amount = 0;
    let missing = 0;
    let converted = 0;
    complete.forEach((item) => {
      const equivalent = getMonthlyEquivalent(item);
      if (equivalent == null || item.fee === 0 || !item.currency) return;
      const conversion = findRenewalConversion(equivalent, item.currency, today, today, snapshots);
      if (conversion.amountTry == null) missing += 1;
      else { amount += conversion.amountTry; converted += 1; }
    });
    return { amount, missing, converted };
  }, [complete, snapshots, today]);
  const annualizedTotals = useMemo(() => Object.fromEntries(
    Object.entries(monthlyTotals).map(([currency, amount]) => [currency, amount * 12]),
  ), [monthlyTotals]);
  const annualizedTry = { amount: monthlyTry.amount * 12, missing: monthlyTry.missing, converted: monthlyTry.converted };

  const renewals = useMemo(() => getRenewalsForYear(subscriptions, year), [subscriptions, year]);
  const renewalRows = useMemo(() => renewals.map((event) => ({
    ...event,
    conversion: findRenewalConversion(event.amount, event.currency, event.dueDate, today, snapshots),
  })), [renewals, snapshots, today]);
  const yearTotals = useMemo(() => groupAmountsByCurrency(renewals), [renewals]);
  const yearTry = useMemo(() => renewalRows.reduce((totals, event) => {
    if (event.conversion.amountTry == null) totals.missing += 1;
    else { totals.amount += event.conversion.amountTry; totals.converted += 1; }
    return totals;
  }, { amount: 0, missing: 0, converted: 0 }), [renewalRows]);
  const currencies = useMemo(() => Array.from(new Set([
    ...Object.keys(monthlyTotals),
    ...Object.keys(yearTotals),
  ])).sort((a, b) => a.localeCompare(b)), [monthlyTotals, yearTotals]);
  const monthlyRows = useMemo(() => MONTHS.map((item) => {
    const events = renewalRows.filter((event) => Number(event.dueDate.slice(5, 7)) === item.value);
    const totals = groupAmountsByCurrency(events);
    const tryTotal = events.reduce((result, event) => {
      if (event.conversion.amountTry == null) result.missing += 1;
      else { result.amount += event.conversion.amountTry; result.converted += 1; }
      return result;
    }, { amount: 0, missing: 0, converted: 0 });
    return { ...item, totals, count: events.length, tryTotal };
  }), [renewalRows]);
  const selectedMonth = monthlyRows.find((item) => item.value === month) ?? monthlyRows[0];
  const selectedMonthEvents = renewalRows.filter((event) => Number(event.dueDate.slice(5, 7)) === month);
  const selectedMonthTotals = selectedMonth?.totals ?? {};
  const categoryBreakdown = useMemo(() => CATEGORY_OPTIONS.map(({ value, label }) => {
    const categoryItems = complete.filter((item) => item.category === value);
    const monthlyItems = categoryItems.flatMap((item) => {
      const amount = getMonthlyEquivalent(item);
      return amount == null || item.fee === 0 || !item.currency ? [] : [{ amount, currency: item.currency }];
    });
    const monthlyTry = summarizeTryConversions(categoryItems.flatMap((item) => {
      const amount = getMonthlyEquivalent(item);
      if (amount == null || item.fee === 0 || !item.currency) return [];
      return [findRenewalConversion(amount, item.currency, today, today, snapshots)];
    }));
    const yearEvents = renewalRows.filter((event) => event.category === value);
    const monthEvents = selectedMonthEvents.filter((event) => event.category === value);
    return {
      category: value,
      label,
      monthlyTotals: groupAmountsByCurrency(monthlyItems),
      monthlyTry,
      annualizedTotals: Object.fromEntries(Object.entries(groupAmountsByCurrency(monthlyItems)).map(([currency, amount]) => [currency, amount * 12])),
      annualizedTry: { ...monthlyTry, amount: monthlyTry.amount * 12 },
      yearTotals: groupAmountsByCurrency(yearEvents),
      yearTry: summarizeTryConversions(yearEvents.map((event) => event.conversion)),
      monthTotals: groupAmountsByCurrency(monthEvents),
      monthTry: summarizeTryConversions(monthEvents.map((event) => event.conversion)),
    };
  }), [complete, renewalRows, selectedMonthEvents, today, snapshots]);
  const freeCount = complete.filter((item) => item.fee === 0).length;
  const hasForeignCurrency = active.some((item) => item.fee != null && item.fee > 0 && item.currency !== 'TRY');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Harcamalara net bakış</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Maliyet raporları</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Aylık karşılığı, yıllıklandırılmış maliyeti ve seçtiğin takvim yılındaki yenilemeleri para birimine göre ayrı gör.
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-card px-3">
            <span className="text-sm text-muted-foreground">Rapor yılı</span>
            <input aria-label="Rapor yılı" type="number" min="1900" max="2100" value={yearInput} onChange={(event) => setYearInput(event.target.value)} className="w-24 rounded-sm bg-transparent text-right text-base font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        </section>

        {error && updatedAt == null ? (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <p className="font-medium">Rapor verileri yüklenemedi.</p>
            <p className="mt-1 text-sm text-muted-foreground">Bağlantıyı kontrol edip yeniden deneyebilirsin.</p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => void refresh()}><RefreshCw className="size-4" /> Yeniden dene</Button>
          </div>
        ) : loading && updatedAt == null ? (
          <ReportSkeleton />
        ) : subscriptions.length === 0 ? (
          <section className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <h2 className="text-lg font-semibold">Önce bir abonelik ekle</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Ücret, başlangıç ve bitiş tarihleri ile para birimi bilgileri eklendikçe maliyet raporları burada oluşur.</p>
            <Button asChild className="mt-5 min-h-11"><Link to="/abonelikler">Abonelikleri aç</Link></Button>
          </section>
        ) : (
          <>
            {missingCosts > 0 || missingDates > 0 ? (
              <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-sm leading-6">
                  {missingCosts > 0 ? <><span className="font-semibold">{missingCosts} aktif abonelikte</span> ücret veya para birimi bilgisi eksik. </> : null}
                  {missingDates > 0 ? <><span className="font-semibold">{missingDates} aktif abonelikte</span> tarih aralığı eksik veya geçersiz. </> : null}
                  Bu kayıtlar ilgili maliyet toplamlarına dahil edilmedi.
                </p>
                <Button asChild variant="outline" className="min-h-11 shrink-0"><Link to="/abonelikler">Eksikleri tamamla</Link></Button>
              </div>
            ) : null}

            {hasForeignCurrency && (snapshots.length === 0 || (fxError && fxUpdatedAt == null)) ? (
              <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-sm leading-6">
                  {fxError && fxUpdatedAt == null
                    ? 'TCMB kur arşivi okunamadı. Kaynak para birimi raporları çalışır, TRY karşılıkları kur verisi gelene kadar gösterilemez.'
                    : 'TCMB kur arşivinde henüz yayımlanmış bir kayıt yok. Kaynak para birimi raporları çalışır; TRY karşılıkları kur arşivi dolduğunda görünür.'}
                </p>
                <Button variant="outline" className="min-h-11 shrink-0" onClick={() => void refreshFx()} disabled={fxLoading}>
                  <RefreshCw className="size-4" /> Kur arşivini yenile
                </Button>
              </div>
            ) : null}

            <section aria-label="Maliyet özeti" className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <article className="rounded-2xl border bg-card p-5 sm:p-6">
                <p className="text-sm font-medium text-muted-foreground">Aylık karşılık</p>
                <CurrencyTotals totals={monthlyTotals} emptyLabel={freeCount > 0 ? 'Yalnızca ücretsiz kayıtlar.' : 'Tamamlanmış ücret bilgisi yok.'} />
                <TryTotal amount={monthlyTry.amount} missing={monthlyTry.missing} converted={monthlyTry.converted} rateDate={latestRateDate} label="En son yayımlanmış kur referansı" />
                <p className="mt-3 text-xs leading-5 text-muted-foreground">Ücret, başlangıç ve bitiş tarihleri arasındaki süreye göre aylıklandırılır.</p>
              </article>
              <article className="rounded-2xl border bg-card p-5 sm:p-6">
                <p className="text-sm font-medium text-muted-foreground">Yıllıklandırılmış maliyet</p>
                <CurrencyTotals totals={annualizedTotals} emptyLabel={freeCount > 0 ? 'Yalnızca ücretsiz kayıtlar.' : 'Tamamlanmış ücret bilgisi yok.'} />
                <TryTotal amount={annualizedTry.amount} missing={annualizedTry.missing} converted={annualizedTry.converted} rateDate={latestRateDate} label="En son yayımlanmış kur referansı" />
                <p className="mt-3 text-xs leading-5 text-muted-foreground">Aylık karşılık × 12, aktif abonelikler üzerinden.</p>
              </article>
              <article className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
                <p className="text-sm font-medium text-muted-foreground">{year} takvim yılı</p>
                <CurrencyTotals totals={yearTotals} emptyLabel="Bu yıl için hesaplanabilir yenileme yok." />
                <TryTotal amount={yearTry.amount} missing={yearTry.missing} converted={yearTry.converted} rateDate={null} label="Geçmişte o günün son yayını, gelecekte en son yayın kullanılır" />
                <p className="mt-3 text-xs leading-5 text-muted-foreground">Aktif abonelikler için tahmini yenileme toplamı.</p>
              </article>
            </section>

            <section aria-labelledby="category-report-title" className="space-y-4">
              <div>
                <h2 id="category-report-title" className="text-xl font-semibold tracking-tight">Hizmet Türü bazında maliyet</h2>
                <p className="mt-1 text-sm text-muted-foreground">Aylık ve yıllık karşılıklarla, seçili yıl ve ayın tahmini yenilemelerini hizmet türlerine göre karşılaştır.</p>
              </div>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Hizmet Türü</th>
                      <th scope="col" className="px-4 py-3 font-medium">Aylık karşılık</th>
                      <th scope="col" className="px-4 py-3 font-medium">Yıllıklandırılmış</th>
                      <th scope="col" className="px-4 py-3 font-medium">{year} yenilemeleri</th>
                      <th scope="col" className="px-4 py-3 font-medium">{selectedMonth?.label} yenilemeleri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryBreakdown.map((category) => (
                      <tr key={category.category} className="border-t align-top">
                        <th scope="row" className="whitespace-nowrap px-4 py-4 font-medium">{category.label}</th>
                        <td className="px-4 py-3"><CategoryBreakdownValue totals={category.monthlyTotals} tryTotal={category.monthlyTry} /></td>
                        <td className="px-4 py-3"><CategoryBreakdownValue totals={category.annualizedTotals} tryTotal={category.annualizedTry} /></td>
                        <td className="px-4 py-3"><CategoryBreakdownValue totals={category.yearTotals} tryTotal={category.yearTry} /></td>
                        <td className="px-4 py-3"><CategoryBreakdownValue totals={category.monthTotals} tryTotal={category.monthTry} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">Kaynak para birimleri ayrı toplanır; TRY tutarları mevcut TCMB kur ve tahmin kuralını izler. Aylık/yıllık karşılık yalnızca hesaplanabilir aktif aboneliklerden, yenileme toplamları ise seçili dönemde beklenen ödemelerden oluşur.</p>
            </section>

            <section aria-labelledby="year-report-title" className="space-y-4">
              <div>
                <h2 id="year-report-title" className="text-xl font-semibold tracking-tight">{year} yılı, aylara göre</h2>
                <p className="mt-1 text-sm text-muted-foreground">Her yenileme, beklenen tarihine göre gruplanır; TRY sütunu ilgili tarihin kur kuralını izler.</p>
              </div>
              {currencies.length === 0 ? (
                <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Bu yıl için para birimi ve ücret bilgisi olan bir yenileme bulunmuyor.</div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border bg-card">
                  <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">Ay</th>
                        {currencies.map((currency) => <th scope="col" key={currency} className="px-4 py-3 text-right font-medium">{currency}</th>)}
                        <th scope="col" className="px-4 py-3 text-right font-medium">TRY karşılığı</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Yenileme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyRows.map((row) => (
                        <tr key={row.value} className="border-t">
                          <th scope="row" className="px-4 py-3 font-medium">{row.label}</th>
                          {currencies.map((currency) => <td key={currency} className="px-4 py-3 text-right tabular-nums">{formatMoney(row.totals[currency] ?? 0, currency)}</td>)}
                          <td className="px-4 py-3 text-right tabular-nums">{row.tryTotal.missing > 0 && row.tryTotal.converted === 0 ? 'Kur bekleniyor' : `${formatMoney(row.tryTotal.amount, 'TRY')}${row.tryTotal.missing > 0 ? ' · eksik kur' : ''}`}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/30 font-semibold">
                      <tr>
                        <th scope="row" className="px-4 py-3">Yıl toplamı</th>
                        {currencies.map((currency) => <td key={currency} className="px-4 py-3 text-right tabular-nums">{formatMoney(yearTotals[currency] ?? 0, currency)}</td>)}
                        <td className="px-4 py-3 text-right tabular-nums">{yearTry.missing > 0 && yearTry.converted === 0 ? 'Kur bekleniyor' : `${formatMoney(yearTry.amount, 'TRY')}${yearTry.missing > 0 ? ' · eksik kur' : ''}`}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{renewals.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="month-detail-title" className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 id="month-detail-title" className="text-xl font-semibold tracking-tight">Aylık yenileme ayrıntısı</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Seçili aydaki beklenen ödemeler ve kullanılan TCMB yayın tarihi.</p>
                </div>
                <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-card px-3">
                  <span className="text-sm text-muted-foreground">Ay</span>
                  <select aria-label="Rapor ayı" value={month} onChange={(event) => setMonth(Number(event.target.value))} className="min-h-10 bg-transparent text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {MONTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>
              <article className="rounded-2xl border bg-card p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">{selectedMonth?.label} {year} tahmini</p>
                    <p className="mt-1 text-xs text-muted-foreground">Kaynak para birimleri ayrı tutulur.</p>
                  </div>
                  <div className="w-full max-w-sm">
                    <CurrencyTotals totals={selectedMonthTotals} emptyLabel="Bu ay beklenen yenileme yok." />
                    <TryTotal amount={selectedMonth?.tryTotal.amount ?? 0} missing={selectedMonth?.tryTotal.missing ?? 0} converted={selectedMonth?.tryTotal.converted ?? 0} rateDate={null} label="Kur, her yenileme tarihine göre seçilir" />
                  </div>
                </div>
                {selectedMonthEvents.length > 0 ? (
                  <div className="mt-5 overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[42rem] text-left text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr><th scope="col" className="px-4 py-3 font-medium">Abonelik</th><th scope="col" className="px-4 py-3 font-medium">Yenileme tarihi</th><th scope="col" className="px-4 py-3 text-right font-medium">Tutar</th><th scope="col" className="px-4 py-3 text-right font-medium">TRY karşılığı</th><th scope="col" className="px-4 py-3 text-right font-medium">Kur bilgisi</th></tr>
                      </thead>
                      <tbody>
                        {selectedMonthEvents.map((event, index) => (
                          <tr key={`${event.id}-${event.dueDate}-${index}`} className="border-t">
                            <th scope="row" className="max-w-64 truncate px-4 py-3 font-medium">{event.name}</th>
                            <td className="px-4 py-3 text-muted-foreground">{formatSubscriptionDate(event.dueDate)}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoney(event.amount, event.currency)}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">{event.conversion.amountTry == null ? 'Kur bekleniyor' : formatMoney(event.conversion.amountTry, 'TRY')}</td>
                            <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                              {event.conversion.estimated ? 'Tahmin' : event.conversion.rateDate ? formatSubscriptionDate(event.conversion.rateDate) : 'TRY'}
                              {event.conversion.estimated && event.conversion.rateDate ? ` · kur ${formatSubscriptionDate(event.conversion.rateDate)}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            </section>

            <p className="rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
              Raporlar gerçek ödeme geçmişi değildir. Abonelikler aktif kaldığı varsayımıyla başlangıç-bitiş aralığı tekrar eden yenileme sıklığı olarak kullanılır. Geçmiş yenilemelerde o gün için yayımlanmış son TCMB kuru, gelecek yenilemelerde arşivdeki en son yayımlanmış kur kullanılır ve tahmin olarak işaretlenir. TCMB arşivi henüz boşsa TRY karşılıkları gösterilmez.
            </p>
          </>
        )}

        {error && updatedAt != null ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Son yenileme tamamlanmadı. Gösterilen kayıtlar son başarılı okumadan geldi.
            <Button variant="link" className="min-h-11 px-1" onClick={() => void refresh()}>Şimdi yenile</Button>
          </p>
        ) : null}
        {fxError && fxUpdatedAt != null ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            TCMB arşivinin son yenilemesi tamamlanmadı.
            <Button variant="link" className="min-h-11 px-1" onClick={() => void refreshFx()}>Kur arşivini yeniden dene</Button>
          </p>
        ) : null}
      </main>
    </div>
  );
}
