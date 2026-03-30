'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import {
  getAnalytics,
  getBindings,
  getDashboardNotifications,
  getEvents,
  getNodeOverview,
  getNodeResources,
  getNodeSnapshot,
  getScheduleVersions,
  getStations,
  pickBestStationId,
} from '../../lib/api';
import {
  AlertTriangle,
  CalendarRange,
  Clock3,
  Database,
  Download,
  Gauge,
  LayoutGrid,
  MapPin,
  RefreshCw,
  Search,
  Table2,
  Timer,
  Train,
  Users,
} from 'lucide-react';

type DashboardView = 'board' | 'feed' | 'table' | 'calendar';
type FeedTone = 'info' | 'warning' | 'critical';

type FeedItem = {
  id: string;
  timestamp: string;
  tone: FeedTone;
  title: string;
  message: string;
  source: string;
};

const TAB_META: Array<{ key: DashboardView; label: string; icon: any }> = [
  { key: 'board', label: 'Доска', icon: LayoutGrid },
  { key: 'feed', label: 'Лента', icon: Timer },
  { key: 'table', label: 'Таблица', icon: Table2 },
  { key: 'calendar', label: 'Календарь', icon: CalendarRange },
];

const TRAIN_STATUS_META: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: 'Запланирован', cls: 'badge-gray' },
  READY: { label: 'Готов', cls: 'badge-blue' },
  WAITING_SLOT: { label: 'Ждёт слот', cls: 'badge-yellow' },
  LOCO_ASSIGNED: { label: 'Тяга назначена', cls: 'badge-blue' },
  CREW_CONFIRMED: { label: 'Бригада подтверждена', cls: 'badge-blue' },
  DELAYED: { label: 'Задержан', cls: 'badge-red' },
  ACTIVE: { label: 'В работе', cls: 'badge-blue' },
  DEPARTED: { label: 'Отправлен', cls: 'badge-green' },
  ARRIVED: { label: 'Прибыл', cls: 'badge-green' },
  CANCELLED: { label: 'Отменён', cls: 'badge-red' },
};

const EVENT_LABELS: Record<string, string> = {
  TRACK_CLOSURE: 'Закрытие пути',
  TRACK_BLOCKED: 'Блокировка пути',
  LOCOMOTIVE_FAILURE: 'Отказ локомотива',
  CREW_ABSENCE: 'Отсутствие бригады',
  CREW_UNAVAILABLE: 'Недоступность бригады',
  LATE_TRAIN: 'Опоздание поезда',
  TRAIN_DELAY: 'Задержка поезда',
  MAINTENANCE: 'Техобслуживание',
  MAINTENANCE_STARTED: 'Начало ремонта',
  MAINTENANCE_ENDED: 'Завершение ремонта',
  WEATHER: 'Погодные ограничения',
  CAPACITY_CONFLICT: 'Конфликт пропускной способности',
};

