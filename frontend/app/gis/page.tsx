'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Filter, Map as MapIcon, RefreshCw, Search, Train } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import GituralLocomotiveTable, { type GituralLocomotiveTableRow } from '../../components/GituralLocomotiveTable';
import type { GisAtlasPayload } from '../../components/RailwayGISDashboard';
import { getGisAtlas } from '../../lib/api';

const DynamicRailwayGISDashboard = dynamic(
    () => import('../../components/RailwayGISDashboard'),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full min-h-[760px] w-full items-center justify-center rounded-[28px] border border-slate-200 bg-white">
                <div className="flex items-center gap-3 text-slate-500">
                    <RefreshCw size={18} className="animate-spin" />
                    Загрузка GIS-атласа...
                </div>
            </div>
        ),
    },
);

const SERVICE_DAY_START_MINUTES = 20 * 60;

function isWithinOperationalRange(row: GituralLocomotiveTableRow, fromTime: string, toTime: string) {
    if (!fromTime && !toTime) return true;

    const toOperationalMinute = (value: string) => {
        const [hh, mm] = value.split(':').map(Number);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
        const dayMinute = hh * 60 + mm;
        return dayMinute >= SERVICE_DAY_START_MINUTES
            ? dayMinute - SERVICE_DAY_START_MINUTES
            : dayMinute + (24 * 60 - SERVICE_DAY_START_MINUTES);
    };

    const fromMinute = fromTime ? toOperationalMinute(fromTime) : null;
    const toMinute = toTime ? toOperationalMinute(toTime) : null;
    const rowMinutes = [row.arrivalSort, row.reportingSort, row.departureSort]
        .filter((value): value is number => typeof value === 'number')
        .map((value) => ((value % (24 * 60)) + 24 * 60) % (24 * 60));

    if (!rowMinutes.length) return false;
    if (fromMinute === null && toMinute === null) return true;
    if (fromMinute !== null && toMinute === null) return rowMinutes.some((value) => value >= fromMinute);
    if (fromMinute === null && toMinute !== null) return rowMinutes.some((value) => value <= toMinute);
    if ((fromMinute ?? 0) <= (toMinute ?? 0)) {
        return rowMinutes.some((value) => value >= (fromMinute ?? 0) && value <= (toMinute ?? 0));
    }
    return rowMinutes.some((value) => value >= (fromMinute ?? 0) || value <= (toMinute ?? 0));
}

