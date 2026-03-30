'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Search, SlidersHorizontal } from 'lucide-react';

export type GituralLocomotiveTableRow = {
    id: string;
    pairKey: string;
    day: number;
    weekday: string | null;
    shoulder: string | null;
    shoulderKey: string | null;
    actualShoulders: string[];
    locomotiveNumber: string | null;
    locomotiveSeries: string | null;
    locomotiveDepot: string | null;
    locomotiveMatchSource: 'park_pool_match' | 'unresolved';
    arrival: string | null;
    arrivalSort: number | null;
    arrivalSource: 'fact' | 'binding' | 'missing';
    driver: string | null;
    driverSource: 'missing';
    driverShoulder: string | null;
    driverShoulderSource: 'binding' | 'missing';
    reporting: string | null;
    reportingSort: number | null;
    reportingSource: 'derived_notice_120' | 'missing';
    departure: string | null;
    departureSort: number | null;
    departureSource: 'fact' | 'binding' | 'missing';
    dwellMinutes: number | null;
    normMinutes: number | null;
    normSource: 'ideal_exact' | 'ideal_shoulder_avg' | 'park_service_fallback' | 'unavailable';
    overDwellMinutes: number | null;
    isTurner: boolean;
    status: 'ok' | 'warning' | 'critical' | 'missing';
    statusLabel: string;
    issues: string[];
    qualityFlags: string[];
    arrivalTrainNumber: string | null;
    departureTrainNumber: string | null;
    stationSheet: string;
};

type SortKey =
    | 'shoulder'
    | 'locomotiveNumber'
    | 'arrivalSort'
    | 'reportingSort'
    | 'departureSort'
    | 'dwellMinutes'
    | 'normMinutes'
    | 'overDwellMinutes';

const STATUS_META = {
    ok: {
        pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        row: 'hover:bg-emerald-50/40',
    },
    warning: {
        pill: 'bg-amber-50 text-amber-700 border-amber-200',
        row: 'hover:bg-amber-50/40',
    },
    critical: {
        pill: 'bg-rose-50 text-rose-700 border-rose-200',
        row: 'hover:bg-rose-50/40',
    },
    missing: {
        pill: 'bg-slate-100 text-slate-600 border-slate-200',
        row: 'hover:bg-slate-50',
    },
} as const;

function formatMinutes(value: number | null) {
    if (typeof value !== 'number') return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (!hours) return `${minutes}м`;
    return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
}

function sourceLabel(value: string) {
    if (value === 'fact') return 'Факт';
    if (value === 'binding') return 'Подвязка';
    if (value === 'ideal_exact') return 'Идеал';
    if (value === 'ideal_shoulder_avg') return 'Идеал · ср.';
    if (value === 'park_service_fallback') return 'Парк';
    if (value === 'derived_notice_120') return 'T-2ч';
    return 'Нет';
}

function normTone(value: GituralLocomotiveTableRow['normSource']) {
    if (value === 'ideal_exact') return 'bg-emerald-50 text-emerald-700';
    if (value === 'ideal_shoulder_avg') return 'bg-sky-50 text-sky-700';
    if (value === 'park_service_fallback') return 'bg-amber-50 text-amber-700';
    return 'bg-slate-100 text-slate-500';
}

function isSelectedRow(row: GituralLocomotiveTableRow, selectedPair?: string, selectedTrainNumber?: string) {
    if (selectedPair && row.pairKey === selectedPair) return true;
    if (!selectedTrainNumber) return false;
    return row.arrivalTrainNumber === selectedTrainNumber || row.departureTrainNumber === selectedTrainNumber;
}