function normalizeView(value: string | null): DashboardView {
  if (value === 'feed' || value === 'table' || value === 'calendar') return value;
  return 'board';
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatInputDateTime(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMinutes(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const hours = Math.floor(value / 60);
  const minutes = Math.max(0, value % 60);
  if (!hours) return `${minutes} мин`;
  return `${hours} ч ${String(minutes).padStart(2, '0')} мин`;
}

function eventTone(type: string): FeedTone {
  if (type === 'LOCOMOTIVE_FAILURE' || type === 'TRACK_CLOSURE' || type === 'TRACK_BLOCKED') return 'critical';
  if (type === 'CREW_ABSENCE' || type === 'CREW_UNAVAILABLE' || type === 'TRAIN_DELAY' || type === 'LATE_TRAIN') return 'warning';
  return 'info';
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stationParam = searchParams.get('stationId') ?? '';
  const view = normalizeView(searchParams.get('view'));
  const snapshotAtParam = searchParams.get('at') ?? '';

  const [stationId, setStationId] = useState('');
  const [stations, setStations] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [versions, setVersions] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [resources, setResources] = useState<any>(null);
  const [bindings, setBindings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [calendarDraftAt, setCalendarDraftAt] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatus, setTableStatus] = useState('');

  const syncRoute = useCallback((next: { stationId?: string; view?: DashboardView; at?: string | null }, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextStationId = next.stationId ?? params.get('stationId') ?? '';
    const nextView = next.view ?? normalizeView(params.get('view'));
    const nextAt = next.at === undefined ? params.get('at') : next.at;
    if (nextStationId) params.set('stationId', nextStationId); else params.delete('stationId');
    if (nextView === 'board') params.delete('view'); else params.set('view', nextView);
    if (nextView === 'calendar' && nextAt) params.set('at', nextAt); else params.delete('at');
    const href = `/dashboard${params.toString() ? `?${params.toString()}` : ''}`;
    if (replace) router.replace(href); else router.push(href);
  }, [router, searchParams]);

  const loadCore = useCallback(async (sid: string) => {
    if (!sid) return;
    setLoading(true);
    try {
      const [a, v, o, r, n, b] = await Promise.all([
        getAnalytics(sid),
        getScheduleVersions(sid, { limit: 8 }),
        getNodeOverview(sid),
        getNodeResources(sid),
        getDashboardNotifications(sid),
        getBindings({ stationId: sid, take: 100 }),
      ]);
      setAnalytics(a); setVersions(v); setOverview(o); setResources(r); setNotifications(n); setBindings(b.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFeed = useCallback(async (sid: string) => {
    if (!sid) return;
    setFeedLoading(true);
    try {
      const data = await getEvents(sid);
      setEvents(data.events ?? []);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const loadSnapshot = useCallback(async (sid: string, at?: string) => {
    if (!sid) return;
    setSnapshotLoading(true);
    try {
      setSnapshot(await getNodeSnapshot(sid, at));
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stationList = await getStations();
      if (cancelled) return;
      setStations(stationList.stations ?? []);
      let resolved = stationParam;
      if (!resolved || !stationList.stations.some((station: any) => station.id === resolved)) {
        const fromStorage = window.localStorage.getItem('ktz_station_id') ?? '';
        resolved = fromStorage && stationList.stations.some((station: any) => station.id === fromStorage)
          ? fromStorage
          : pickBestStationId(stationList.stations);
      }
      if (cancelled) return;
      setStationId(resolved);
      if (resolved) {
        window.localStorage.setItem('ktz_station_id', resolved);
        if (resolved !== stationParam) syncRoute({ stationId: resolved }, true);
      }
    })();
    return () => { cancelled = true; };
  }, [stationParam, syncRoute]);

  useEffect(() => {
    if (stationId) void loadCore(stationId);
  }, [loadCore, stationId]);

  useEffect(() => {
    if (view === 'feed' && stationId) void loadFeed(stationId);
  }, [loadFeed, stationId, view]);

  useEffect(() => {
    if (view === 'calendar') setCalendarDraftAt(formatInputDateTime(snapshotAtParam || new Date()));
  }, [snapshotAtParam, view]);

  useEffect(() => {
    if (view === 'calendar' && stationId) void loadSnapshot(stationId, snapshotAtParam || undefined);
  }, [loadSnapshot, snapshotAtParam, stationId, view]);

  const selectedStation = stations.find((station) => station.id === stationId) ?? null;
  const totalConflicts = Object
    .values((analytics?.conflictsCountByType ?? {}) as Record<string, number | string | null | undefined>)
    .reduce<number>((sum, value) => sum + Number(value ?? 0), 0);

  const boardColumns = useMemo(() => {
    const items: any[] = overview?.trainRuns ?? [];
    return [
      { title: 'План', dot: 'bg-slate-400', items: items.filter((item) => item.trainRun?.status === 'PLANNED') },
      { title: 'В работе', dot: 'bg-sky-500', items: items.filter((item) => ['READY', 'LOCO_ASSIGNED', 'CREW_CONFIRMED', 'ACTIVE'].includes(item.trainRun?.status)) },
      { title: 'Риски', dot: 'bg-rose-500', items: items.filter((item) => Object.values(item.conflictFlags ?? {}).some(Boolean) || new Date(item.plannedDeparture).getTime() > new Date(item.trainRun?.scheduledDeparture).getTime()) },
      { title: 'Завершено', dot: 'bg-emerald-500', items: items.filter((item) => ['DEPARTED', 'ARRIVED', 'CANCELLED'].includes(item.trainRun?.status)) },
    ];
  }, [overview]);

  const feedItems = useMemo<FeedItem[]>(() => {
    const fromEvents: FeedItem[] = events.map((event: any) => ({
      id: `event-${event.id}`,
      timestamp: event.createdAt,
      tone: eventTone(event.type),
      title: EVENT_LABELS[event.type] ?? event.type,
      message: 'Событие зафиксировано в operational event stream станции.',
      source: 'OperationalEvent',
    }));

    const fromIdle: FeedItem[] = (resources?.locomotives ?? []).map((locomotive: any) => {
      const idleMinutes = Math.max(0, Math.round((Date.now() - new Date(locomotive.availableFrom).getTime()) / 60000));
      return {
        id: `idle-${locomotive.id}`,
        timestamp: locomotive.availableFrom,
        tone: idleMinutes >= 180 ? 'critical' : idleMinutes >= 60 ? 'warning' : 'info',
        title: `Начало простоя локомотива ${locomotive.label}`,
        message: `Локомотив свободен с ${formatDateTime(locomotive.availableFrom)}. Текущий простой: ${formatMinutes(idleMinutes)}.`,
        source: 'Locomotive.availableFrom',
      };
    });

    const fromBindings: FeedItem[] = bindings.map((binding: any) => ({
      id: `binding-${binding.id}`,
      timestamp: binding.updatedAt ?? binding.createdAt ?? binding.departureDt,
      tone: binding.status === 'CONFLICT' ? 'critical' : binding.status === 'DRAFT' ? 'warning' : 'info',
      title: `Подвязка №${binding.arrivalTrain?.number ?? '—'} → №${binding.departureTrain?.number ?? '—'}`,
      message: `Станция ${binding.turnaroundStation?.name ?? '—'}, простой ${formatMinutes(binding.dwellMinutes)}.`,
      source: 'BindingPlan',
    }));

    return [...fromEvents, ...fromIdle, ...fromBindings]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 40);
  }, [bindings, events, resources]);

  const tableRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    return (overview?.trainRuns ?? []).map((item: any) => {
      const delayMinutes = Math.max(0, Math.round((new Date(item.plannedDeparture).getTime() - new Date(item.trainRun?.scheduledDeparture).getTime()) / 60000));
      return {
        id: item.allocationId,
        trainNumber: item.trainRun?.number ?? '',
        route: `${item.trainRun?.origin?.name ?? '—'} → ${item.trainRun?.destination?.name ?? '—'}`,
        status: item.trainRun?.status ?? '',
        statusLabel: TRAIN_STATUS_META[item.trainRun?.status]?.label ?? item.trainRun?.status ?? '—',
        plannedArrival: item.plannedArrival,
        plannedDeparture: item.plannedDeparture,
        trackName: item.track?.name ?? '—',
        locomotive: item.locomotive?.label ?? '—',
        crew: item.crew?.id ? item.crew.id.slice(0, 8) : '—',
        slotStatus: item.slotStatus ?? '—',
        delayMinutes,
        conflictCount: Object.values(item.conflictFlags ?? {}).filter(Boolean).length,
      };
    }).filter((row: any) => {
      if (tableStatus && row.status !== tableStatus) return false;
      if (!search) return true;
      return [row.trainNumber, row.route, row.trackName, row.locomotive, row.crew, row.slotStatus].join(' ').toLowerCase().includes(search);
    }).sort((left: any, right: any) => new Date(left.plannedDeparture).getTime() - new Date(right.plannedDeparture).getTime());
  }, [overview, tableSearch, tableStatus]);

  const exportTable = useCallback(() => {
    downloadCsv('dashboard-table.csv', tableRows.map((row: any) => ({
      'Поезд': row.trainNumber,
      'Маршрут': row.route,
      'Статус': row.statusLabel,
      'Прибытие': formatDateTime(row.plannedArrival),
      'Отправление': formatDateTime(row.plannedDeparture),
      'Путь': row.trackName,
      'Локомотив': row.locomotive,
      'Бригада': row.crew,
      'Слот': row.slotStatus,
      'Отклонение, мин': row.delayMinutes,
      'Конфликтов': row.conflictCount,
    })));
  }, [tableRows]);

  return (
    <div className="flex min-h-screen">
      <Sidebar stationId={stationId} />
      <div className="main-wrapper flex-1">
        <header className="topbar">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">Операционная панель</span>
              {selectedStation && <span className="badge-blue"><MapPin size={10} />{selectedStation.name}</span>}
            </div>
            <div className="mt-1 text-xs text-slate-400">Вкладки разделены по реальным режимам: board, feed, table и calendar snapshot.</div>
          </div>
          <div className="flex items-center gap-2">
            <select value={stationId} onChange={(event) => { const next = event.target.value; setStationId(next); window.localStorage.setItem('ktz_station_id', next); syncRoute({ stationId: next }, true); }} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
              {stations.map((station: any) => <option key={station.id} value={station.id}>{station.name} ({station.trainRuns})</option>)}
            </select>
            <button onClick={() => stationId && void loadCore(stationId)} className="btn-secondary" disabled={loading || feedLoading || snapshotLoading}>
              <RefreshCw size={14} className={loading || feedLoading || snapshotLoading ? 'animate-spin' : ''} />
              Обновить
            </button>
          </div>
        </header>

        <main className="page-content space-y-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {view === 'board' && 'Доска текущего состояния'}
              {view === 'feed' && 'Лента простоев и событий'}
              {view === 'table' && 'Табличный режим внесённых данных'}
              {view === 'calendar' && 'Календарный snapshot'}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {view === 'board' && 'Доска показывает текущие allocations/train runs последней версии расписания и больше не уводит на простои.'}
              {view === 'feed' && 'Лента — единственная вкладка с потоком событий простоев и операционных изменений.'}
              {view === 'table' && 'Таблица — живой data-table из Allocation, TrainRun, Track, Locomotive и Crew.'}
              {view === 'calendar' && 'Календарь выбирает дату и время и грузит реальный snapshot станции на этот timestamp.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="stat-card"><div className="stat-icon bg-sky-50 text-sky-600"><Train size={18} /></div><div><div className="text-xs uppercase tracking-[0.16em] text-slate-400">Маршруты</div><div className="mt-1 text-2xl font-black text-slate-950">{analytics?.totalTrains ?? 0}</div><div className="mt-1 text-xs text-slate-500">Latest schedule version</div></div></div>
            <div className="stat-card"><div className="stat-icon bg-rose-50 text-rose-600"><AlertTriangle size={18} /></div><div><div className="text-xs uppercase tracking-[0.16em] text-slate-400">Конфликты</div><div className="mt-1 text-2xl font-black text-slate-950">{notifications?.summary?.totalConflicts ?? totalConflicts}</div><div className="mt-1 text-xs text-slate-500">Analytics + conflict flags</div></div></div>
            <div className="stat-card"><div className="stat-icon bg-violet-50 text-violet-600"><Gauge size={18} /></div><div><div className="text-xs uppercase tracking-[0.16em] text-slate-400">Локомотивы</div><div className="mt-1 text-2xl font-black text-slate-950">{resources?.summary?.locomotives ?? 0}</div><div className="mt-1 text-xs text-slate-500">Свободны: {resources?.summary?.availableLocomotives ?? 0}</div></div></div>
            <div className="stat-card"><div className="stat-icon bg-emerald-50 text-emerald-600"><Users size={18} /></div><div><div className="text-xs uppercase tracking-[0.16em] text-slate-400">Бригады</div><div className="mt-1 text-2xl font-black text-slate-950">{resources?.summary?.crews ?? 0}</div><div className="mt-1 text-xs text-slate-500">Свободны: {resources?.summary?.availableCrews ?? 0}</div></div></div>
            <div className="stat-card"><div className="stat-icon bg-amber-50 text-amber-600"><Clock3 size={18} /></div><div><div className="text-xs uppercase tracking-[0.16em] text-slate-400">Версии</div><div className="mt-1 text-2xl font-black text-slate-950">{versions?.total ?? 0}</div><div className="mt-1 text-xs text-slate-500">Pending: {notifications?.summary?.pendingApprovals ?? 0}</div></div></div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2 rounded-full bg-slate-100 p-1.5">
                {TAB_META.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.key} onClick={() => tab.key === 'calendar' ? syncRoute({ stationId, view: 'calendar', at: snapshotAtParam || new Date().toISOString() }) : syncRoute({ stationId, view: tab.key, at: null })} className={view === tab.key ? 'nav-tab-active flex items-center gap-2' : 'nav-tab flex items-center gap-2'}>
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                {(view === 'board' ? ['Allocation', 'TrainRun', 'ScheduleVersion'] : view === 'feed' ? ['OperationalEvent', 'BindingPlan', 'Locomotive.availableFrom'] : view === 'table' ? ['Allocation', 'Track', 'Locomotive', 'Crew'] : ['Node snapshot', 'Track', 'BindingPlan']).map((item) => <span key={item} className="badge-gray"><Database size={10} />{item}</span>)}
              </div>
            </div>
          </div>

          {loading && <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm">Загружаю реальное состояние станции...</div>}

          {!loading && view === 'board' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {boardColumns.map((column) => (
                <div key={column.title} className="kanban-col">
                  <div className="kanban-header"><div className="flex items-center gap-2"><span className={`inline-block h-2 w-2 rounded-full ${column.dot}`} /><span className="text-sm font-semibold text-slate-700">{column.title}</span><span className="badge-gray">{column.items.length}</span></div></div>
                  {column.items.slice(0, 6).map((item: any) => (
                    <div key={item.allocationId} className="kanban-card">
                      <div className="flex items-center justify-between gap-3"><div><div className="font-semibold text-slate-900">Поезд №{item.trainRun?.number ?? '—'}</div><div className="mt-1 text-xs text-slate-400">{item.trainRun?.origin?.name ?? '—'} → {item.trainRun?.destination?.name ?? '—'}</div></div><span className={TRAIN_STATUS_META[item.trainRun?.status]?.cls ?? 'badge-gray'}>{TRAIN_STATUS_META[item.trainRun?.status]?.label ?? item.trainRun?.status ?? '—'}</span></div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><div>Путь: <span className="font-semibold text-slate-700">{item.track?.name ?? '—'}</span></div><div>План: <span className="font-semibold text-slate-700">{formatTime(item.plannedDeparture)}</span></div><div>Локомотив: <span className="font-semibold text-slate-700">{item.locomotive?.label ?? '—'}</span></div><div>Бригада: <span className="font-semibold text-slate-700">{item.crew?.id ? item.crew.id.slice(0, 8) : '—'}</span></div></div>
                    </div>
                  ))}
                  {column.items.length === 0 && <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-400">В этом столбце сейчас нет записей.</div>}
                </div>
              ))}
            </div>
          )}

          {!loading && view === 'feed' && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Feed</div><h2 className="mt-1 text-lg font-black text-slate-950">Поток простоев и операционных изменений</h2></div><div className="text-xs text-slate-400">{feedItems.length} событий</div></div>
              {feedLoading ? <div className="mt-6 text-sm text-slate-400">Загружаю события...</div> : <div className="mt-6 space-y-3">{feedItems.map((item) => <div key={item.id} className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={item.tone === 'critical' ? 'badge-red' : item.tone === 'warning' ? 'badge-yellow' : 'badge-blue'}>{item.tone === 'critical' ? 'Критично' : item.tone === 'warning' ? 'Внимание' : 'Инфо'}</span><span className="badge-gray">{item.source}</span></div><div className="mt-3 text-base font-bold text-slate-950">{item.title}</div><div className="mt-1 text-sm text-slate-600">{item.message}</div></div><div className="text-xs text-slate-400">{formatDateTime(item.timestamp)}</div></div></div>)}{feedItems.length === 0 && <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">Событий для ленты пока нет.</div>}</div>}
            </div>
          )}

          {!loading && view === 'table' && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Table</div><h2 className="mt-1 text-lg font-black text-slate-950">Табличное представление allocations</h2></div>
                <div className="flex flex-wrap gap-2"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="Поезд, путь, локомотив" className="input-field min-w-[260px] pl-9" /></div><select value={tableStatus} onChange={(event) => setTableStatus(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"><option value="">Все статусы</option>{Object.entries(TRAIN_STATUS_META).map(([status, meta]) => <option key={status} value={status}>{meta.label}</option>)}</select><button onClick={exportTable} className="btn-secondary"><Download size={14} />Экспорт CSV</button></div>
              </div>
              <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-100"><div className="max-h-[620px] overflow-auto"><table className="min-w-full border-separate border-spacing-0 text-sm"><thead className="sticky top-0 bg-white"><tr>{['Поезд', 'Маршрут', 'Статус', 'Прибытие', 'Отправление', 'Путь', 'Локомотив', 'Бригада', 'Слот', 'Отклонение', 'Конфликты'].map((label) => <th key={label} className="border-b border-slate-100 px-4 py-3 text-left text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</th>)}</tr></thead><tbody>{tableRows.map((row: any) => <tr key={row.id} className="bg-white hover:bg-slate-50/80"><td className="border-b border-slate-100 px-4 py-4 font-mono font-bold text-sky-700">#{row.trainNumber}</td><td className="border-b border-slate-100 px-4 py-4 text-slate-700">{row.route}</td><td className="border-b border-slate-100 px-4 py-4"><span className={TRAIN_STATUS_META[row.status]?.cls ?? 'badge-gray'}>{row.statusLabel}</span></td><td className="border-b border-slate-100 px-4 py-4 text-slate-700">{formatDateTime(row.plannedArrival)}</td><td className="border-b border-slate-100 px-4 py-4 text-slate-700">{formatDateTime(row.plannedDeparture)}</td><td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-900">{row.trackName}</td><td className="border-b border-slate-100 px-4 py-4 text-slate-700">{row.locomotive}</td><td className="border-b border-slate-100 px-4 py-4 text-slate-500">{row.crew}</td><td className="border-b border-slate-100 px-4 py-4 text-slate-500">{row.slotStatus}</td><td className="border-b border-slate-100 px-4 py-4">{row.delayMinutes > 0 ? <span className="badge-yellow">+{row.delayMinutes} мин</span> : <span className="badge-green">По графику</span>}</td><td className="border-b border-slate-100 px-4 py-4">{row.conflictCount > 0 ? <span className="badge-red">{row.conflictCount}</span> : <span className="badge-green">0</span>}</td></tr>)}{tableRows.length === 0 && <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-400">Для выбранных фильтров нет записей.</td></tr>}</tbody></table></div></div>
            </div>
          )}

          {!loading && view === 'calendar' && (
            <>
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Calendar snapshot</div><h2 className="mt-1 text-lg font-black text-slate-950">Выбор даты и времени</h2></div>
                  <div className="flex flex-wrap items-center gap-2"><input type="datetime-local" value={calendarDraftAt} onChange={(event) => setCalendarDraftAt(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none" /><button onClick={() => { const parsed = new Date(calendarDraftAt); if (!Number.isNaN(parsed.getTime())) syncRoute({ stationId, view: 'calendar', at: parsed.toISOString() }); }} className="btn-primary">Показать срез</button><button onClick={() => { const now = new Date(); setCalendarDraftAt(formatInputDateTime(now)); syncRoute({ stationId, view: 'calendar', at: now.toISOString() }); }} className="btn-secondary">Сейчас</button></div>
                </div>
              </div>
              {snapshotLoading ? <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm">Формирую snapshot...</div> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Сводка</div><h3 className="mt-1 text-lg font-black text-slate-950">{formatDateTime(snapshot?.snapshotAt)}</h3><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-[20px] bg-slate-50 p-4">Активные маршруты: <span className="font-bold text-slate-950">{snapshot?.summary?.activeRoutes ?? 0}</span></div><div className="rounded-[20px] bg-slate-50 p-4">Занятые пути: <span className="font-bold text-slate-950">{snapshot?.summary?.occupiedTracks ?? 0}</span></div><div className="rounded-[20px] bg-slate-50 p-4">Локомотивы в работе: <span className="font-bold text-slate-950">{snapshot?.summary?.activeLocomotives ?? 0}</span></div><div className="rounded-[20px] bg-slate-50 p-4">Бригады в работе: <span className="font-bold text-slate-950">{snapshot?.summary?.activeCrews ?? 0}</span></div></div></div><div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Состояние</div><h3 className="mt-1 text-lg font-black text-slate-950">Реальный состав snapshot</h3><div className="mt-4 space-y-3 text-sm"><div className="rounded-[20px] bg-slate-50 p-4">Путей: <span className="font-bold text-slate-950">{snapshot?.tracks?.length ?? 0}</span></div><div className="rounded-[20px] bg-slate-50 p-4">Локомотивов: <span className="font-bold text-slate-950">{snapshot?.locomotives?.length ?? 0}</span></div><div className="rounded-[20px] bg-slate-50 p-4">Бригад: <span className="font-bold text-slate-950">{snapshot?.crews?.length ?? 0}</span></div><div className="rounded-[20px] bg-slate-50 p-4">Подвязок: <span className="font-bold text-slate-950">{snapshot?.bindings?.length ?? 0}</span></div></div></div></div>}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <DashboardPageContent />
    </Suspense>
  );
}
