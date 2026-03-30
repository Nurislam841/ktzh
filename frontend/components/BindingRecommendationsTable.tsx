'use client';

import { ArrowRightLeft, ShieldAlert, Sparkles } from 'lucide-react';
import type { BindingIntelligenceRow } from '../lib/api';

function formatMinutes(value: number | null | undefined) {
    if (typeof value !== 'number') return '—';
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (!hours) return `${minutes}м`;
    return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
}

function statusChipClass(status: BindingIntelligenceRow['status']) {
    if (status === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (status === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'missing') return 'bg-slate-100 text-slate-600 border-slate-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function tractionLabel(value: BindingIntelligenceRow['tractionType']) {
    if (value === 'electric') return 'Электровоз';
    if (value === 'diesel') return 'Тепловоз';
    return 'Не определено';
}

export default function BindingRecommendationsTable({
    rows,
    selectedRowId,
    onSelectRow,
    onCreateBinding,
}: {
    rows: BindingIntelligenceRow[];
    selectedRowId?: string;
    onSelectRow?: (row: BindingIntelligenceRow) => void;
    onCreateBinding?: (row: BindingIntelligenceRow) => void;
}) {
    return (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        <Sparkles size={13} />
                        Рекомендации по подвязке
                    </div>
                    <h2 className="mt-2 text-xl font-black text-slate-950">Не ближайший поезд, а операционно лучший следующий поезд</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                        Скоринг учитывает тип тяги, сохранение плеча, маршрут, норматив простоя и риск увести локомотив с логичного оборота.
                    </p>
                </div>
            </div>

            <div className="max-h-[640px] overflow-auto">
                <table className="w-full min-w-[1180px] text-sm">
                    <thead className="sticky top-0 z-10 bg-white">
                        <tr className="border-b border-slate-100 text-left">
                            {['Локомотив', 'Тяга', 'Плечо', 'Прибытие', 'Простой', 'Норма', 'Перепростой', 'Лучший поезд', 'Ожидание', 'Решение'].map((label) => (
                                <th key={label} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const selected = row.id === selectedRowId;
                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => onSelectRow?.(row)}
                                    className={`cursor-pointer border-b border-slate-100 align-top transition ${selected ? 'bg-sky-50/60' : 'hover:bg-slate-50/80'}`}
                                >
                                    <td className="px-4 py-4">
                                        <div className="font-mono text-base font-black text-slate-950">{row.locomotiveNumber ?? '----'}</div>
                                        <div className="mt-1 text-xs text-slate-500">{row.locomotiveSeries ?? 'серия не найдена'}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-900">{tractionLabel(row.tractionType)}</div>
                                        <div className="mt-1 text-xs text-slate-500">{row.locomotiveDepot ?? 'депо не найдено'}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-900">{row.shoulder ?? 'Плечо не определено'}</div>
                                        <div className="mt-1 text-xs text-slate-500">{row.stationName}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-900">{row.arrival ?? '—'}</div>
                                        <div className="mt-1 text-xs text-slate-500">поезд №{row.arrivalTrainNumber ?? '—'}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-900">{formatMinutes(row.currentIdleMinutes)}</div>
                                        <div className="mt-1 text-xs text-slate-500">сейчас</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-900">{formatMinutes(row.normMinutes)}</div>
                                        <div className="mt-1 text-xs text-slate-500">допустимо</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className={`font-semibold ${(row.overDwellNowMinutes ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                                            {formatMinutes(row.overDwellNowMinutes)}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">на текущем срезе</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-900">
                                            {row.bestCandidate ? `№${row.bestCandidate.trainNumber}` : 'Нет кандидата'}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">{row.bestCandidate?.departureLabel ?? 'нет отправления'}</div>
                                        {row.bestCandidate && (
                                            <div className="mt-2 inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white">
                                                {row.bestCandidate.statusLabel}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-900">{formatMinutes(row.waitToBestMinutes)}</div>
                                        <div className="mt-1 text-xs text-slate-500">{row.recommendationBiasLabel}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-2">
                                            <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusChipClass(row.status)}`}>
                                                <ShieldAlert size={12} />
                                                {row.statusLabel}
                                            </span>
                                            <p className="max-w-[320px] text-xs leading-5 text-slate-500">{row.recommendationSummary}</p>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onCreateBinding?.(row);
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800"
                                                >
                                                    <ArrowRightLeft size={12} />
                                                    Создать подвязку
                                                </button>
                                            </div>
                                        </div>
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
