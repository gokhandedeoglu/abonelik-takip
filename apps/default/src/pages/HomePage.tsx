import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { FloatingAgentChat } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLiveNodes } from '@/hooks/use-live-nodes';
import { createNode, updateNode } from '@/lib/genesis-data';
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  PROJECT_ID,
  STATUS_LABELS,
  STATUS_OPTIONS,
  getIstanbulToday,
  getDaysUntil,
  formatSubscriptionDate,
  type SubscriptionCategory,
  type SubscriptionStatus,
} from '@/lib/subscriptions';
import {
  durationLabel,
  getBillingInterval,
  formatMoney,
  isCurrencyCode,
  toSubscription,
  type SubscriptionRecord,
} from '@/lib/subscription-costs';
import { CalendarDays, CheckCircle2, Clock3, Pencil, Plus, RefreshCw, Search } from '@/lib/icons';

type SubscriptionDraft = {
  name: string;
  providerCompany: string;
  category: SubscriptionCategory;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  planType: string;
  fee: string;
  currency: string;
};

type Subscription = SubscriptionRecord;

const EMPTY_DRAFT: SubscriptionDraft = {
  name: '',
  providerCompany: '',
  category: 'ai',
  startDate: '',
  endDate: '',
  status: 'active',
  planType: '',
  fee: '',
  currency: '',
};

