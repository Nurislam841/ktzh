import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Sparkles, X } from 'lucide-react';
import { createBinding, getStations, type BindingIntelligenceRow, type BindingRecommendationCandidate } from '../lib/api';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    periodId: string;
    initialStationId: string;
    intelligenceRows: BindingIntelligenceRow[];
    initialRow?: BindingIntelligenceRow | null;
}

function formatMinutes(value: number | null | undefined) {
    if (typeof value !== 'number') return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (!hours) return `${minutes}м`;
    return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
}

function tractionLabel(value: BindingIntelligenceRow['tractionType']) {
    if (value === 'electric') return 'Электровоз';
    if (value === 'diesel') return 'Тепловоз';
    return 'Тяга не определена';
}

function buildIso(periodId: string, day: number | null | undefined, time: string | null | undefined) {
    if (!periodId || typeof day !== 'number' || !time) return null;
    const dayString = String(day).padStart(2, '0');
    const localValue = `${periodId}-${dayString}T${time}:00`;
    const date = new Date(localValue);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dedupeCandidates(row: BindingIntelligenceRow | null) {
    if (!row) return [] as BindingRecommendationCandidate[];
    const map = new Map<string, BindingRecommendationCandidate>();
    [row.bestCandidate, row.plannedCandidate, ...row.alternatives].forEach((item) => {
        if (!item) return;
        map.set(item.trainNumber, item);
    });
    return Array.from(map.values()).sort((left, right) => right.score - left.score);
}

export default function CreateBindingModal({
    isOpen,
    onClose,
    onSuccess,
    periodId,
    initialStationId,
    intelligenceRows,
    initialRow,
}: Props) {
    const [stations, setStations] = useState<any[]>([]);
    const [stationId, setStationId] = useState(initialStationId);
    const [locomotiveNumber, setLocomotiveNumber] = useState('');
    const [selectedTrainNumber, setSelectedTrainNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setStationId(initialStationId || '');
        setLocomotiveNumber(initialRow?.locomotiveNumber ?? '');
        setSelectedTrainNumber(initialRow?.bestCandidate?.trainNumber ?? '');
        setError('');

        getStations()
            .then((response) => {
                setStations(response.stations);
                if (initialStationId && response.stations.some((station: any) => station.id === initialStationId)) {
                    setStationId(initialStationId);
                } else if (response.stations[0]?.id) {
                    setStationId(response.stations[0].id);
                }
            })
            .catch((reason) => console.error(reason));
    }, [initialRow, initialStationId, isOpen]);

    const locomotiveNumberError = useMemo(() => {
        if (!locomotiveNumber) return 'Введите номер локомотива';
        if (!/^\d{4}$/.test(locomotiveNumber)) return 'Допустим только 4-значный номер, например 0841';
        return '';
    }, [locomotiveNumber]);

    const activeRow = useMemo(() => {
        if (!/^\d{4}$/.test(locomotiveNumber)) return null;
        const exactMatches = intelligenceRows.filter((row) => row.locomotiveNumber === locomotiveNumber);
        if (!exactMatches.length) return null;
        return [...exactMatches].sort((left, right) => {
            const criticalWeight = (right.overDwellNowMinutes ?? 0) - (left.overDwellNowMinutes ?? 0);
            if (criticalWeight !== 0) return criticalWeight;
            return (right.bestCandidate?.score ?? -1) - (left.bestCandidate?.score ?? -1);
        })[0];
    }, [intelligenceRows, locomotiveNumber]);

    const candidates = useMemo(() => dedupeCandidates(activeRow), [activeRow]);

    useEffect(() => {
        if (!isOpen) return;
        if (!activeRow) {
            setSelectedTrainNumber('');
            return;
        }

        if (!selectedTrainNumber || !candidates.some((item) => item.trainNumber === selectedTrainNumber)) {
            setSelectedTrainNumber(activeRow.bestCandidate?.trainNumber ?? candidates[0]?.trainNumber ?? '');
        }
    }, [activeRow, candidates, isOpen, selectedTrainNumber]);

    const selectedCandidate = useMemo(
        () => candidates.find((item) => item.trainNumber === selectedTrainNumber) ?? null,
        [candidates, selectedTrainNumber],
    );

    const warning = useMemo(() => {
        if (!activeRow || !selectedCandidate || !activeRow.bestCandidate) return '';
        if (selectedCandidate.trainNumber === activeRow.bestCandidate.trainNumber) return '';
        if (selectedCandidate.status === 'forbidden') return 'Выбранный поезд системой помечен как неподходящий. Такая подвязка нарушает операционные ограничения.';
        if (selectedCandidate.status === 'undesirable') return 'Выбран компромиссный поезд. Он хуже лучшего кандидата по плечу, тяге или простою.';
        return 'Выбран не лучший кандидат. Система рекомендует другой поезд как более устойчивый по обороту.';
    }, [activeRow, selectedCandidate]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        if (locomotiveNumberError) {
            setError(locomotiveNumberError);
            return;
        }

        if (!stationId) {
            setError('Нужно выбрать станцию разворота');
            return;
        }

        if (!activeRow) {
            setError('По этому локомотиву нет реальной operational-строки в текущем срезе данных');
            return;
        }

        if (!activeRow.arrivalTrainNumber || !activeRow.arrivalTime || activeRow.arrivalDay === null) {
            setError('Для локомотива не найдено реальное прибытие, поэтому сохранить подвязку нельзя');
            return;
        }

        if (!selectedCandidate || selectedCandidate.departureDay === null || !selectedCandidate.departureTime) {
            setError('Нужно выбрать допустимый следующий поезд');
            return;
        }

        const arrivalDt = buildIso(periodId, activeRow.arrivalDay, activeRow.arrivalTime);
        const departureDt = buildIso(periodId, selectedCandidate.departureDay, selectedCandidate.departureTime);

        if (!arrivalDt || !departureDt) {
            setError('Не удалось собрать дату прибытия или отправления из operational-данных');
            return;
        }

        setLoading(true);
        try {
            await createBinding({
                periodId,
                turnaroundStationId: stationId,
                arrivalTrainNumber: activeRow.arrivalTrainNumber,
                arrivalDt,
                departureTrainNumber: selectedCandidate.trainNumber,
                departureDt,
                locomotiveNumber,
                locomotiveSeries: activeRow.locomotiveSeries ?? undefined,
                locomotiveDepot: activeRow.locomotiveDepot ?? undefined,
                tractionType: activeRow.tractionType,
            });
            onSuccess();
            onClose();
        } catch (reason: any) {
            setError(reason.message || 'Ошибка при сохранении подвязки');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_35px_90px_rgba(15,23,42,0.28)]">
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Новая подвязка</div>
                        <h2 className="mt-2 text-2xl font-black text-slate-950">Подбор локомотива под следующий поезд</h2>
                        <p className="mt-1 text-sm text-slate-500">Период: {periodId}. Сначала локомотив, затем ranked-кандидат на отправление.</p>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-5">
                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {warning && (
                        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                            <Info size={16} className="mt-0.5 shrink-0" />
                            <span>{warning}</span>
                        </div>
                    )}

                    <form id="binding-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Станция разворота</label>
                                <select
                                    value={stationId}
                                    onChange={(event) => setStationId(event.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none ring-sky-200 transition focus:ring-2"
                                >
                                    <option value="">Выберите станцию...</option>
                                    {stations.map((station) => (
                                        <option key={station.id} value={station.id}>{station.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Номер локомотива</label>
                                <input
                                    value={locomotiveNumber}
                                    onChange={(event) => setLocomotiveNumber(event.target.value.replace(/\D/g, '').slice(0, 4))}
                                    placeholder="0841"
                                    className={`w-full rounded-2xl border bg-white px-4 py-3 font-mono text-lg font-black text-slate-950 outline-none transition focus:ring-2 ${locomotiveNumberError ? 'border-rose-200 ring-rose-100' : 'border-slate-200 ring-sky-200'}`}
                                />
                                <div className={`mt-1 text-xs ${locomotiveNumberError ? 'text-rose-600' : 'text-slate-400'}`}>
                                    {locomotiveNumberError || 'Backend тоже проверит, что номер состоит ровно из 4 цифр.'}
                                </div>
                            </div>

                            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Статус локомотива</div>
                                {activeRow ? (
                                    <div className="space-y-3">
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{activeRow.locomotiveNumber}</span>
                                            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500">{activeRow.locomotiveSeries ?? 'серия не найдена'}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <div className="text-xs text-slate-400">Тип тяги</div>
                                                <div className="font-semibold text-slate-900">{tractionLabel(activeRow.tractionType)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Плечо</div>
                                                <div className="font-semibold text-slate-900">{activeRow.shoulder ?? 'не определено'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Прибыл</div>
                                                <div className="font-semibold text-slate-900">{activeRow.arrival ?? '—'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Свободен</div>
                                                <div className="font-semibold text-slate-900">{formatMinutes(activeRow.currentIdleMinutes)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Норма</div>
                                                <div className="font-semibold text-slate-900">{formatMinutes(activeRow.normMinutes)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-400">Перепростой</div>
                                                <div className={`font-semibold ${(activeRow.overDwellNowMinutes ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                                                    {formatMinutes(activeRow.overDwellNowMinutes)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-700">
                                            {activeRow.recommendationSummary}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-3 text-sm leading-6 text-slate-500">
                                        В текущем срезе не найден operational-ряд для этого локомотива. Сначала введи 4-значный номер, который есть в реальных данных страницы.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4">
                                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                    <Sparkles size={13} />
                                    Ranked-кандидаты
                                </div>
                                <h3 className="mt-2 text-lg font-black text-slate-950">Лучший следующий поезд и объяснение выбора</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                    Система ранжирует поезда по типу тяги, сохранению плеча, маршруту, ожиданию и риску перепростоя.
                                </p>
                            </div>

                            <div className="space-y-3">
                                {candidates.length === 0 && (
                                    <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                                        По этому локомотиву пока нет допустимых кандидатов на следующий поезд.
                                    </div>
                                )}

                                {candidates.map((candidate) => {
                                    const selected = candidate.trainNumber === selectedTrainNumber;
                                    const isBest = candidate.trainNumber === activeRow?.bestCandidate?.trainNumber;
                                    const badgeClass =
                                        candidate.status === 'recommended'
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : candidate.status === 'acceptable'
                                                ? 'bg-sky-50 text-sky-700'
                                                : candidate.status === 'undesirable'
                                                    ? 'bg-amber-50 text-amber-700'
                                                    : 'bg-rose-50 text-rose-700';

                                    return (
                                        <button
                                            key={candidate.trainNumber}
                                            type="button"
                                            onClick={() => setSelectedTrainNumber(candidate.trainNumber)}
                                            className={`w-full rounded-[24px] border px-5 py-4 text-left transition ${selected ? 'border-sky-300 bg-sky-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                        >
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-mono text-lg font-black text-slate-950">№{candidate.trainNumber}</span>
                                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}>{candidate.statusLabel}</span>
                                                        {isBest && (
                                                            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white">Лучший кандидат</span>
                                                        )}
                                                    </div>
                                                    <div className="mt-2 text-sm font-semibold text-slate-900">{candidate.routeName ?? 'Маршрут не указан'}</div>
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        Отправление: {candidate.departureLabel ?? '—'} · {candidate.shoulderLabel ?? 'плечо не определено'}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-3 gap-3 text-sm lg:min-w-[280px]">
                                                    <div>
                                                        <div className="text-xs text-slate-400">Score</div>
                                                        <div className="font-black text-slate-950">{Math.round(candidate.score)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-slate-400">Ждать</div>
                                                        <div className="font-black text-slate-950">{formatMinutes(candidate.waitMinutes)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-slate-400">Перепростой</div>
                                                        <div className={`font-black ${(candidate.projectedOverDwellMinutes ?? 0) > 0 ? 'text-rose-700' : 'text-slate-950'}`}>
                                                            {formatMinutes(candidate.projectedOverDwellMinutes)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {candidate.reasons.slice(0, 3).map((reason) => (
                                                    <span key={reason} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                        {reason}
                                                    </span>
                                                ))}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {selectedCandidate && (
                                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
                                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                        <CheckCircle2 size={13} />
                                        Расшифровка выбора
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                        {selectedCandidate.reasons.map((reason) => (
                                            <div key={reason} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                                                {reason}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                        Отмена
                    </button>
                    <button type="submit" form="binding-form" disabled={loading} className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                        {loading ? 'Сохраняю подвязку...' : 'Добавить подвязку'}
                    </button>
                </div>
            </div>
        </div>
    );
}
