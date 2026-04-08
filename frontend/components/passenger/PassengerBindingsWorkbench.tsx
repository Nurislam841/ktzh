
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowRightLeft,
    CheckCircle2,
    Clock3,
    Link2,
    MapPinned,
    Search,
    Sparkles,
    Train,
    XCircle,
} from 'lucide-react';

type ScenarioMode = 'overlay' | 'base' | 'optimized';

const DAY = 24 * 60;
const SERVICE_DAY_START_MINUTES = 20 * 60;
const RESERVE_MINUTES = 30;

function normalize(value: string) {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function formatMinutes(value?: number | null) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return hours ? `${hours} ч ${String(minutes).padStart(2, '0')} мин` : `${minutes} мин`;
}

function operationalClockLabel(minute: number) {
    const normalizedMinute = ((minute % DAY) + DAY) % DAY;
    const absolute = (SERVICE_DAY_START_MINUTES + normalizedMinute) % DAY;
    return `${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function formatOperationalLabel(minute?: number | null) {
    if (typeof minute !== 'number' || Number.isNaN(minute)) return '—';
    const dayOffset = Math.floor(minute / DAY);
    return `D+${dayOffset} ${operationalClockLabel(minute)}`;
}

function toOperationalNowMinute(date = new Date()) {
    const absolute = date.getHours() * 60 + date.getMinutes();
    return absolute >= SERVICE_DAY_START_MINUTES
        ? absolute - SERVICE_DAY_START_MINUTES
        : absolute + (DAY - SERVICE_DAY_START_MINUTES);
}

function inferTraction(series?: string | null) {
    if (!series) return 'unknown';
    const value = series.toUpperCase();
    if (value.includes('ТЭ') || value.includes('TE') || value.includes('ДИЗ')) return 'diesel';
    if (value.includes('KZ4') || value.includes('ВЛ') || value.includes('Э') || value.includes('ЭП')) return 'electric';
    return 'mixed';
}

function getScenarioKey(scenarioMode: ScenarioMode) {
    return scenarioMode === 'base' ? 'base' : 'optimized';
}

function buildChainSnapshot(chain: any) {
    if (!chain) {
        return {
            status: 'Нет данных',
            statusKey: 'unavailable',
            location: '—',
            locationStation: null,
            currentTrain: null,
            releaseMinute: null,
            releaseLabel: '—',
            idleMinutes: null,
            nextTrain: null,
        };
    }

    const assignments = chain.assignments ?? [];
    const idleBlocks = chain.idleBlocks ?? [];
    const cursor = toOperationalNowMinute();
    const maxMinute = Math.max(
        0,
        ...assignments.map((item: any) => item.releaseOperationalMinute ?? 0),
        ...idleBlocks.map((item: any) => item.endMinute ?? 0),
    );
    const candidateMoments = Array.from({ length: Math.max(2, Math.ceil(maxMinute / DAY) + 2) }, (_, index) => cursor + index * DAY);

    const activeAssignment = assignments.find((item: any) =>
        candidateMoments.some((minute) =>
            typeof item.departureOperationalMinute === 'number' &&
            typeof item.releaseOperationalMinute === 'number' &&
            minute >= item.departureOperationalMinute &&
            minute <= item.releaseOperationalMinute,
        ),
    ) ?? null;

    const activeIdle = idleBlocks.find((item: any) =>
        candidateMoments.some((minute) =>
            typeof item.startMinute === 'number' &&
            typeof item.endMinute === 'number' &&
            minute >= item.startMinute &&
            minute <= item.endMinute,
        ),
    ) ?? null;

    if (activeAssignment) {
        const inRun = candidateMoments.some((minute) => minute <= activeAssignment.arrivalOperationalMinute);
        return {
            status: inRun ? 'В рейсе' : 'На обороте',
            statusKey: 'busy',
            location: inRun
                ? `${activeAssignment.originStation} → ${activeAssignment.destinationStation}`
                : activeAssignment.destinationStation,
            locationStation: inRun ? activeAssignment.originStation : activeAssignment.destinationStation,
            currentTrain: activeAssignment.trainNo,
            releaseMinute: activeAssignment.releaseOperationalMinute,
            releaseLabel: activeAssignment.releaseLabel,
            idleMinutes: null,
            nextTrain: null,
        };
    }

    if (activeIdle) {
        const nextAssignment = assignments.find((item: any) => item.assignmentId === activeIdle.nextAssignmentId) ?? null;
        const previousAssignment = assignments.find((item: any) => item.assignmentId === activeIdle.previousAssignmentId) ?? null;
        return {
            status: activeIdle.idleMinutes >= 180 ? 'Проблемный простой' : 'Простой',
            statusKey: activeIdle.idleMinutes >= 180 ? 'problem' : 'idle',
            location: nextAssignment?.originStation ?? previousAssignment?.destinationStation ?? chain.homeStation ?? '—',
            locationStation: nextAssignment?.originStation ?? previousAssignment?.destinationStation ?? chain.homeStation ?? null,
            currentTrain: null,
            releaseMinute: nextAssignment?.departureOperationalMinute ?? previousAssignment?.releaseOperationalMinute ?? null,
            releaseLabel: nextAssignment?.departureLabel ?? previousAssignment?.releaseLabel ?? '—',
            idleMinutes: activeIdle.idleMinutes,
            nextTrain: nextAssignment?.trainNo ?? null,
        };
    }

    const firstAssignment = assignments[0] ?? null;
    if (firstAssignment && cursor < firstAssignment.departureOperationalMinute) {
        return {
            status: 'Резерв',
            statusKey: 'reserve',
            location: chain.homeStation ?? firstAssignment.originStation,
            locationStation: chain.homeStation ?? firstAssignment.originStation,
            currentTrain: null,
            releaseMinute: firstAssignment.departureOperationalMinute,
            releaseLabel: firstAssignment.departureLabel,
            idleMinutes: null,
            nextTrain: firstAssignment.trainNo,
        };
    }

    const lastAssignment = assignments[assignments.length - 1] ?? null;
    return {
        status: 'Свободен',
        statusKey: 'free',
        location: lastAssignment?.destinationStation ?? chain.homeStation ?? '—',
        locationStation: lastAssignment?.destinationStation ?? chain.homeStation ?? null,
        currentTrain: null,
        releaseMinute: lastAssignment?.releaseOperationalMinute ?? null,
        releaseLabel: lastAssignment?.releaseLabel ?? '—',
        idleMinutes: null,
        nextTrain: null,
    };
}

function toneForStatus(statusKey: string) {
    if (statusKey === 'busy') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (statusKey === 'problem') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (statusKey === 'idle') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (statusKey === 'reserve') return 'bg-violet-50 text-violet-700 border-violet-200';
    if (statusKey === 'free') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
}

function toneForCandidate(kind: string) {
    if (kind === 'recommended') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (kind === 'possible') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (kind === 'conflict') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
}

function buildEligibleTrips({ pair, selectedLocomotive, scenarioMode, draftAssignments }: any) {
    const scenarioKey = getScenarioKey(scenarioMode);
    const chain = selectedLocomotive?.[scenarioKey] ?? null;
    const snapshot = buildChainSnapshot(chain);
    const rowByTrain = new Map((pair?.tableRows ?? []).map((row: any) => [row.trainNo, row]));
    const currentStationKey = normalize(snapshot.locationStation ?? '');
    const readyMinute = snapshot.releaseMinute ?? toOperationalNowMinute();
    const traction = inferTraction(chain?.series ?? selectedLocomotive?.series ?? null);

    return (pair?.trains ?? [])
        .map((trip: any) => {
            const row: any = rowByTrain.get(trip.trainNo) ?? null;
            const currentAssignment = scenarioKey === 'base' ? trip.baseAssignment : trip.optimizedAssignment;
            const draftedLocomotiveId = draftAssignments?.[trip.tripId] ?? null;
            const assignedLocomotiveId = draftedLocomotiveId ?? currentAssignment?.locomotiveId ?? null;
            const departureMinute = trip.departureOperationalMinute ?? currentAssignment?.departureOperationalMinute ?? null;
            const stationMatch = normalize(trip.originStation ?? '') === currentStationKey;
            const gap = typeof departureMinute === 'number' ? departureMinute - readyMinute : null;
            const alreadyOwned = assignedLocomotiveId === selectedLocomotive?.id;
            const occupiedByAnother = assignedLocomotiveId && assignedLocomotiveId !== selectedLocomotive?.id;
            const reserveOk = typeof gap === 'number' ? gap >= RESERVE_MINUTES : false;
            const closeGap = typeof gap === 'number' ? gap >= RESERVE_MINUTES && gap <= 240 : false;
            const impossibleByTime = typeof gap === 'number' ? gap < RESERVE_MINUTES : true;

            let kind = 'possible';
            let reason = 'Локомотив совместим и может быть рассмотрен для подвязки.';
            let score = 0;

            if (alreadyOwned) {
                kind = 'recommended';
                reason = draftedLocomotiveId
                    ? 'Это ручная draft-подвязка на этой странице.'
                    : 'В текущем сценарии этот поезд уже закреплен за выбранным локомотивом.';
                score = 120;
            } else if (occupiedByAnother) {
                kind = 'conflict';
                reason = `Поезд уже закреплен за ${currentAssignment?.locomotiveLabel ?? assignedLocomotiveId}.`;
                score = 20;
            } else if (impossibleByTime) {
                kind = 'impossible';
                reason = 'Не хватает технологического резерва перед отправлением.';
                score = -50;
            } else if (!stationMatch) {
                kind = 'conflict';
                reason = 'Станция освобождения локомотива не совпадает с точкой отправления поезда.';
                score = 30;
            } else if (closeGap) {
                kind = 'recommended';
                reason = 'Совпадает станция и сохраняется короткое непрерывное окно оборота.';
                score = 95;
            } else if (reserveOk) {
                kind = 'possible';
                reason = 'Назначение допустимо, но образует более длинное idle-окно.';
                score = 70;
            }

            if (traction === 'unknown') score -= 5;
            if (traction === 'mixed') score += 5;
            if (traction !== 'unknown' && traction !== 'mixed') score += 10;

            return {
                tripId: trip.tripId,
                trainNo: trip.trainNo,
                routeLabel: trip.routeLabel,
                originStation: trip.originStation,
                destinationStation: trip.destinationStation,
                departureMinute,
                departureLabel: trip.departureLabel,
                arrivalLabel: trip.arrivalLabel,
                durationMinutes: trip.durationMinutes,
                stationCount: trip.stationSequenceCount,
                currentAssignmentLabel: currentAssignment?.locomotiveLabel ?? null,
                assignedLocomotiveId,
                draftAssigned: Boolean(draftedLocomotiveId),
                stationMatch,
                gapMinutes: gap,
                kind,
                reason,
                score,
                baselineLabel: row?.base?.locomotiveLabel ?? '—',
                optimizedLabel: row?.optimized?.locomotiveLabel ?? '—',
            };
        })
        .sort((left: any, right: any) => right.score - left.score || (left.gapMinutes ?? 999999) - (right.gapMinutes ?? 999999));
}

export default function PassengerBindingsWorkbench({
    pair,
    locomotives,
    selectedLocomotiveId,
    selectedLocomotive,
    recommendations,
    scenarioMode,
    hrefForPage,
    onSelectLocomotive,
}: {
    pair: any;
    locomotives: any[];
    selectedLocomotiveId: string | null;
    selectedLocomotive: any;
    recommendations: Array<{ id: string; title: string; message: string }>;
    scenarioMode: ScenarioMode;
    hrefForPage: (page: 'graph' | 'bindings' | 'map', updates?: Record<string, string | null | undefined>) => string;
    onSelectLocomotive: (locomotiveId: string) => void;
}) {
    const scenarioKey = getScenarioKey(scenarioMode);
    const pairKey = pair?.pairKey ?? 'default';
    const storageKey = `ktz-binding-drafts:${pairKey}`;
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'free' | 'busy' | 'problem' | 'reserve' | 'idle'>('all');
    const [tractionFilter, setTractionFilter] = useState<'all' | 'electric' | 'diesel' | 'mixed' | 'unknown'>('all');
    const [draftAssignments, setDraftAssignments] = useState<Record<string, string>>({});
    const [selectedCandidateTripId, setSelectedCandidateTripId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(storageKey);
            setDraftAssignments(raw ? JSON.parse(raw) : {});
        } catch {
            setDraftAssignments({});
        }
    }, [storageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(storageKey, JSON.stringify(draftAssignments));
    }, [draftAssignments, storageKey]);

    const enrichedLocomotives = useMemo(() => {
        return (locomotives ?? []).map((row: any) => {
            const chain = row?.[scenarioKey === 'base' ? 'baseChain' : 'optimizedChain'] ?? null;
            const snapshot = buildChainSnapshot(chain);
            const eligible = buildEligibleTrips({
                pair,
                selectedLocomotive: {
                    id: row.id,
                    [scenarioKey]: chain,
                    series: row.series,
                },
                scenarioMode,
                draftAssignments,
            });
            const nextRecommended = eligible.find((item: any) => item.kind === 'recommended') ?? eligible.find((item: any) => item.kind === 'possible') ?? null;
            return {
                ...row,
                scenarioChain: chain,
                snapshot,
                traction: inferTraction(row.series),
                nextRecommended,
            };
        });
    }, [draftAssignments, locomotives, pair, scenarioKey, scenarioMode]);

    const filteredLocomotives = useMemo(() => {
        const needle = normalize(search);
        return enrichedLocomotives.filter((row: any) => {
            const matchesSearch = !needle || normalize([
                row.label,
                row.series,
                row.number,
                row.depot,
                row.homeStation,
                row.snapshot?.location,
                row.snapshot?.currentTrain,
            ].filter(Boolean).join(' ')).includes(needle);
            const matchesStatus = statusFilter === 'all' || row.snapshot?.statusKey === statusFilter;
            const matchesTraction = tractionFilter === 'all' || row.traction === tractionFilter;
            return matchesSearch && matchesStatus && matchesTraction;
        });
    }, [enrichedLocomotives, search, statusFilter, tractionFilter]);

    const activeLocomotive = useMemo(() => {
        const current = enrichedLocomotives.find((row: any) => row.id === selectedLocomotiveId);
        return current ?? filteredLocomotives[0] ?? enrichedLocomotives[0] ?? null;
    }, [enrichedLocomotives, filteredLocomotives, selectedLocomotiveId]);

    useEffect(() => {
        if (activeLocomotive && activeLocomotive.id !== selectedLocomotiveId) {
            onSelectLocomotive(activeLocomotive.id);
        }
    }, [activeLocomotive, onSelectLocomotive, selectedLocomotiveId]);

    const activeSelectedLocomotive = useMemo(() => {
        if (!activeLocomotive) return null;
        if (selectedLocomotive?.id === activeLocomotive.id) return selectedLocomotive;
        return {
            id: activeLocomotive.id,
            base: activeLocomotive.baseChain ?? null,
            optimized: activeLocomotive.optimizedChain ?? null,
            series: activeLocomotive.series,
        };
    }, [activeLocomotive, selectedLocomotive]);

    const eligibleTrips = useMemo(() => buildEligibleTrips({
        pair,
        selectedLocomotive: activeSelectedLocomotive,
        scenarioMode,
        draftAssignments,
    }), [activeSelectedLocomotive, draftAssignments, pair, scenarioMode]);

    useEffect(() => {
        if (!eligibleTrips.length) {
            setSelectedCandidateTripId(null);
            return;
        }
        if (!selectedCandidateTripId || !eligibleTrips.some((trip: any) => trip.tripId === selectedCandidateTripId)) {
            setSelectedCandidateTripId(eligibleTrips[0].tripId);
        }
    }, [eligibleTrips, selectedCandidateTripId]);

    const selectedCandidate = eligibleTrips.find((trip: any) => trip.tripId === selectedCandidateTripId) ?? null;
    const currentChain = activeSelectedLocomotive?.[scenarioKey] ?? null;
    const baseChain = activeSelectedLocomotive?.base ?? null;
    const optimizedChain = activeSelectedLocomotive?.optimized ?? null;
    const currentSnapshot = buildChainSnapshot(currentChain);
    const baseSnapshot = buildChainSnapshot(baseChain);
    const optimizedSnapshot = buildChainSnapshot(optimizedChain);
    const assignments = currentChain?.assignments ?? [];
    const idleBlocks = currentChain?.idleBlocks ?? [];

    const summary = useMemo(() => {
        const free = enrichedLocomotives.filter((item: any) => item.snapshot?.statusKey === 'free').length;
        const busy = enrichedLocomotives.filter((item: any) => item.snapshot?.statusKey === 'busy').length;
        const problem = enrichedLocomotives.filter((item: any) => item.snapshot?.statusKey === 'problem').length;
        const total = enrichedLocomotives.length;
        return { total, free, busy, problem };
    }, [enrichedLocomotives]);

    const handleDraftAssign = () => {
        if (!activeLocomotive || !selectedCandidate || selectedCandidate.kind === 'impossible') return;
        setDraftAssignments((current) => ({ ...current, [selectedCandidate.tripId]: activeLocomotive.id }));
    };

    const handleClearDraft = () => {
        if (!selectedCandidate) return;
        setDraftAssignments((current) => {
            const next = { ...current };
            delete next[selectedCandidate.tripId];
            return next;
        });
    };

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.3fr)_380px]">
                <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">Локомотивный workbench</div>
                            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Полный список локомотивов и ручная подвязка</h2>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                                Страница отвечает на вопрос, какой локомотив куда можно и нужно подвязать прямо сейчас. Слева весь парк,
                                справа контекст выбранной единицы и допустимые поезда для подвязки.
                            </p>
                        </div>
                        <div className="grid min-w-[260px] grid-cols-2 gap-3 text-sm">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Парк</div>
                                <div className="mt-1 text-xl font-semibold text-slate-900">{summary.total}</div>
                            </div>
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-700">Свободны</div>
                                <div className="mt-1 text-xl font-semibold text-emerald-800">{summary.free}</div>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-sky-700">В работе</div>
                                <div className="mt-1 text-xl font-semibold text-sky-800">{summary.busy}</div>
                            </div>
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-rose-700">Проблемы</div>
                                <div className="mt-1 text-xl font-semibold text-rose-800">{summary.problem}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <label className="relative min-w-[260px] flex-1">
                            <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Поиск по номеру, серии, станции, поезду"
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
                            />
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value as any)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                        >
                            <option value="all">Все статусы</option>
                            <option value="free">Свободен</option>
                            <option value="busy">В работе</option>
                            <option value="idle">Простой</option>
                            <option value="problem">Проблемный idle</option>
                            <option value="reserve">Резерв</option>
                        </select>
                        <select
                            value={tractionFilter}
                            onChange={(event) => setTractionFilter(event.target.value as any)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
                        >
                            <option value="all">Вся тяга</option>
                            <option value="electric">Электровоз</option>
                            <option value="diesel">Тепловоз</option>
                            <option value="mixed">Смешанная</option>
                            <option value="unknown">Неопределено</option>
                        </select>
                    </div>
                </div>

                <aside className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Link2 size={16} className="text-sky-600" /> Inspector локомотива
                    </div>
                    {activeLocomotive ? (
                        <div className="mt-4 space-y-4">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Выбранный локомотив</div>
                                <div className="mt-2 text-2xl font-semibold text-slate-950">{activeLocomotive.label}</div>
                                <div className="mt-1 text-sm text-slate-500">{[activeLocomotive.series, activeLocomotive.depot, activeLocomotive.homeStation].filter(Boolean).join(' • ') || 'Детали по приписке не заданы'}</div>
                            </div>

                            <div className={`rounded-2xl border px-4 py-3 ${toneForStatus(currentSnapshot.statusKey)}`}>
                                <div className="text-[11px] uppercase tracking-[0.2em]">Текущее состояние</div>
                                <div className="mt-1 text-lg font-semibold">{currentSnapshot.status}</div>
                                <div className="mt-1 text-sm">{currentSnapshot.location}</div>
                                <div className="mt-2 text-xs opacity-80">Освобождение: {currentSnapshot.releaseLabel}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                    <div className="text-[11px] uppercase tracking-[0.2em] text-amber-700">Baseline</div>
                                    <div className="mt-1 font-semibold text-slate-900">{baseSnapshot.status}</div>
                                    <div className="mt-1 text-xs text-slate-600">Idle {formatMinutes(baseChain?.totalIdleMinutes)}</div>
                                </div>
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                    <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-700">Optimized</div>
                                    <div className="mt-1 font-semibold text-slate-900">{optimizedSnapshot.status}</div>
                                    <div className="mt-1 text-xs text-slate-600">Idle {formatMinutes(optimizedChain?.totalIdleMinutes)}</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Что рекомендуем</div>
                                <div className="mt-2 text-sm leading-6 text-slate-600">
                                    {selectedCandidate
                                        ? `${selectedCandidate.kind === 'recommended' ? 'Лучший вариант' : 'Кандидат'}: поезд ${selectedCandidate.trainNo} • ${selectedCandidate.originStation} → ${selectedCandidate.destinationStation}`
                                        : 'Выберите локомотив, чтобы увидеть допустимые поезда.'}
                                </div>
                                <div className="mt-2 text-xs text-slate-500">{selectedCandidate?.reason ?? 'Рекомендация появится после выбора локомотива и сценария.'}</div>
                            </div>

                            <div className="space-y-2">
                                <button
                                    onClick={handleDraftAssign}
                                    disabled={!selectedCandidate || selectedCandidate.kind === 'impossible'}
                                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                >
                                    <ArrowRightLeft size={16} /> Подвязать к поезду
                                </button>
                                <button
                                    onClick={handleClearDraft}
                                    disabled={!selectedCandidate || !draftAssignments[selectedCandidate.tripId]}
                                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                    <XCircle size={16} /> Снять draft-подвязку
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                    <Link href={selectedCandidate ? hrefForPage('graph', { trainNo: selectedCandidate.trainNo, scenario: scenarioKey }) : hrefForPage('graph')} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300">
                                        <Train size={15} /> К графику
                                    </Link>
                                    <Link href={selectedCandidate ? hrefForPage('map', { trainNo: selectedCandidate.trainNo, scenario: scenarioKey }) : hrefForPage('map')} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300">
                                        <MapPinned size={15} /> К карте
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">Локомотив не выбран.</div>
                    )}
                </aside>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_380px]">
                <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Рабочая таблица</div>
                            <h3 className="mt-1 text-lg font-semibold text-slate-950">Локомотивы, статусы и следующий рекомендованный поезд</h3>
                        </div>
                        <div className="text-xs text-slate-500">Сценарий: {scenarioKey}</div>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-[1.4rem] border border-slate-200">
                        <div className="max-h-[560px] overflow-auto">
                            <table className="min-w-full text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Локомотив</th>
                                        <th className="px-4 py-3">Тип</th>
                                        <th className="px-4 py-3">Станция</th>
                                        <th className="px-4 py-3">Статус</th>
                                        <th className="px-4 py-3">Текущий поезд</th>
                                        <th className="px-4 py-3">Освобождение</th>
                                        <th className="px-4 py-3">Idle</th>
                                        <th className="px-4 py-3">Следующий поезд</th>
                                        <th className="px-4 py-3">Baseline</th>
                                        <th className="px-4 py-3">Optimized</th>
                                        <th className="px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {filteredLocomotives.map((row: any) => {
                                        const active = row.id === activeLocomotive?.id;
                                        return (
                                            <tr
                                                key={row.id}
                                                onClick={() => onSelectLocomotive(row.id)}
                                                className={`cursor-pointer transition ${active ? 'bg-slate-950 text-white' : 'hover:bg-slate-50'}`}
                                            >
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold">{row.label}</div>
                                                    <div className={`mt-1 text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{[row.series, row.number, row.depot].filter(Boolean).join(' • ') || '—'}</div>
                                                </td>
                                                <td className="px-4 py-3 align-top">{row.traction}</td>
                                                <td className="px-4 py-3 align-top">{row.snapshot.locationStation ?? row.homeStation ?? '—'}</td>
                                                <td className="px-4 py-3 align-top">
                                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-white/20 bg-white/10 text-white' : toneForStatus(row.snapshot.statusKey)}`}>
                                                        {row.snapshot.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 align-top">{row.snapshot.currentTrain ? `№${row.snapshot.currentTrain}` : '—'}</td>
                                                <td className="px-4 py-3 align-top">{row.snapshot.releaseLabel}</td>
                                                <td className="px-4 py-3 align-top">{row.snapshot.idleMinutes ? formatMinutes(row.snapshot.idleMinutes) : '—'}</td>
                                                <td className="px-4 py-3 align-top">{row.nextRecommended ? `№${row.nextRecommended.trainNo}` : '—'}</td>
                                                <td className="px-4 py-3 align-top">{formatMinutes(row.baseTotalIdleMinutes)}</td>
                                                <td className="px-4 py-3 align-top">{formatMinutes(row.optimizedTotalIdleMinutes)}</td>
                                                <td className="px-4 py-3 align-top">
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onSelectLocomotive(row.id);
                                                        }}
                                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}
                                                    >
                                                        Выбрать
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!filteredLocomotives.length ? (
                                        <tr>
                                            <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">По текущим фильтрам локомотивы не найдены.</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <aside className="space-y-5">
                    <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <Sparkles size={16} className="text-emerald-600" /> Допустимые поезда для подвязки
                        </div>
                        <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                            {eligibleTrips.map((trip: any) => {
                                const active = trip.tripId === selectedCandidateTripId;
                                return (
                                    <button
                                        key={trip.tripId}
                                        onClick={() => setSelectedCandidateTripId(trip.tripId)}
                                        className={`w-full rounded-[1.3rem] border px-4 py-3 text-left transition ${active ? 'border-slate-900 bg-slate-950 text-white' : `${toneForCandidate(trip.kind)} bg-white hover:border-slate-300`}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-semibold">Поезд {trip.trainNo}</div>
                                                <div className={`mt-1 text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{trip.originStation} → {trip.destinationStation}</div>
                                            </div>
                                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? 'border-white/15 bg-white/10 text-white' : toneForCandidate(trip.kind)}`}>{trip.kind}</span>
                                        </div>
                                        <div className={`mt-2 text-xs leading-5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>{trip.reason}</div>
                                        <div className={`mt-2 flex flex-wrap gap-2 text-[11px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                                            <span>{trip.departureLabel ?? formatOperationalLabel(trip.departureMinute)}</span>
                                            <span>{trip.gapMinutes != null ? `gap ${formatMinutes(trip.gapMinutes)}` : 'gap —'}</span>
                                            <span>{trip.currentAssignmentLabel ? `сейчас ${trip.currentAssignmentLabel}` : 'без текущей подвязки'}</span>
                                        </div>
                                    </button>
                                );
                            })}
                            {!eligibleTrips.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Для выбранного локомотива нет поездов в текущей паре.</div> : null}
                        </div>
                    </div>

                    <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <AlertTriangle size={16} className="text-amber-500" /> Рекомендации
                        </div>
                        <div className="mt-4 space-y-3">
                            {recommendations.slice(0, 3).map((item) => (
                                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="font-semibold text-slate-900">{item.title}</div>
                                    <div className="mt-1 text-sm leading-6 text-slate-600">{item.message}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Clock3 size={16} className="text-sky-600" /> Цепочка назначений и окна idle
                    </div>
                    <div className="mt-4 space-y-3">
                        {assignments.map((assignment: any) => (
                            <div key={assignment.assignmentId} className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-slate-900">Поезд {assignment.trainNo} • {assignment.originStation} → {assignment.destinationStation}</div>
                                        <div className="mt-1 text-sm text-slate-500">{assignment.departureLabel} → {assignment.arrivalLabel} • освобождение {assignment.releaseLabel}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link href={hrefForPage('graph', { trainNo: assignment.trainNo, scenario: scenarioKey })} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm">К графику</Link>
                                        <Link href={hrefForPage('map', { trainNo: assignment.trainNo, scenario: scenarioKey })} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">К карте</Link>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                                    <span>Idle before {assignment.idleBeforeLabel}</span>
                                    <span>{assignment.explanation?.[0] ?? 'Без дополнительного комментария.'}</span>
                                </div>
                            </div>
                        ))}
                        {!assignments.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">По выбранному сценарию у локомотива пока нет назначений.</div> : null}
                        {!!idleBlocks.length ? (
                            <div className="pt-2">
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Idle windows</div>
                                <div className="space-y-2">
                                    {idleBlocks.map((block: any, index: number) => (
                                        <div key={`${block.startLabel}-${index}`} className={`rounded-2xl border px-4 py-3 ${block.idleMinutes >= 180 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                                            <div className="font-semibold text-slate-900">{block.startLabel} → {block.endLabel}</div>
                                            <div className="mt-1 text-sm text-slate-600">Простой {formatMinutes(block.idleMinutes)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Train size={16} className="text-slate-700" /> Baseline vs optimized
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-[1.3rem] border border-amber-200 bg-amber-50 px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-700">Baseline chain</div>
                            <div className="mt-2 text-lg font-semibold text-slate-900">{baseSnapshot.status}</div>
                            <div className="mt-1 text-sm text-slate-600">{baseSnapshot.location}</div>
                            <div className="mt-3 space-y-1 text-sm text-slate-600">
                                <div>Освобождение: {baseSnapshot.releaseLabel}</div>
                                <div>Следующий поезд: {baseSnapshot.nextTrain ? `№${baseSnapshot.nextTrain}` : '—'}</div>
                                <div>Общий idle: {formatMinutes(baseChain?.totalIdleMinutes)}</div>
                                <div>Макс. idle: {formatMinutes(baseChain?.maxIdleMinutes)}</div>
                            </div>
                        </div>
                        <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-4 py-4">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-700">Optimized chain</div>
                            <div className="mt-2 text-lg font-semibold text-slate-900">{optimizedSnapshot.status}</div>
                            <div className="mt-1 text-sm text-slate-600">{optimizedSnapshot.location}</div>
                            <div className="mt-3 space-y-1 text-sm text-slate-600">
                                <div>Освобождение: {optimizedSnapshot.releaseLabel}</div>
                                <div>Следующий поезд: {optimizedSnapshot.nextTrain ? `№${optimizedSnapshot.nextTrain}` : '—'}</div>
                                <div>Общий idle: {formatMinutes(optimizedChain?.totalIdleMinutes)}</div>
                                <div>Макс. idle: {formatMinutes(optimizedChain?.maxIdleMinutes)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            {(optimizedChain?.totalIdleMinutes ?? 0) < (baseChain?.totalIdleMinutes ?? 0) ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-amber-500" />}
                            Эффект по выбранному локомотиву
                        </div>
                        {(optimizedChain?.totalIdleMinutes ?? 0) < (baseChain?.totalIdleMinutes ?? 0)
                            ? `Optimized уменьшает idle на ${formatMinutes((baseChain?.totalIdleMinutes ?? 0) - (optimizedChain?.totalIdleMinutes ?? 0))} и сохраняет более непрерывную цепочку оборота.`
                            : 'Для этого локомотива optimizer не дал лучшего результата, поэтому безопасный baseline сохранился без лишних перестановок.'}
                    </div>
                </div>
            </section>
        </div>
    );
}
