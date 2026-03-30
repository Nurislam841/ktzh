'use client';

import { Clock3, Gauge, PauseCircle, Route } from 'lucide-react';
import type { BindingIntelligenceRow } from '../lib/api';

function formatMinutes(value: number | null | undefined) {
    if (typeof value !== 'number') return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (!hours) return `${minutes}м`;
    return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
}

function barClass(row: BindingIntelligenceRow) {
    if ((row.overDwellNowMinutes ?? 0) > 0) return 'from-rose-500 to-rose-600';
    if ((row.canWaitMinutes ?? 0) <= 30) return 'from-amber-400 to-amber-500';
    return 'from-emerald-400 to-emerald-500';
}

export default function BindingDwellBoard({
    rows,
    selectedRowId,
    onSelectRow,
}: {
    rows: BindingIntelligenceRow[];
    selectedRowId?: string;
    onSelectRow?: (row: BindingIntelligenceRow) => void;
}) {
    const visibleRows = rows.slice(0, 10);
    const scaleMax = Math.max(
        180,
        ...visibleRows.map((row) => Math.max(row.currentIdleMinutes ?? 0, row.waitToBestMinutes ?? 0, row.normMinutes ?? 0)),
    );

    return (
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        <Gauge size={13} />
                        График простоев локомотивов
                    </div>
                    <h2 className="mt-2 text-xl font-black text-slate-950">Кого можно подвязать сейчас, а кого лучше подержать под правильный поезд</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                        Горизонтальная шкала показывает текущий простой, норматив и точку лучшего следующего поезда. Красный цвет означает выход за норму, жёлтый — близость к риску.
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    Масштаб шкалы: до {formatMinutes(scaleMax)}
                </div>
            </div>

            <div className="space-y-3 px-4 py-4">
                {visibleRows.map((row) => {
                    const currentWidth = `${Math.min(((row.currentIdleMinutes ?? 0) / scaleMax) * 100, 100)}%`;
                    const normWidth = `${Math.min(((row.normMinutes ?? 0) / scaleMax) * 100, 100)}%`;
                    const bestLeft = `${Math.min(((row.waitToBestMinutes ?? 0) / scaleMax) * 100, 100)}%`;
                    const selected = row.id === selectedRowId;

                    return (
                        <button
                            key={row.id}
                            type="button"
                            onClick={() => onSelectRow?.(row)}
                            className={`grid w-full grid-cols-1 gap-4 rounded-[24px] border px-4 py-4 text-left transition lg:grid-cols-[280px_minmax(0,1fr)_220px] ${selected ? 'border-sky-300 bg-sky-50/50 shadow-sm' : 'border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-white'}`}
                        >
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-slate-950 px-2.5 py-1 font-mono text-xs font-bold text-white">
                                        {row.locomotiveNumber ?? '----'}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                        {row.locomotiveSeries ?? 'Серия не найдена'}
                                    </span>
                                </div>
                                <div className="mt-3 text-sm font-bold text-slate-900">{row.shoulder ?? 'Плечо не определено'}</div>
                                <div className="mt-1 text-xs text-slate-500">{row.stationName} · {row.recommendationBiasLabel}</div>
                            </div>

                            <div>
                                <div className="relative h-12 rounded-2xl border border-slate-200 bg-[#07111f] px-3">
                                    <div className="absolute inset-y-2 left-3 right-3 rounded-full border border-dashed border-cyan-400/20" />
                                    <div className="absolute left-3 top-1/2 h-4 -translate-y-1/2 rounded-full bg-sky-400/20" style={{ width: normWidth }} />
                                    <div className={`absolute left-3 top-1/2 h-4 -translate-y-1/2 rounded-full bg-gradient-to-r ${barClass(row)}`} style={{ width: currentWidth }} />
                                    {row.waitToBestMinutes !== null && (
                                        <div className="absolute top-1/2 h-8 w-[2px] -translate-y-1/2 bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.65)]" style={{ left: `calc(0.75rem + ${bestLeft})` }} />
                                    )}
                                    <div className="absolute left-3 top-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Простой</div>
                                    <div className="absolute right-3 top-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Лучший поезд</div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                                    <span className="inline-flex items-center gap-1"><Clock3 size={12} /> сейчас {formatMinutes(row.currentIdleMinutes)}</span>
                                    <span className="inline-flex items-center gap-1"><PauseCircle size={12} /> норма {formatMinutes(row.normMinutes)}</span>
                                    <span className="inline-flex items-center gap-1"><Route size={12} /> ждать до лучшего {formatMinutes(row.waitToBestMinutes)}</span>
                                </div>
                            </div>

                            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Лучший кандидат</div>
                                <div className="text-lg font-black text-slate-950">
                                    {row.bestCandidate ? `№${row.bestCandidate.trainNumber}` : 'Нет поезда'}
                                </div>
                                <div className="text-xs text-slate-500">
                                    {row.bestCandidate?.departureLabel ?? 'Кандидат не найден'}
                                </div>
                                <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${row.bestCandidate?.status === 'recommended' ? 'bg-emerald-50 text-emerald-700' : row.bestCandidate?.status === 'acceptable' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
                                    {row.bestCandidate?.statusLabel ?? row.statusLabel}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
