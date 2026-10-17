import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { useLiveNodes } from '@/hooks/use-live-nodes';
import { getDaysUntil, getIstanbulToday, CATEGORY_LABELS, CATEGORY_OPTIONS, formatSubscriptionDate, PROJECT_ID } from '@/lib/subscriptions';
import { formatMoney, getMonthlyEquivalent, groupAmountsByCurrency, isCostComplete, toSubscription } from '@/lib/subscription-costs';
import { findRenewalConversion, FX_PROJECT_ID, getLatestRateDate, parseTcmbRateSnapshots } from '@/lib/tcmb-rates';
import { ArrowRight, CalendarDays, Clock3, RefreshCw } from '@/lib/icons';

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-label="Özet yükleniyor">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border bg-card" />)}
      </div>
      <div className="h-56 animate-pulse rounded-2xl border bg-card" />
    </div>
  );
}

function CurrencyList({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className="mt-2 text-sm text-muted-foreground">Ücretli aktif kayıt yok</p>;
  return (
    <ul className="mt-3 space-y-1.5">
      {entries.map(([currency, amount]) => (
        <li key={currency} className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-xs text-muted-foreground">{currency}</span>
          <span className="font-medium tabular-nums">{formatMoney(amount, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function TryAmount({ amount, missing, converted }: { amount: number; missing: number; converted: number }) {
  if (missing > 0 && converted === 0) return <span>Kur bekleniyor ({missing})</span>;
  return <span>{formatMoney(amount, 'TRY')}{missing > 0 ? ` · ${missing} kur eksik` : ''}</span>;
}

export default function DashboardPage() {
  const { nodes, loading, error, updatedAt, refresh } = useLiveNodes(PROJECT_ID);
  const { nodes: fxNodes } = useLiveNodes(FX_PROJECT_ID);
  const today = getIstanbulToday();

  useEffect(() => {
    document.title = 'Ana sayfa | Abonelik Takipçisi';
    document.documentElement.lang = 'tr';
    document.documentElement.dir = 'ltr';
  }, []);

  const subscriptions = useMemo(() => nodes.map(toSubscription), [nodes]);
  const snapshots = useMemo(() => parseTcmbRateSnapshots(fxNodes), [fxNodes]);
  const latestRateDate = getLatestRateDate(snapshots);
  const categorySummaries = useMemo(() => CATEGORY_OPTIONS.map(({ value, label }) => {
    const items = subscriptions.filter((item) => item.category === value);
    const active = items.filter((item) => item.status === 'active');
    const complete = active.filter(isCostComplete);
    const sourceTotals = groupAmountsByCurrency(complete.flatMap((item) => {
      if (item.fee == null || item.fee <= 0 || !item.currency) return [];
      const monthly = getMonthlyEquivalent(item);
      return monthly == null ? [] : [{ amount: monthly, currency: item.currency }];
    }));
    const tryTotal = complete.reduce((result, item) => {
      if (item.fee == null || item.fee <= 0 || !item.currency) return result;
      const monthly = getMonthlyEquivalent(item);
      if (monthly == null) return result;
      const conversion = findRenewalConversion(monthly, item.currency, today, today, snapshots);
      if (conversion.amountTry == null) result.missing += 1;
      else { result.amount += conversion.amountTry; result.converted += 1; }
      return result;
    }, { amount: 0, missing: 0, converted: 0 });
    const hasForeignCurrency = Object.keys(sourceTotals).some((currency) => currency !== 'TRY');
    return { category: value, label, count: items.length, activeCount: active.length, sourceTotals, tryTotal, hasForeignCurrency };
  }), [subscriptions, today, snapshots]);

  const monthLabel = new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(new Date());
  const monthKey = today.slice(0, 7);
  const upcoming = useMemo(() => subscriptions
    .filter((item) => item.status === 'active' && item.endDate >= today && item.endDate.slice(0, 7) === monthKey)
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name, 'tr-TR')),
  [subscriptions, today, monthKey]);
  const hasForeignCurrency = subscriptions.some((item) => item.status === 'active' && item.fee != null && item.fee > 0 && item.currency !== 'TRY');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Abonelik görünümü · {monthLabel}</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dijital üyeliklerin, tek bakışta.</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Hizmet türlerine göre kayıt sayını ve aylık maliyetini gör; bu ay bitecek üyelikleri gözden kaçırma.
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-11 shrink-0">
            <Link to="/abonelikler">Abonelikleri yönet <ArrowRight className="size-4" /></Link>
          </Button>
        </section>

        {error && updatedAt == null ? (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <p className="font-medium">Abonelik özeti yüklenemedi.</p>
            <p className="mt-1 text-sm text-muted-foreground">Bağlantıyı kontrol edip yeniden deneyebilirsin.</p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => void refresh()}><RefreshCw className="size-4" /> Yeniden dene</Button>
          </div>
        ) : loading && updatedAt == null ? (
          <DashboardSkeleton />
        ) : subscriptions.length === 0 ? (
          <section className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden><CalendarDays className="size-6" /></span>
            <h2 className="mt-4 text-lg font-semibold">İlk aboneliğini ekle</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Hizmetlerini kaydettiğinde hizmet türü özeti ve bitiş takvimi burada oluşur.</p>
            <Button asChild className="mt-5 min-h-11"><Link to="/abonelikler">Abonelik ekle</Link></Button>
          </section>
        ) : (
          <>
            <section aria-labelledby="category-cards-title" className="space-y-4">
              <div>
                <h2 id="category-cards-title" className="text-xl font-semibold tracking-tight">Hizmet türleri</h2>
                <p className="mt-1 text-sm text-muted-foreground">Sayı tüm kayıtları, maliyet ise ücret bilgisi tamam olan aktif abonelikleri kapsar.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {categorySummaries.map((summary) => (
                  <article key={summary.category} className="flex min-h-44 flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words font-medium">{summary.label}</h3>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden><CalendarDays className="size-4" /></span>
                    </div>
                    <p className="mt-3 text-3xl font-semibold tabular-nums">{summary.count}</p>
                    <p className="text-xs text-muted-foreground">abonelik · {summary.activeCount} aktif</p>
                    <div className="mt-auto border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">Aylık karşılık</p>
                      <CurrencyList totals={summary.sourceTotals} />
                      {summary.hasForeignCurrency && (summary.tryTotal.converted > 0 || summary.tryTotal.missing > 0) ? (
                        <p className="mt-2 flex items-baseline justify-between gap-2 border-t pt-2 text-sm">
                          <span className="text-xs text-muted-foreground">TRY karşılığı</span>
                          <span className="text-right font-semibold tabular-nums"><TryAmount {...summary.tryTotal} /></span>
                        </p>
                      ) : null}
                      {summary.hasForeignCurrency && summary.tryTotal.converted === 0 && summary.tryTotal.missing === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">TRY kuru arşivde yok</p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              {latestRateDate && hasForeignCurrency ? <p className="text-xs text-muted-foreground">TRY karşılığı için son kur referansı: {formatSubscriptionDate(latestRateDate)}.</p> : null}
            </section>

            <section aria-labelledby="upcoming-title" className="space-y-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Bitiş takibi</p>
                  <h2 id="upcoming-title" className="mt-1 text-xl font-semibold tracking-tight">Bu ay bitişi yaklaşanlar</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{monthLabel} içindeki aktif abonelikler, bitiş tarihine göre.</p>
                </div>
                <span className="inline-flex min-h-9 items-center gap-2 self-start rounded-full bg-primary/10 px-3 text-sm font-medium text-primary sm:self-auto">
                  <Clock3 className="size-4" aria-hidden /> {upcoming.length} kayıt
                </span>
              </div>
              {upcoming.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-card/60 p-6 text-sm text-muted-foreground">Bu ay sonuna kadar bitiş tarihi olan aktif abonelik görünmüyor.</div>
              ) : (
                <div className="overflow-hidden rounded-2xl border bg-card">
                  {upcoming.map((item, index) => {
                    const daysLeft = getDaysUntil(item.endDate, today);
                    return (
                      <article key={item.id} className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${index > 0 ? 'border-t' : ''}`}>
                        <div className="min-w-0">
                          <h3 className="break-words font-medium">{item.name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABELS[item.category]} · {item.duration || 'Süre belirtilmemiş'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-sm">
                          <span className="text-muted-foreground">{formatSubscriptionDate(item.endDate)}</span>
                          <span className="min-w-20 rounded-full bg-amber-500/10 px-3 py-1.5 text-center text-xs font-medium text-amber-800 dark:text-amber-300">
                            {daysLeft === 0 ? 'Bugün' : `${daysLeft ?? 0} gün kaldı`}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {error && updatedAt != null ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Son yenileme tamamlanmadı. Gösterilen kayıtlar son başarılı okumadan geldi.
            <Button variant="link" className="min-h-11 px-1" onClick={() => void refresh()}>Şimdi yenile</Button>
          </p>
        ) : null}
      </main>
    </div>
  );
}