function StatusPill({ status }: { status: SubscriptionStatus }) {
  const styles: Record<SubscriptionStatus, string> = {
    active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    paused: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    cancelled: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-medium ${styles[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3" aria-label="Abonelikler yükleniyor">
      {[0, 1, 2].map((item) => (
        <div key={item} className="animate-pulse rounded-xl border bg-card p-5">
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="mt-4 h-3 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { nodes, loading, error, updatedAt, refresh } = useLiveNodes(PROJECT_ID);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [draft, setDraft] = useState<SubscriptionDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState('all');

  useEffect(() => {
    document.title = 'Abonelikler | Abonelik Takipçisi';
    document.documentElement.lang = 'tr';
    document.documentElement.dir = 'ltr';
  }, []);

  const subscriptions = useMemo(() => nodes.map(toSubscription), [nodes]);
  const exactDurationOptions = useMemo(() => Array.from(new Set(subscriptions.flatMap((item) => {
    const interval = getBillingInterval(item.startDate, item.endDate);
    if (interval == null || (interval.kind === 'months' && (interval.amount === 1 || interval.amount % 12 === 0)) || (interval.kind === 'days' && interval.amount === 7)) return [];
    return [interval.label];
  }))).sort((a, b) => a.localeCompare(b, 'tr-TR', { numeric: true })), [subscriptions]);
  const today = getIstanbulToday();
  const metrics = useMemo(() => {
    const active = subscriptions.filter((item) => item.status === 'active');
    const endingSoon = active.filter((item) => {
      const days = getDaysUntil(item.endDate, today);
      return days != null && days >= 0 && days <= 30;
    }).length;
    const endingToday = active.filter((item) => item.endDate === today).length;
    return { total: subscriptions.length, active: active.length, endingSoon, endingToday };
  }, [subscriptions, today]);

  const visibleSubscriptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
    return subscriptions
      .filter((item) => categoryFilter === 'all' || item.category === categoryFilter)
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => {
        if (durationFilter === 'all') return true;
        const interval = getBillingInterval(item.startDate, item.endDate);
        if (durationFilter === 'monthly') return interval?.kind === 'months' && interval.amount === 1;
        if (durationFilter === 'yearly') return interval?.kind === 'months' && interval.amount % 12 === 0;
        if (durationFilter === 'weekly') return interval?.kind === 'days' && interval.amount === 7;
        return item.duration === durationFilter.slice('exact:'.length);
      })
      .filter((item) =>
        normalizedQuery.length === 0 ||
        item.name.toLocaleLowerCase('tr-TR').includes(normalizedQuery) ||
        item.providerCompany.toLocaleLowerCase('tr-TR').includes(normalizedQuery) ||
        item.planType.toLocaleLowerCase('tr-TR').includes(normalizedQuery) ||
        CATEGORY_LABELS[item.category].toLocaleLowerCase('tr-TR').includes(normalizedQuery),
      )
      .sort((a, b) => (a.endDate || '9999-12-31').localeCompare(b.endDate || '9999-12-31'));
  }, [subscriptions, query, categoryFilter, statusFilter, durationFilter]);

  function openNewDialog() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormError('');
    setDialogOpen(true);
  }

  function openEditDialog(item: Subscription) {
    setEditing(item);
    setDraft({
      name: item.name,
      providerCompany: item.providerCompany,
      category: item.category,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      planType: item.planType,
      fee: item.fee == null ? '' : String(item.fee),
      currency: item.currency,
    });
    setFormError('');
    setDialogOpen(true);
  }

  async function saveSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const name = draft.name.trim();
    if (!name || !draft.startDate || !draft.endDate) {
      setFormError('Hizmet adı ile başlangıç ve bitiş tarihlerini doldurun.');
      return;
    }
    if (draft.endDate < draft.startDate) {
      setFormError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
      return;
    }
    const feeText = draft.fee.trim();
    const fee = Number(feeText);
    const currency = draft.currency.trim().toUpperCase();
    if (feeText === '' || !Number.isFinite(fee) || fee < 0) {
      setFormError('Geçerli ve sıfırdan küçük olmayan bir abonelik ücreti girin.');
      return;
    }
    if (fee > 0 && !isCurrencyCode(currency)) {
      setFormError('Ücretli aboneliklerde TRY, USD veya EUR gibi geçerli bir para birimi kodu girin.');
      return;
    }

    setSaving(true);
    try {
      const fields: Record<string, string | number> = {
        '/text': name,
        '/attributes/@sN4me': name,
        '/attributes/@tYp3x': draft.category,
        '/attributes/@strt1': `${draft.startDate}T00:00:00.000Z`,
        '/attributes/@endd2': `${draft.endDate}T00:00:00.000Z`,
        '/attributes/@stat5': draft.status,
        '/attributes/@dur4t': durationLabel(draft.startDate, draft.endDate),
        '/attributes/@prc01': fee,
      };
      const planType = draft.planType.trim();
      const providerCompany = draft.providerCompany.trim();
      if (planType || (editing != null && planType !== editing.planType)) fields['/attributes/@plan9'] = planType;
      if (providerCompany || (editing != null && providerCompany !== editing.providerCompany)) fields['/attributes/@1c4ce'] = providerCompany;
      if (currency || (editing != null && currency !== editing.currency)) fields['/attributes/@cur01'] = currency;
      const result = editing
        ? await updateNode(PROJECT_ID, editing.id, fields)
        : await createNode(PROJECT_ID, fields);
      if (result.ignoredKeys.length > 0) {
        throw new Error('Bazı bilgiler kaydedilemedi. Lütfen formu kontrol edip yeniden deneyin.');
      }
      await refresh();
      setDialogOpen(false);
      setNotice(editing ? 'Abonelik bilgileri güncellendi.' : 'Abonelik eklendi.');
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Kaydetme tamamlanamadı. Yeniden deneyin.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item: Subscription, nextStatus: SubscriptionStatus) {
    if (item.status === nextStatus) return;
    setNotice('');
    setQuickSavingId(item.id);
    try {
      const result = await updateNode(PROJECT_ID, item.id, { '/attributes/@stat5': nextStatus });
      if (result.ignoredKeys.length > 0) {
        throw new Error('Durum değişikliği kaydedilemedi. Lütfen yenileyip tekrar deneyin.');
      }
      await refresh();
      setNotice('Abonelik durumu güncellendi.');
    } catch (statusError) {
      setNotice(statusError instanceof Error ? statusError.message : 'Durum değişikliği kaydedilemedi.');
    } finally {
      setQuickSavingId(null);
    }
  }

  const cards = [
    { label: 'Toplam abonelik', value: metrics.total, icon: CalendarDays, note: 'Kayıtlı tüm hizmetler' },
    { label: 'Aktif üyelik', value: metrics.active, icon: CheckCircle2, note: 'Şu anda kullandıkların' },
    { label: '30 gün içinde', value: metrics.endingSoon, icon: Clock3, note: 'Bitiş tarihi yaklaşanlar' },
    { label: 'Bugün bitiyor', value: metrics.endingToday, icon: Clock3, note: 'Bugün hatırlatma alırsın' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader>
        <Button className="min-h-11 gap-2" onClick={openNewDialog}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Abonelik ekle</span>
          <span className="sm:hidden">Ekle</span>
        </Button>
      </AppHeader>

      <main id="top" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="grid grid-cols-1 gap-6 md:grid-cols-[1.3fr_0.7fr] md:items-end">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Dijital yaşamın, düzenli</p>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Tüm üyeliklerin tek bakışta.</h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Süper Zeka, eğitim, domain, hosting, eğlence ve mobil uygulama aboneliklerini tarihleriyle birlikte takip et. Bitiş gününde hatırlatmayı biz gönderelim.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary" aria-hidden>
                <Clock3 className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">Bitiş günü hatırlatması</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Aktif üyelikler için her gün 09.00’da kontrol edilir.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Abonelik özeti" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, note }) => (
            <article key={label} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className="size-4 text-primary" aria-hidden />
              </div>
              <p className="mt-4 text-3xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </article>
          ))}
        </section>

        <section aria-labelledby="subscriptions-heading" className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 id="subscriptions-heading" className="text-xl font-semibold tracking-tight">Aboneliklerin</h2>
              <p className="mt-1 text-sm text-muted-foreground">Başlangıç ve bitiş tarihlerini buradan güncel tut.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
                <span className="sr-only">Abonelik ara</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hizmet ara" className="min-h-11 pl-9" autoComplete="off" />
              </label>
              <label>
                <span className="sr-only">Hizmet türüne göre filtrele</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-h-11 rounded-md border border-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="all">Tüm hizmet türleri</option>
                  {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Duruma göre filtrele</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 rounded-md border border-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="all">Tüm durumlar</option>
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Abonelik süresine göre filtrele</span>
                <select value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)} className="min-h-11 rounded-md border border-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="all">Tüm süreler</option>
                  <option value="monthly">Aylık</option>
                  <option value="yearly">Yıllık</option>
                  <option value="weekly">Haftalık</option>
                  {exactDurationOptions.map((duration) => <option key={duration} value={`exact:${duration}`}>{duration}</option>)}
                </select>
              </label>
            </div>
          </div>

          {notice ? <p role="status" className="rounded-lg border bg-accent/50 px-4 py-3 text-sm text-accent-foreground">{notice}</p> : null}
          {error && updatedAt == null ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
              <p className="font-medium">Abonelikler yüklenemedi.</p>
              <p className="mt-1 text-sm text-muted-foreground">Bağlantıyı kontrol edip yeniden deneyebilirsin.</p>
              <Button variant="outline" className="mt-4 min-h-11" onClick={() => void refresh()}><RefreshCw className="size-4" /> Yeniden dene</Button>
            </div>
          ) : loading && updatedAt == null ? (
            <SkeletonRows />
          ) : visibleSubscriptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden><CalendarDays className="size-6" /></span>
              <h3 className="mt-4 text-lg font-semibold">{subscriptions.length === 0 ? 'İlk aboneliğini ekle' : 'Bu filtrede abonelik yok'}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {subscriptions.length === 0 ? 'Hizmet adını, hizmet türünü ve üyelik tarihlerini kaydet. Takibin burada başlar.' : 'Arama veya filtre seçimini değiştirerek diğer kayıtları görebilirsin.'}
              </p>
              {subscriptions.length === 0 ? <Button className="mt-5 min-h-11" onClick={openNewDialog}><Plus className="size-4" /> Abonelik ekle</Button> : null}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleSubscriptions.map((item) => {
                const daysLeft = getDaysUntil(item.endDate, today);
                const endingToday = item.status === 'active' && item.endDate === today;
                const overdue = item.status === 'active' && daysLeft != null && daysLeft < 0;
                return (
                  <article key={item.id} className="rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 break-words text-base font-semibold">{item.name}</h3>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{CATEGORY_LABELS[item.category]}</span>
                          {endingToday ? <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Bugün bitiyor</span> : null}
                          {overdue ? <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">Bitiş tarihi geçti</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                          <span>Başlangıç: <span className="font-medium text-foreground">{formatSubscriptionDate(item.startDate)}</span></span>
                          <span>Bitiş: <span className="font-medium text-foreground">{formatSubscriptionDate(item.endDate)}</span></span>
                          {item.providerCompany ? <span>Sağlayıcı Firma: <span className="font-medium text-foreground">{item.providerCompany}</span></span> : null}
                          {item.status === 'active' && daysLeft != null && daysLeft > 0 && daysLeft <= 30 ? <span className="font-medium text-primary">{daysLeft} gün kaldı</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{item.duration || 'Süre eklenmedi'}</span>
                          {item.planType ? <span>Plan: <span className="text-foreground">{item.planType}</span></span> : null}
                          <span className="font-medium text-foreground">{item.fee == null ? 'Ücret eklenmedi' : item.fee === 0 ? 'Ücretsiz' : item.currency ? formatMoney(item.fee, item.currency) : 'Para birimi eklenmedi'}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <div className="flex items-center gap-2">
                          <StatusPill status={item.status} />
                          <label>
                            <span className="sr-only">{item.name} durumunu değiştir</span>
                            <select
                              value={item.status}
                              disabled={quickSavingId === item.id}
                              onChange={(event) => void changeStatus(item, event.target.value as SubscriptionStatus)}
                              className="min-h-11 rounded-md border border-input px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                            >
                              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                        </div>
                        <Button variant="outline" size="icon" className="min-h-11 min-w-11" aria-label={`${item.name} bilgilerini düzenle`} onClick={() => openEditDialog(item)}>
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {error && updatedAt != null ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Son yenileme tamamlanmadı. Gösterilen kayıtlar son başarılı okumadan geldi.
              <Button variant="link" className="min-h-11 px-1" onClick={() => void refresh()}>Şimdi yenile</Button>
            </p>
          ) : null}
        </section>

        <footer className="border-t pt-5 text-xs text-muted-foreground">
          Hatırlatmalar aktif abonelikler için bitiş tarihinde, Europe/Istanbul saat diliminde gönderilir.
        </footer>
      </main>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setFormError(''); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Aboneliği düzenle' : 'Yeni abonelik ekle'}</DialogTitle>
            <DialogDescription>Hizmet bilgilerini ve üyelik tarihlerini kaydet.</DialogDescription>
          </DialogHeader>
          <form data-genesis-form="subscription" onSubmit={saveSubscription} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subscription-name">Hizmet adı</Label>
              <Input id="subscription-name" data-genesis-field="Abonelik adı" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Örn. Tasarım aracı" autoComplete="off" required maxLength={100} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subscription-category">Hizmet Türü</Label>
                <select id="subscription-category" data-genesis-field="Hizmet Türü" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as SubscriptionCategory }))} className="min-h-11 w-full rounded-md border border-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-provider-company">Sağlayıcı Firma</Label>
                <Input id="subscription-provider-company" data-genesis-field="Sağlayıcı Firma" value={draft.providerCompany} onChange={(event) => setDraft((current) => ({ ...current, providerCompany: event.target.value }))} placeholder="Örn. Microsoft" autoComplete="organization" maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-status">Durum</Label>
                <select id="subscription-status" data-genesis-field="Durum" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as SubscriptionStatus }))} className="min-h-11 w-full rounded-md border border-input px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-start">Başlangıç tarihi</Label>
                <Input id="subscription-start" data-genesis-field="Başlangıç tarihi" type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-end">Bitiş tarihi</Label>
                <Input id="subscription-end" data-genesis-field="Bitiş tarihi" type="date" value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subscription-duration">Hesaplanan abonelik süresi</Label>
                <output id="subscription-duration" data-genesis-field="Abonelik Süresi" aria-live="polite" className="flex min-h-11 w-full items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                  {draft.startDate && draft.endDate && draft.endDate >= draft.startDate
                    ? durationLabel(draft.startDate, draft.endDate)
                    : 'Başlangıç ve bitiş tarihlerini seç'}
                </output>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-plan-type">Abonelik türü / plan</Label>
                <Input id="subscription-plan-type" data-genesis-field="Abonelik Türü" value={draft.planType} onChange={(event) => setDraft((current) => ({ ...current, planType: event.target.value }))} placeholder="Örn. Pro, Complete, Free" autoComplete="off" maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-fee">Abonelik ücreti</Label>
                <Input id="subscription-fee" data-genesis-field="Abonelik Ücreti" type="number" inputMode="decimal" min="0" step="0.01" value={draft.fee} onChange={(event) => setDraft((current) => ({ ...current, fee: event.target.value }))} placeholder="0" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-currency">Para birimi</Label>
                <Input id="subscription-currency" data-genesis-field="Para Birimi" value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="TRY" list="subscription-currency-suggestions" autoComplete="off" maxLength={3} required={Number(draft.fee) > 0} />
                <datalist id="subscription-currency-suggestions">
                  <option value="TRY" />
                  <option value="USD" />
                  <option value="EUR" />
                  <option value="GBP" />
                </datalist>
                <p className="text-xs leading-5 text-muted-foreground">TRY, USD, EUR gibi 3 harfli kod kullanılır. Tutarlar kendi para birimlerinde ayrı raporlanır; TRY karşılığı TCMB döviz satış kuruyla hesaplanır.</p>
              </div>
            </div>
            {formError ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialogOpen(false)} disabled={saving}>İptal</Button>
              <Button type="submit" data-genesis-submit disabled={saving} className="min-h-11">
                {saving ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Aboneliği kaydet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FloatingAgentChat
        agentId="01M4NZNA02PRXM51BFG0KJQAD4"
        publicAgentId="abonelik-rehberi-01M4NZNA04K94AE4RQ73XHA96G"
        title="Abonelik Rehberi"
        suggestions={['Yeni aboneliği nasıl eklerim?', 'Hatırlatma ne zaman gelir?', 'Durumu nasıl güncellerim?']}
        placeholder="Abonelik takibi hakkında sor…"
        emptyDescription="Aboneliklerini düzenli takip etmene yardımcı olabilirim. Kişisel kayıtlarını görmüyorum."
        footerText="Genel kullanım yardımı, abonelik kayıtlarına erişmez."
        labels={{
          openChat: 'Abonelik Rehberi’ni aç',
          closeChat: 'Sohbeti kapat',
          warmingUp: 'Asistan hazırlanıyor. Yeniden deneyebilirsin.',
          tryAgain: 'Yeniden dene',
          openHostedChat: 'Web sohbetini aç',
          connecting: 'Bağlanıyor…',
          working: 'Üzerinde çalışıyorum…',
          needsApproval: 'Onayın gerekiyor',
          failed: 'Bir sorun oluştu',
          skipped: 'Atlandı',
          thinking: 'Düşünüyor…',
          dismissNotice: 'Bildirimi kapat',
          approve: 'Onayla',
          deny: 'Reddet',
          retry: 'Yeniden dene',
        }}
      />
    </div>
  );
}
