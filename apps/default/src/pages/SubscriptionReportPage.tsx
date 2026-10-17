import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { useLiveNodes } from '@/hooks/use-live-nodes';
import { CATEGORY_OPTIONS, PROJECT_ID } from '@/lib/subscriptions';
import { getBillingInterval, toSubscription } from '@/lib/subscription-costs';
import { RefreshCw } from '@/lib/icons';

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-label="Abonelik raporu yükleniyor">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border bg-card" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border bg-card" />
    </div>
  );
}

export default function SubscriptionReportPage() {
  const { nodes, loading, error, updatedAt, refresh } = useLiveNodes(PROJECT_ID);

  useEffect(() => {
    document.title = 'Abonelik Raporu | Abonelik Takipçisi';
    document.documentElement.lang = 'tr';
    document.documentElement.dir = 'ltr';
  }, []);

  const subscriptions = useMemo(() => nodes.map(toSubscription), [nodes]);
  const activeCount = subscriptions.filter((item) => item.status === 'active').length;
  const categoryRows = useMemo(() => CATEGORY_OPTIONS.map(({ value, label }) => {
    const items = subscriptions.filter((item) => item.category === value);
    return {
      key: value,
      label,
      total: items.length,
      active: items.filter((item) => item.status === 'active').length,
      paused: items.filter((item) => item.status === 'paused').length,
      cancelled: items.filter((item) => item.status === 'cancelled').length,
    };
  }), [subscriptions]);
  const durationRows = useMemo(() => {
    const groups = new Map<string, { label: string; total: number; active: number; monthly: boolean; yearly: boolean }>();
    subscriptions.forEach((item) => {
      const interval = getBillingInterval(item.startDate, item.endDate);
      const label = interval?.label ?? 'Süre belirtilmemiş';
      const group = groups.get(label) ?? {
        label,
        total: 0,
        active: 0,
        monthly: interval?.kind === 'months' && interval.amount === 1,
        yearly: interval?.kind === 'months' && interval.amount % 12 === 0,
      };
      group.total += 1;
      if (item.status === 'active') group.active += 1;
      groups.set(label, group);
    });
    return Array.from(groups.values()).sort((a, b) => {
      if (a.label === 'Süre belirtilmemiş') return 1;
      if (b.label === 'Süre belirtilmemiş') return -1;
      return a.label.localeCompare(b.label, 'tr-TR', { numeric: true });
    });
  }, [subscriptions]);
  const categoryCount = categoryRows.filter((row) => row.total > 0).length;
  const durationCount = durationRows.filter((row) => row.label !== 'Süre belirtilmemiş').length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Kayıtların dağılımı</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Abonelik Raporu</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Abonelik sayılarını hizmet türü ve başlangıç-bitiş tarihlerinden hesaplanan süreye göre incele.
          </p>
        </section>

        {error && updatedAt == null ? (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <p className="font-medium">Abonelik raporu yüklenemedi.</p>
            <p className="mt-1 text-sm text-muted-foreground">Bağlantıyı kontrol edip yeniden deneyebilirsin.</p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => void refresh()}><RefreshCw className="size-4" /> Yeniden dene</Button>
          </div>
        ) : loading && updatedAt == null ? (
          <ReportSkeleton />
        ) : subscriptions.length === 0 ? (
          <section className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <h2 className="text-lg font-semibold">Rapor için henüz kayıt yok</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Bir abonelik eklediğinde hizmet türü ve süre dağılımları burada görünür.</p>
            <Button asChild className="mt-5 min-h-11"><Link to="/abonelikler">Abonelik ekle</Link></Button>
          </section>
        ) : (
          <>
            <section aria-label="Abonelik özeti" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Toplam abonelik</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{subscriptions.length}</p>
              </article>
              <article className="rounded-2xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Aktif abonelik</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{activeCount}</p>
              </article>
              <article className="rounded-2xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Hizmet türü / süre</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{categoryCount}<span className="px-2 text-muted-foreground">/</span>{durationCount}</p>
              </article>
            </section>

            <section aria-labelledby="category-count-title" className="space-y-4">
              <div>
                <h2 id="category-count-title" className="text-xl font-semibold tracking-tight">Hizmet Türü bazında</h2>
                <p className="mt-1 text-sm text-muted-foreground">Her hizmet türündeki tüm ve aktif abonelik sayısı.</p>
              </div>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Hizmet Türü</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Toplam</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Aktif</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Duraklatıldı</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">İptal edildi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((row) => (
                      <tr key={row.key} className="border-t">
                        <th scope="row" className="px-4 py-3 font-medium">{row.label}</th>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.total}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{row.active}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-300">{row.paused}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-semibold">
                    <tr><th scope="row" className="px-4 py-3">Toplam</th><td className="px-4 py-3 text-right tabular-nums">{subscriptions.length}</td><td className="px-4 py-3 text-right tabular-nums">{activeCount}</td><td className="px-4 py-3 text-right tabular-nums">{subscriptions.filter((item) => item.status === 'paused').length}</td><td className="px-4 py-3 text-right tabular-nums">{subscriptions.filter((item) => item.status === 'cancelled').length}</td></tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section aria-labelledby="duration-count-title" className="space-y-4">
              <div>
                <h2 id="duration-count-title" className="text-xl font-semibold tracking-tight">Süre bazında</h2>
                <p className="mt-1 text-sm text-muted-foreground">Süre etiketi başlangıç ve bitiş tarihlerinden üretilir; aylık, haftalık ve yıllık örüntüler korunur.</p>
              </div>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Abonelik süresi</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Toplam</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Aktif</th>
                      <th scope="col" className="px-4 py-3 font-medium">Dönem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {durationRows.map((row) => (
                      <tr key={row.label} className="border-t">
                        <th scope="row" className="px-4 py-3 font-medium">{row.label}</th>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.total}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.active}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.monthly ? 'Aylık' : row.yearly ? 'Yıllık' : row.label === 'Süre belirtilmemiş' ? 'Tarih eksik' : row.label === '1 hafta' ? 'Haftalık' : 'Diğer'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
