'use client';

import { useState } from 'react';
import { BellRing, CheckCircle2, Clock3, UserRound, XCircle } from 'lucide-react';
import { updateCrewCallStatus } from '../lib/api';

type CrewCallItem = {
    id: string;
    status: 'PLANNED' | 'NOTIFIED' | 'CONFIRMED' | 'MISSED' | 'CANCELLED';
    notes: string;
    mustReportAt: string;
    acceptedLocomotiveAt: string;
    crew: {
        id: string;
        status: string;
        availableFrom: string;
        requiredNoticeMinutes: number;
    } | null;
    trainRun: {
        id: string;
        number: string;
        priority: string;
        scheduledDeparture: string;
        operationScenario?: 'FORMATION' | 'TRANSIT';
        requiresCrewChange?: boolean;
        requiresLocoChange?: boolean;
    } | null;
};

function badgeForStatus(status: CrewCallItem['status']) {
    if (status === 'CONFIRMED') return 'badge-green';
    if (status === 'MISSED' || status === 'CANCELLED') return 'badge-red';
    if (status === 'NOTIFIED') return 'badge-blue';
    return 'badge-yellow';
}

function labelForStatus(status: CrewCallItem['status']) {
    const map = {
        PLANNED: 'Запланирован',
        NOTIFIED: 'Уведомлена',
        CONFIRMED: 'Подтверждена',
        MISSED: 'Срыв',
        CANCELLED: 'Отменен',
    };
    return map[status];
}

export default function CrewCallBoard({
    items,
    onUpdated,
}: {
    items: CrewCallItem[];
    onUpdated?: () => Promise<void> | void;
}) {
    const [busyId, setBusyId] = useState<string | null>(null);

    if (!items?.length) {
        return (
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-2">
                    <BellRing size={16} className="text-sky-600" />
                    <h2 className="font-semibold text-gray-900">Вызовы бригад</h2>
                </div>
                <p className="text-sm text-gray-500">В текущем окне вызовов бригад не найдено.</p>
            </div>
        );
    }

    const handleStatus = async (id: string, status: CrewCallItem['status']) => {
        setBusyId(id);
        try {
            await updateCrewCallStatus(id, { status });
            await onUpdated?.();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="font-semibold text-gray-900">Вызовы бригад</h2>
                    <p className="text-sm text-gray-500">Контур T-2 часа и подтверждение явки локомотивных бригад.</p>
                </div>
                <span className="badge-gray">{items.length} вызовов</span>
            </div>

            <div className="space-y-3">
                {items.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-gray-100 p-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg text-sm">
                                        #{item.trainRun?.number ?? '—'}
                                    </span>
                                    <span className={badgeForStatus(item.status)}>{labelForStatus(item.status)}</span>
                                    {item.trainRun?.operationScenario && (
                                        <span className={item.trainRun.operationScenario === 'FORMATION' ? 'badge-blue' : 'badge-gray'}>
                                            {item.trainRun.operationScenario === 'FORMATION' ? 'Формирование' : 'Транзит'}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-600">{item.notes || 'Контроль вызова бригады по нормативу.'}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs min-w-[300px]">
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                    <div className="text-gray-400 mb-0.5">Явка T-2ч</div>
                                    <div className="font-medium text-gray-700">
                                        {new Date(item.mustReportAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                    <div className="text-gray-400 mb-0.5">Приемка T-1ч</div>
                                    <div className="font-medium text-gray-700">
                                        {new Date(item.acceptedLocomotiveAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2 col-span-2">
                                    <div className="text-gray-400 mb-0.5">Бригада</div>
                                    <div className="font-medium text-gray-700 flex items-center gap-2">
                                        <UserRound size={12} className="text-gray-400" />
                                        {item.crew?.id?.slice(0, 8) ?? 'Не назначена'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                            <button
                                disabled={busyId === item.id}
                                onClick={() => handleStatus(item.id, 'NOTIFIED')}
                                className="btn-secondary text-xs"
                            >
                                <BellRing size={12} /> Уведомить
                            </button>
                            <button
                                disabled={busyId === item.id}
                                onClick={() => handleStatus(item.id, 'CONFIRMED')}
                                className="btn-secondary text-xs"
                            >
                                <CheckCircle2 size={12} /> Подтвердить
                            </button>
                            <button
                                disabled={busyId === item.id}
                                onClick={() => handleStatus(item.id, 'MISSED')}
                                className="btn-secondary text-xs"
                            >
                                <XCircle size={12} /> Срыв
                            </button>
                            <span className="badge-gray">
                                <Clock3 size={10} className="inline -mt-0.5 mr-0.5" />
                                Отпр.: {item.trainRun ? new Date(item.trainRun.scheduledDeparture).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
