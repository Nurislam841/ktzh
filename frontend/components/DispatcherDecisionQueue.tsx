'use client';

import { AlertTriangle, Clock3, ShieldAlert, Train, Wrench } from 'lucide-react';

type DecisionItem = {
    allocationId: string;
    trainNumber: string;
    priority: string;
    plannedDeparture: string;
    delayMinutes: number;
    severity: 'info' | 'warning' | 'critical';
    summary: string;
    track?: { id: string; name: string } | null;
    locomotive?: { id: string; label: string; status: string; availableFrom: string } | null;
    crew?: { id: string; status: string; availableFrom: string; requiredNoticeMinutes: number } | null;
    crewCallWindow: {
        mustReportAt: string;
        locomotiveAcceptanceAt: string;
        minutesUntilCall: number;
    };
    recommendations: string[];
    deadlines: Array<{ label: string; at: string; status: 'ok' | 'warning' | 'critical' }>;
};

function severityMeta(severity: DecisionItem['severity']) {
    if (severity === 'critical') {
        return {
            badge: 'badge-red',
            label: 'Срочно',
            icon: ShieldAlert,
        };
    }
    if (severity === 'warning') {
        return {
            badge: 'badge-yellow',
            label: 'Контроль',
            icon: AlertTriangle,
        };
    }
    return {
        badge: 'badge-blue',
        label: 'Планово',
        icon: Clock3,
    };
}

function deadlineBadge(status: 'ok' | 'warning' | 'critical') {
    if (status === 'critical') return 'badge-red';
    if (status === 'warning') return 'badge-yellow';
    return 'badge-green';
}

export default function DispatcherDecisionQueue({ items }: { items: DecisionItem[] }) {
    if (!items?.length) {
        return (
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-2">
                    <Train size={16} className="text-sky-600" />
                    <h2 className="font-semibold text-gray-900">Очередь решений диспетчера</h2>
                </div>
                <p className="text-sm text-gray-500">Критичных решений в текущем окне нет. Контролируйте окна T-2/T-1 по бригадам и локомотивам.</p>
            </div>
        );
    }

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h2 className="font-semibold text-gray-900">Очередь решений диспетчера</h2>
                    <p className="text-sm text-gray-500">Что нужно решить по ближайшим отправлениям в текущем окне планирования.</p>
                </div>
                <span className="badge-gray">{items.length} задач</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {items.slice(0, 6).map((item) => {
                    const meta = severityMeta(item.severity);
                    const Icon = meta.icon;
                    return (
                        <div key={item.allocationId} className="card">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg text-sm">
                                            #{item.trainNumber}
                                        </span>
                                        <span className={meta.badge}>
                                            <Icon size={10} className="inline -mt-0.5 mr-0.5" />
                                            {meta.label}
                                        </span>
                                    </div>
                                    <p className="font-semibold text-gray-900 text-sm">{item.summary}</p>
                                </div>
                                <div className="text-right text-xs text-gray-500">
                                    <div>План</div>
                                    <div className="font-semibold text-gray-800">
                                        {new Date(item.plannedDeparture).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                    <div className="text-gray-400 mb-0.5">Путь</div>
                                    <div className="font-medium text-gray-700">{item.track?.name ?? 'Не назначен'}</div>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                    <div className="text-gray-400 mb-0.5">Локомотив</div>
                                    <div className="font-medium text-gray-700">{item.locomotive?.label ?? 'Не назначен'}</div>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                    <div className="text-gray-400 mb-0.5">Бригада</div>
                                    <div className="font-medium text-gray-700">{item.crew?.id?.slice(0, 8) ?? 'Не назначена'}</div>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-2">
                                    <div className="text-gray-400 mb-0.5">Задержка</div>
                                    <div className="font-medium text-gray-700">{item.delayMinutes > 0 ? `+${item.delayMinutes} мин` : 'По графику'}</div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-3">
                                {item.deadlines.map((deadline) => (
                                    <span key={deadline.label} className={deadlineBadge(deadline.status)}>
                                        <Clock3 size={10} className="inline -mt-0.5 mr-0.5" />
                                        {deadline.label}: {new Date(deadline.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                ))}
                            </div>

                            <div className="space-y-1.5">
                                {item.recommendations.slice(0, 2).map((recommendation) => (
                                    <div key={recommendation} className="flex gap-2 text-sm text-gray-600">
                                        <Wrench size={14} className="text-sky-600 flex-shrink-0 mt-0.5" />
                                        <span>{recommendation}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