export default function GituralLocomotiveTable({
    rows,
    selectedPair,
    selectedTrainNumber,
    onSelectRow,
}: {
    rows: GituralLocomotiveTableRow[];
    selectedPair?: string;
    selectedTrainNumber?: string;
    onSelectRow?: (row: GituralLocomotiveTableRow) => void;
}) {
    const [query, setQuery] = useState('');
    const [shoulderFilter, setShoulderFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [onlyProblems, setOnlyProblems] = useState(false);
    const [onlyDeviation, setOnlyDeviation] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('arrivalSort');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const shoulders = useMemo(
        () => Array.from(new Set(rows.map((item) => item.shoulder).filter((item): item is string => Boolean(item)))).sort((a, b) => a.localeCompare(b, 'ru')),
        [rows],
    );

    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const filtered = rows.filter((row) => {
            if (shoulderFilter && row.shoulder !== shoulderFilter) return false;
            if (statusFilter && row.status !== statusFilter) return false;
            if (onlyProblems && row.status === 'ok') return false;
            if (onlyDeviation && !row.qualityFlags.includes('out_of_shoulder') && (row.overDwellMinutes ?? 0) <= 0) return false;

            if (!normalizedQuery) return true;

            const haystack = [
                row.shoulder,
                row.locomotiveNumber,
                row.locomotiveSeries,
                row.locomotiveDepot,
                row.driver,
                row.driverShoulder,
                row.arrivalTrainNumber,
                row.departureTrainNumber,
                row.stationSheet,
                row.actualShoulders.join(' '),
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(normalizedQuery);
        });

        const sorted = [...filtered].sort((left, right) => {
            const leftValue = left[sortKey];
            const rightValue = right[sortKey];

            if (leftValue === rightValue) return left.id.localeCompare(right.id);
            if (leftValue === null || leftValue === undefined) return 1;
            if (rightValue === null || rightValue === undefined) return -1;

            if (typeof leftValue === 'number' && typeof rightValue === 'number') {
                return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue;
            }

            const compare = String(leftValue).localeCompare(String(rightValue), 'ru');
            return sortDirection === 'asc' ? compare : -compare;
        });

        return sorted;
    }, [onlyDeviation, onlyProblems, query, rows, shoulderFilter, sortDirection, sortKey, statusFilter]);

    const stats = useMemo(() => ({
        total: rows.length,
        critical: rows.filter((item) => item.status === 'critical').length,
        warning: rows.filter((item) => item.status === 'warning').length,
        exactNorm: rows.filter((item) => item.normSource === 'ideal_exact').length,
    }), [rows]);

    const selectedRowData = useMemo(() => {
        return rows.find((row) => isSelectedRow(row, selectedPair, selectedTrainNumber)) ?? null;
    }, [rows, selectedPair, selectedTrainNumber]);

    const resetLocalFilters = () => {
        setQuery('');
        setShoulderFilter('');
        setStatusFilter('');
        setOnlyProblems(false);
        setOnlyDeviation(false);
    };

    const toggleSort = (nextKey: SortKey) => {
        if (sortKey === nextKey) {
            setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSortKey(nextKey);
        setSortDirection(nextKey === 'overDwellMinutes' ? 'desc' : 'asc');
    };

    return (
        <div className="card mt-6 overflow-hidden border border-slate-200">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#020617_0%,#0f172a_55%,#1e293b_100%)] px-5 py-4 text-white">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                            Факт → Подвязка → Идеал
                        </div>
                        <h2 className="mt-2 text-xl font-black">Локомотивные состояния по узлу</h2>
                        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
                            Рабочая таблица для проверки плеча, факта прибытия, нормы и перепростоя. Это не отдельный источник, а тот же срез, что и карта выше.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 xl:min-w-[420px]">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Строк в срезе</div>
                            <div className="mt-1 text-2xl font-bold">{stats.total}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-rose-500/10 px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-rose-200/80">Критично</div>
                            <div className="mt-1 text-2xl font-bold text-rose-100">{stats.critical}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-amber-500/10 px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-200/80">Риск</div>
                            <div className="mt-1 text-2xl font-bold text-amber-100">{stats.warning}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-emerald-500/10 px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">Норма из идеала</div>
                            <div className="mt-1 text-2xl font-bold text-emerald-100">{stats.exactNorm}</div>
                        </div>
                    </div>
                </div>

                {selectedRowData && (
                    <div className="mt-4 grid grid-cols-1 gap-2 rounded-[24px] border border-white/10 bg-white/5 p-3 lg:grid-cols-4">
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Выбранный локомотив</div>
                            <div className="mt-1 font-mono text-lg font-black text-white">{selectedRowData.locomotiveNumber ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Плечо</div>
                            <div className="mt-1 text-sm font-semibold text-white">{selectedRowData.shoulder ?? 'Не определено'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Факт / отправление</div>
                            <div className="mt-1 text-sm font-semibold text-white">{selectedRowData.arrival ?? '—'} → {selectedRowData.departure ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Перепростой</div>
                            <div className="mt-1 text-sm font-semibold text-white">{formatMinutes(selectedRowData.overDwellMinutes)}</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-700">Уточнение табличного среза</div>
                    {(query || shoulderFilter || statusFilter || onlyProblems || onlyDeviation) && (
                        <button
                            type="button"
                            onClick={resetLocalFilters}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                        >
                            Сбросить локальные фильтры
                        </button>
                    )}
                </div>

                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="relative w-full xl:max-w-md">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Локомотив, поезд, плечо, машинист"
                            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        />
                    </div>

                    <div className="flex flex-1 flex-col gap-3 md:flex-row md:flex-wrap xl:justify-end">
                        <select
                            value={shoulderFilter}
                            onChange={(event) => setShoulderFilter(event.target.value)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        >
                            <option value="">Все плечи</option>
                            {shoulders.map((item) => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        >
                            <option value="">Все статусы</option>
                            <option value="ok">В норме</option>
                            <option value="warning">Внимание</option>
                            <option value="critical">Отклонение</option>
                            <option value="missing">Неполные данные</option>
                        </select>

                        <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                            <input
                                type="checkbox"
                                checked={onlyDeviation}
                                onChange={(event) => setOnlyDeviation(event.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            Только отклонения
                        </label>

                        <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                            <input
                                type="checkbox"
                                checked={onlyProblems}
                                onChange={(event) => setOnlyProblems(event.target.checked)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            Только проблемные
                        </label>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 shadow-sm">
                        <SlidersHorizontal size={12} />
                        sticky header + сортировка
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                        Норма: Идеал
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-sky-700">
                        Норма: среднее по плечу
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
                        Fallback: парк
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                        Машинист/явка: если нет в источнике, это помечается явно
                    </span>
                </div>
            </div>

            <div className="max-h-[640px] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-950 text-white">
                        <tr>
                            {[
                                { label: 'Плечо', key: 'shoulder' as SortKey },
                                { label: 'Номер локомотива', key: 'locomotiveNumber' as SortKey },
                                { label: 'Прибытие', key: 'arrivalSort' as SortKey },
                                { label: 'Машинист', key: 'locomotiveNumber' as SortKey },
                                { label: 'Машинист какого плеча', key: 'shoulder' as SortKey },
                                { label: 'Явка', key: 'reportingSort' as SortKey },
                                { label: 'Отправление', key: 'departureSort' as SortKey },
                                { label: 'Простой', key: 'dwellMinutes' as SortKey },
                                { label: 'Норма', key: 'normMinutes' as SortKey },
                                { label: 'Перепростой', key: 'overDwellMinutes' as SortKey },
                                { label: 'Оборотчик', key: 'departureSort' as SortKey },
                            ].map((column) => (
                                <th
                                    key={column.label}
                                    className="border-b border-white/10 px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-[0.18em]"
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleSort(column.key)}
                                        className="inline-flex items-center gap-1 text-left"
                                    >
                                        {column.label}
                                        <ArrowDownUp size={12} className="text-slate-400" />
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!filteredRows.length && (
                            <tr>
                                <td colSpan={11} className="px-4 py-16 text-center text-slate-500">
                                    <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                        <AlertTriangle size={28} className="text-slate-300" />
                                        <div className="text-base font-semibold text-slate-700">Строки не найдены</div>
                                        <div className="text-sm text-slate-500">
                                            Измени фильтры или диапазон ниток. Таблица живёт от того же набора данных, что и график сверху.
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {filteredRows.map((row) => {
                            const selected = isSelectedRow(row, selectedPair, selectedTrainNumber);
                            const meta = STATUS_META[row.status];
                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => onSelectRow?.(row)}
                                    className={`cursor-pointer border-b border-slate-100 transition ${selected ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : meta.row}`}
                                >
                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="min-w-[190px]">
                                            <div className="text-sm font-extrabold text-slate-900">
                                                {row.shoulder ?? 'Плечо не определено'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                Факт по нитке: {row.actualShoulders.length ? row.actualShoulders.join(' / ') : 'нет данных'}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.pill}`}>
                                                    {row.statusLabel}
                                                </span>
                                                {row.qualityFlags.includes('out_of_shoulder') && (
                                                    <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                                                        вне плеча
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="min-w-[156px]">
                                            <div className="font-mono text-base font-extrabold text-slate-900">
                                                {row.locomotiveNumber ?? '—'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {row.locomotiveSeries ?? 'серия не определена'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-400">
                                                {row.locomotiveDepot ?? 'депо не найдено'}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{row.arrival ?? '—'}</div>
                                        <div className="mt-1 text-xs text-slate-500">{sourceLabel(row.arrivalSource)}</div>
                                        <div className="mt-1 text-xs text-slate-400">№ {row.arrivalTrainNumber ?? '—'}</div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{row.driver ?? '—'}</div>
                                        <div className="mt-1 text-xs text-slate-500">нет прямого поля в XLSX</div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{row.driverShoulder ?? '—'}</div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {row.driverShoulder ? sourceLabel(row.driverShoulderSource) : 'источник не найден'}
                                        </div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{row.reporting ?? '—'}</div>
                                        <div className="mt-1 text-xs text-slate-500">{sourceLabel(row.reportingSource)}</div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{row.departure ?? '—'}</div>
                                        <div className="mt-1 text-xs text-slate-500">{sourceLabel(row.departureSource)}</div>
                                        <div className="mt-1 text-xs text-slate-400">№ {row.departureTrainNumber ?? '—'}</div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{formatMinutes(row.dwellMinutes)}</div>
                                        <div className="mt-1 text-xs text-slate-500">{row.stationSheet}</div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className="font-semibold text-slate-900">{formatMinutes(row.normMinutes)}</div>
                                        <div className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${normTone(row.normSource)}`}>
                                            {sourceLabel(row.normSource)}
                                        </div>
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className={`font-semibold ${(row.overDwellMinutes ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                                            {formatMinutes(row.overDwellMinutes)}
                                        </div>
                                        {(row.overDwellMinutes ?? 0) > 0 && (
                                            <div className="mt-1 text-xs text-rose-600">выше нормы</div>
                                        )}
                                    </td>

                                    <td className="border-b border-slate-100 px-4 py-4 align-top">
                                        <div className={row.isTurner ? 'badge-green' : 'badge-gray'}>
                                            {row.isTurner ? 'Да' : 'Нет'}
                                        </div>
                                        {!!row.issues.length && (
                                            <div className="mt-2 max-w-[210px] text-xs leading-5 text-slate-500">
                                                {row.issues[0]}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