export default function GisPage() {
    const [stationId, setStationId] = useState('');
    const [atlas, setAtlas] = useState<GisAtlasPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedPair, setSelectedPair] = useState('');
    const [selectedTrainNumber, setSelectedTrainNumber] = useState('');

    const [shoulderFilter, setShoulderFilter] = useState('');
    const [stationFilter, setStationFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [locomotiveQuery, setLocomotiveQuery] = useState('');
    const [driverQuery, setDriverQuery] = useState('');
    const [dayFilter, setDayFilter] = useState('');
    const [eventTypeFilter, setEventTypeFilter] = useState('');
    const [fromTime, setFromTime] = useState('');
    const [toTime, setToTime] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const nextAtlas = await getGisAtlas();
            setAtlas(nextAtlas);
        } catch (nextError: any) {
            setError(nextError?.message ?? 'Не удалось загрузить GIS-данные');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const sid = new URLSearchParams(window.location.search).get('stationId') || window.localStorage.getItem('ktz_station_id') || '';
        setStationId(sid);
        load();
    }, [load]);

    const handleSelectRow = useCallback((row: GituralLocomotiveTableRow) => {
        if (row.pairKey) {
            setSelectedPair(row.pairKey);
        }
        setSelectedTrainNumber(row.departureTrainNumber ?? row.arrivalTrainNumber ?? '');
    }, []);

    const shoulders = useMemo(
        () => Array.from(new Set((atlas?.locomotiveTable ?? []).map((item) => item.shoulder).filter((item): item is string => Boolean(item)))).sort((a, b) => a.localeCompare(b, 'ru')),
        [atlas],
    );

    const stations = useMemo(
        () => (atlas?.stations ?? []).map((item) => item.name).sort((a, b) => a.localeCompare(b, 'ru')),
        [atlas],
    );

    const departments = useMemo(
        () => (atlas?.departments ?? []).map((item) => item.name).sort((a, b) => a.localeCompare(b, 'ru')),
        [atlas],
    );

    const serviceDays = useMemo(
        () => Array.from(new Set((atlas?.locomotiveTable ?? []).map((item) => item.day))).sort((a, b) => a - b),
        [atlas],
    );

    const eventTypes = useMemo(
        () => Array.from(new Set((atlas?.events ?? []).map((item) => item.eventType))).sort((a, b) => a.localeCompare(b, 'ru')),
        [atlas],
    );

    const filteredRows = useMemo(() => {
        const normalizedLoco = locomotiveQuery.trim().toLowerCase();
        const normalizedDriver = driverQuery.trim().toLowerCase();

        return (atlas?.locomotiveTable ?? []).filter((row) => {
            if (shoulderFilter && row.shoulder !== shoulderFilter) return false;
            if (statusFilter && row.status !== statusFilter) return false;
            if (dayFilter && row.day !== Number(dayFilter)) return false;
            if (!isWithinOperationalRange(row, fromTime, toTime)) return false;
            if (normalizedLoco) {
                const haystack = [row.locomotiveNumber, row.arrivalTrainNumber, row.departureTrainNumber, row.stationSheet]
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(normalizedLoco)) return false;
            }
            if (normalizedDriver) {
                const haystack = [row.driver, row.driverShoulder].join(' ').toLowerCase();
                if (!haystack.includes(normalizedDriver)) return false;
            }
            return true;
        });
    }, [atlas, dayFilter, driverQuery, fromTime, locomotiveQuery, shoulderFilter, statusFilter, toTime]);

    const rowIds = useMemo(() => new Set(filteredRows.map((row) => row.id)), [filteredRows]);

    const filteredEvents = useMemo(() => {
        return (atlas?.events ?? []).filter((eventPoint) => {
            if (!rowIds.has(eventPoint.row.id)) return false;
            if (stationFilter && eventPoint.stationName !== stationFilter) return false;
            if (departmentFilter && eventPoint.department !== departmentFilter) return false;
            if (eventTypeFilter && eventPoint.eventType !== eventTypeFilter) return false;
            return true;
        });
    }, [atlas, departmentFilter, eventTypeFilter, rowIds, stationFilter]);

    const eventStationNames = useMemo(() => new Set(filteredEvents.map((item) => item.stationName)), [filteredEvents]);

    const rowScopedFilteringActive = Boolean(
        shoulderFilter || statusFilter || locomotiveQuery || driverQuery || dayFilter || fromTime || toTime || eventTypeFilter,
    );

    const filteredStations = useMemo(() => {
        return (atlas?.stations ?? []).filter((station) => {
            if (stationFilter && station.name !== stationFilter) return false;
            if (departmentFilter && station.department !== departmentFilter) return false;
            if (shoulderFilter && !station.shoulders.includes(shoulderFilter)) return false;
            if (statusFilter && station.status !== statusFilter && !(statusFilter === 'missing' && station.totalRows === 0)) return false;

            if (!rowScopedFilteringActive) return true;
            if (station.totalRows === 0) return statusFilter === 'missing';
            return eventStationNames.has(station.name);
        });
    }, [atlas, departmentFilter, eventStationNames, rowScopedFilteringActive, shoulderFilter, stationFilter, statusFilter]);

    const filteredShoulders = useMemo(() => {
        const shoulderCounts = new Map<string, number>();
        filteredRows.forEach((row) => {
            if (!row.shoulder) return;
            shoulderCounts.set(row.shoulder, (shoulderCounts.get(row.shoulder) ?? 0) + 1);
        });

        return (atlas?.shoulders ?? []).filter((line) => {
            if (departmentFilter && line.department !== departmentFilter) return false;
            if (shoulderFilter && line.label !== shoulderFilter) return false;
            if (!rowScopedFilteringActive) return true;
            return (shoulderCounts.get(line.label) ?? 0) > 0;
        });
    }, [atlas, departmentFilter, filteredRows, rowScopedFilteringActive, shoulderFilter]);

    const filteredDepartments = useMemo(() => {
        const activeDepartmentNames = new Set(filteredEvents.map((item) => item.department).filter((item): item is string => Boolean(item)));
        return (atlas?.departments ?? []).filter((item) => {
            if (departmentFilter && item.name !== departmentFilter) return false;
            if (!rowScopedFilteringActive) return true;
            if (!item.totalRows) return true;
            return activeDepartmentNames.has(item.name);
        });
    }, [atlas, departmentFilter, filteredEvents, rowScopedFilteringActive]);

    const filteredAtlas = useMemo<GisAtlasPayload | null>(() => {
        if (!atlas) return null;
        return {
            ...atlas,
            summary: {
                totalStations: filteredStations.filter((item) => item.kind === 'station').length,
                totalNodes: filteredStations.filter((item) => item.kind === 'node').length,
                totalEvents: filteredEvents.length,
                criticalEvents: filteredEvents.filter((item) => item.status === 'critical').length,
                warningEvents: filteredEvents.filter((item) => item.status === 'warning').length,
                missingEvents: filteredEvents.filter((item) => item.status === 'missing').length,
                problematicStations: filteredStations.filter((item) => item.status === 'critical' || item.status === 'warning').length,
            },
            stations: filteredStations,
            events: filteredEvents,
            shoulders: filteredShoulders,
            departments: filteredDepartments,
            locomotiveTable: filteredRows,
        };
    }, [atlas, filteredDepartments, filteredEvents, filteredRows, filteredShoulders, filteredStations]);

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <div className="mx-auto flex h-full max-w-[1600px] flex-col p-6">
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-950">R-Атлас (GIS)</h1>
                            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                                Рабочая GIS-карта сети, узлов, station/event points и перепростоев локомотивов. Слой факта, подвязки и идеала собран в единый atlas-payload.
                            </p>
                        </div>
                        <button
                            onClick={() => load()}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            Обновить
                        </button>
                    </div>

                    <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-4">
                        <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                <MapIcon size={14} />
                                Объекты на карте
                            </div>
                            <div className="mt-2 text-3xl font-bold text-slate-950">{filteredAtlas?.summary.totalStations ?? 0}</div>
                        </div>
                        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-4 py-4 shadow-sm">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">
                                <AlertTriangle size={14} />
                                Перепростой
                            </div>
                            <div className="mt-2 text-3xl font-bold text-rose-700">{filteredAtlas?.summary.criticalEvents ?? 0}</div>
                        </div>
                        <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-4 shadow-sm">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-500">
                                <Activity size={14} />
                                Риск
                            </div>
                            <div className="mt-2 text-3xl font-bold text-amber-700">{filteredAtlas?.summary.warningEvents ?? 0}</div>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                <Train size={14} />
                                Табличных строк
                            </div>
                            <div className="mt-2 text-3xl font-bold text-slate-950">{filteredRows.length}</div>
                        </div>
                    </div>

                    <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                            <Filter size={14} />
                            Фильтры GIS
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <select value={shoulderFilter} onChange={(event) => setShoulderFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
                                <option value="">Все плечи</option>
                                {shoulders.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>

                            <select value={stationFilter} onChange={(event) => setStationFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
                                <option value="">Все станции</option>
                                {stations.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>

                            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
                                <option value="">Все отделения</option>
                                {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>

                            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
                                <option value="">Все статусы</option>
                                <option value="ok">Норма</option>
                                <option value="warning">Риск</option>
                                <option value="critical">Перепростой</option>
                                <option value="missing">Нет данных</option>
                            </select>

                            <select value={dayFilter} onChange={(event) => setDayFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
                                <option value="">Все сутки</option>
                                {serviceDays.map((item) => <option key={item} value={item}>{item} сутки</option>)}
                            </select>

                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={locomotiveQuery}
                                    onChange={(event) => setLocomotiveQuery(event.target.value)}
                                    placeholder="Локомотив / поезд"
                                    className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                                />
                            </div>

                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={driverQuery}
                                    onChange={(event) => setDriverQuery(event.target.value)}
                                    placeholder="Машинист"
                                    className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                                />
                            </div>

                            <select value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100">
                                <option value="">Все типы событий</option>
                                {eventTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>

                            <input
                                type="time"
                                value={fromTime}
                                onChange={(event) => setFromTime(event.target.value)}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                            />

                            <input
                                type="time"
                                value={toTime}
                                onChange={(event) => setToTime(event.target.value)}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {error}
                        </div>
                    )}

                    <div className="flex-1">
                        {loading || !filteredAtlas ? (
                            <div className="flex min-h-[760px] items-center justify-center rounded-[28px] border border-slate-200 bg-white text-slate-500 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <RefreshCw size={18} className="animate-spin" />
                                    Подготовка объектов карты...
                                </div>
                            </div>
                        ) : (
                            <DynamicRailwayGISDashboard
                                atlas={filteredAtlas}
                                selectedPair={selectedPair || undefined}
                                selectedTrainNumber={selectedTrainNumber || undefined}
                                onSelectRow={handleSelectRow}
                            />
                        )}
                    </div>

                    <GituralLocomotiveTable
                        rows={filteredRows}
                        selectedPair={selectedPair || undefined}
                        selectedTrainNumber={selectedTrainNumber || undefined}
                        onSelectRow={handleSelectRow}
                    />
                </div>
            </div>
        </div>
    );
}
