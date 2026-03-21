'use client';

import { useState } from 'react';
import { Train, Search, ChevronDown, ChevronUp } from 'lucide-react';

type LocomotiveFleetWidgetProps = {
    title?: string;
    subtitle?: string;
    className?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
};

type StaticLocomotiveReference = {
    serviceCenter: string;
    to2MileageRange: string;
    to2DowntimeHours: string;
    serviceMileageRange: string;
    serviceDowntimeHours: string;
    supplyLeadHours?: string;
    serviceCenterByNumber?: Record<string, string>;
    supplyLeadHoursByNumber?: Record<string, string>;
};

type StaticLocomotiveBlock = {
    series: string;
    depot: string;
    start?: number;
    end?: number;
    number?: string;
};

type StaticLocomotiveRow = {
    id: string;
    series: string;
    number: string;
    depot: string;
    serviceCenter: string;
    to2MileageRange: string;
    to2DowntimeHours: string;
    serviceMileageRange: string;
    serviceDowntimeHours: string;
    supplyLeadHours: string;
};

const STATIC_LOCOMOTIVE_REFERENCE: Record<string, StaticLocomotiveReference> = {
    KZ4AC: {
        serviceCenter: '—',
        to2MileageRange: '9,9-12,1',
        to2DowntimeHours: '12',
        serviceMileageRange: '100-120',
        serviceDowntimeHours: '24',
        supplyLeadHours: '—',
    },
    KZ4AT: {
        serviceCenter: '—',
        to2MileageRange: '—',
        to2DowntimeHours: '—',
        serviceMileageRange: '25000',
        serviceDowntimeHours: '24',
        supplyLeadHours: '—',
    },
    TЭП33A: {
        serviceCenter: '—',
        to2MileageRange: '—',
        to2DowntimeHours: '—',
        serviceMileageRange: '105-110',
        serviceDowntimeHours: '24',
        supplyLeadHours: '3',
        serviceCenterByNumber: {
            '0001': 'Астана',
            '0002': 'Сексеул',
            '0003': 'Сексеул',
            '0004': 'Макат',
            '0005': 'Актобе',
            '0006': 'Макат',
            '0007': 'Актобе',
            '0008': 'Актобе',
            '0009': 'Актобе',
            '0010': 'Сексеул',
            '0011': 'Астана',
            '0012': 'Астана',
            '0013': 'Макат',
            '0014': 'Астана',
            '0015': 'Макат',
            '0016': 'Актобе',
            '0017': 'Макат',
            '0018': 'Макат',
            '0019': 'Макат',
            '0020': 'Макат',
            '0021': 'Астана',
            '0022': 'Астана',
            '0023': 'Астана',
            '0024': 'Астана',
            '0025': 'Сексеул',
            '0026': 'Сексеул',
            '0027': 'Аягоз',
            '0028': 'Астана',
            '0029': 'Астана',
            '0030': 'Аягоз',
            '0031': 'Аягоз',
            '0032': 'Аягоз',
            '0033': 'Аягоз',
            '0034': 'Аягоз',
            '0035': 'Аягоз',
            '0036': 'Аягоз',
            '0037': 'Аягоз',
            '0038': 'Сексеул',
            '0039': 'Сексеул',
            '0040': 'Аягоз',
            '0041': 'Сексеул',
            '0042': 'Сексеул',
            '0043': 'Сексеул',
            '0044': 'Аягоз',
            '0045': 'Аягоз',
            '0046': 'Аягоз',
            '0047': 'Аягоз',
            '0048': 'Аягоз',
            '0049': 'Аягоз',
            '0050': 'Аягоз',
            '0051': 'Аягоз',
            '0052': 'Аягоз',
            '0053': 'Аягоз',
            '0054': 'Астана',
            '0055': 'Астана',
            '0056': 'Астана',
            '0057': 'Астана',
            '0058': 'Аягоз',
            '0059': 'Аягоз',
            '0060': 'Аягоз',
            '0061': 'Астана',
            '0062': 'Астана',
            '0063': 'Сексеул',
            '0064': 'Сексеул',
            '0065': 'Сексеул',
            '0066': 'Сексеул',
            '0067': 'Сексеул',
            '0068': 'Сексеул',
            '0069': 'Сексеул',
            '0070': 'Сексеул',
            '0071': 'Сексеул',
            '0072': 'Сексеул',
            '0073': 'Сексеул',
            '0074': 'Сексеул',
            '0075': 'Сексеул',
            '0076': 'Сексеул',
            '0077': 'Сексеул',
            '0078': 'Сексеул',
            '0079': 'Сексеул',
            '0080': 'Сексеул',
            '0081': 'Сексеул',
            '0082': 'Сексеул',
            '0083': 'Сексеул',
        },
    },
};

const STATIC_LOCOMOTIVE_BLOCKS: StaticLocomotiveBlock[] = [
    { series: 'KZ4Ac', start: 6, end: 7, depot: 'ТЛ-20' },
    { series: 'KZ4Ac', start: 8, end: 9, depot: 'ТЛ-11' },
    { series: 'KZ4Ac', number: '0010', depot: 'ТЛ-20' },
    { series: 'KZ4Ac', start: 11, end: 15, depot: 'ТЛ-11' },
    { series: 'KZ4Ac', start: 16, end: 17, depot: 'ТЛ-20' },
    { series: 'KZ4Ac', start: 18, end: 21, depot: 'ТЛ-11' },
    { series: 'KZ4Ac', start: 22, end: 23, depot: 'ТЛ-20' },
    { series: 'KZ4Ac', start: 24, end: 25, depot: 'ТЛ-11' },
    { series: 'KZ4Ac', start: 26, end: 27, depot: 'ТЛ-14' },
    { series: 'KZ4Aт', start: 1, end: 12, depot: 'ТЛ-11' },
    { series: 'KZ4Aт', start: 13, end: 32, depot: 'ТЛ-31' },
    { series: 'KZ4Aт', start: 33, end: 39, depot: 'ТЛ-14' },
    { series: 'KZ4Aт', number: '0040', depot: 'ТЛ-11' },
    { series: 'KZ4Aт', number: '0041', depot: 'ТЛ-14' },
    { series: 'KZ4Aт', number: '0042', depot: 'ТЛ-28' },
    { series: 'KZ4Aт', number: '0043', depot: 'ТЛ-14' },
    { series: 'KZ4Aт', number: '0044', depot: 'ТЛ-11' },
    { series: 'KZ4Aт', start: 45, end: 47, depot: 'ТЛ-31' },
    { series: 'KZ4Aт', start: 48, end: 54, depot: 'ТЛ-11' },
    { series: 'KZ4Aт', start: 55, end: 56, depot: 'ТЛ-28' },
    { series: 'KZ4Aт', start: 57, end: 82, depot: 'ТЛ-11' },
    { series: 'ТЭП33А', number: '0001', depot: 'ТЛ-20' },
    { series: 'ТЭП33А', start: 2, end: 3, depot: 'ТЛ-36' },
    { series: 'ТЭП33А', number: '0004', depot: 'ТЛ-4' },
    { series: 'ТЭП33А', number: '0005', depot: 'ТЛ-2' },
    { series: 'ТЭП33А', number: '0006', depot: 'ТЛ-4' },
    { series: 'ТЭП33А', start: 7, end: 9, depot: 'ТЛ-2' },
    { series: 'ТЭП33А', number: '0010', depot: 'ТЛ-36' },
    { series: 'ТЭП33А', start: 11, end: 12, depot: 'ТЛ-20' },
    { series: 'ТЭП33А', number: '0013', depot: 'ТЛ-4' },
    { series: 'ТЭП33А', number: '0014', depot: 'ТЛ-20' },
    { series: 'ТЭП33А', number: '0015', depot: 'ТЛ-4' },
    { series: 'ТЭП33А', number: '0016', depot: 'ТЛ-2' },
    { series: 'ТЭП33А', start: 17, end: 20, depot: 'ТЛ-4' },
    { series: 'ТЭП33А', start: 21, end: 24, depot: 'ТЛ-11' },
    { series: 'ТЭП33А', start: 25, end: 26, depot: 'ТЛ-36' },
    { series: 'ТЭП33А', start: 27, end: 28, depot: 'ТЛ-25' },
    { series: 'ТЭП33А', number: '0029', depot: 'ТЛ-20' },
    { series: 'ТЭП33А', start: 30, end: 37, depot: 'ТЛ-25' },
    { series: 'ТЭП33А', start: 38, end: 39, depot: 'ТЛ-36' },
    { series: 'ТЭП33А', number: '0040', depot: 'ТЛ-28' },
    { series: 'ТЭП33А', start: 41, end: 43, depot: 'ТЛ-36' },
    { series: 'ТЭП33А', start: 44, end: 53, depot: 'ТЛ-28' },
    { series: 'ТЭП33А', start: 54, end: 57, depot: 'ТЛ-20' },
    { series: 'ТЭП33А', start: 58, end: 60, depot: 'ТЛ-28' },
    { series: 'ТЭП33А', start: 61, end: 62, depot: 'ТЛ-20' },
    { series: 'ТЭП33А', start: 63, end: 83, depot: 'ТЛ-36' },
];

function normalizeSeriesKey(series: string) {
    return series
        .trim()
        .toUpperCase()
        .replace(/Ё/g, 'Е')
        .replace(/С/g, 'C')
        .replace(/А/g, 'A')
        .replace(/Т/g, 'T')
        .replace(/К/g, 'K')
        .replace(/З/g, '3');
}

function padNumber(num: number) {
    return String(num).padStart(4, '0');
}

function getStaticReference(series: string, number: string) {
    const ref = STATIC_LOCOMOTIVE_REFERENCE[normalizeSeriesKey(series)];
    return {
        serviceCenter:
            ref?.serviceCenterByNumber?.[number] ??
            ref?.serviceCenter ??
            '',
        to2MileageRange: ref?.to2MileageRange ?? '—',
        to2DowntimeHours: ref?.to2DowntimeHours ?? '—',
        serviceMileageRange: ref?.serviceMileageRange ?? '—',
        serviceDowntimeHours: ref?.serviceDowntimeHours ?? '—',
        supplyLeadHours: ref?.supplyLeadHoursByNumber?.[number] ?? ref?.supplyLeadHours ?? '—',
    };
}

function expandStaticLocomotives(): StaticLocomotiveRow[] {
    return STATIC_LOCOMOTIVE_BLOCKS.flatMap((block) => {
        const numbers =
            block.number
                ? [block.number]
                : Array.from({ length: (block.end ?? 0) - (block.start ?? 0) + 1 }, (_, index) => padNumber((block.start ?? 0) + index));

        return numbers.map((number) => {
            const ref = getStaticReference(block.series, number);
            return {
                id: `static-${normalizeSeriesKey(block.series)}-${number}`,
                series: block.series,
                number,
                depot: block.depot,
                serviceCenter: ref.serviceCenter,
                to2MileageRange: ref.to2MileageRange,
                to2DowntimeHours: ref.to2DowntimeHours,
                serviceMileageRange: ref.serviceMileageRange,
                serviceDowntimeHours: ref.serviceDowntimeHours,
                supplyLeadHours: ref.supplyLeadHours,
            };
        });
    });
}

const STATIC_LOCOMOTIVES = expandStaticLocomotives();

export default function LocomotiveFleetWidget({
    title = 'Информация по локомотивам',
    subtitle = 'Отдельный блок после карты. Основной ориентир: серия и заводской номер.',
    className = '',
    collapsible = false,
    defaultOpen = true,
}: LocomotiveFleetWidgetProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const mergedLocos = STATIC_LOCOMOTIVES;

    const normalizedQuery = searchTerm.trim().toLowerCase();
    const filtered = mergedLocos.filter((l) => {
        const matchesSearch =
            !normalizedQuery ||
            l.number.toLowerCase().includes(normalizedQuery) ||
            l.series.toLowerCase().includes(normalizedQuery) ||
            l.depot.toLowerCase().includes(normalizedQuery) ||
            l.serviceCenter.toLowerCase().includes(normalizedQuery);
        return matchesSearch;
    });

    const counts = mergedLocos.reduce((acc, curr) => {
        acc[curr.series] = (acc[curr.series] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <section className={`card ${className}`.trim()}>
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                        <Train size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 leading-tight">{title}</h2>
                                    <p className="text-sm text-gray-500">{subtitle}</p>
                                </div>
                                {collapsible && (
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen((value) => !value)}
                                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-900"
                                    >
                                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {isOpen ? 'Скрыть блок' : 'Показать блок'}
                                    </button>
                                )}
                            </div>
                            <p className="mt-2 text-xs text-gray-400">
                                Поиск работает по заводскому номеру, серии, депо и сервисному центру.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {Object.entries(counts).slice(0, 6).map(([series, count]) => (
                            <div key={series} className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
                                <span className="text-xs font-semibold text-gray-600">{series}</span>
                                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-mono font-bold text-gray-800 shadow-sm border border-gray-200">
                                    {count as number}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {(!collapsible || isOpen) && (
                    <>
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
                                Всего записей: {mergedLocos.length}
                            </div>

                            <div className="relative w-full xl:w-80">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Поиск по заводскому номеру или серии"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                />
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                            <div className="max-h-[520px] overflow-auto">
                                <table className="w-full min-w-[1560px] border-collapse text-left">
                                    <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur">
                                        <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            <th className="px-5 py-4">Серия</th>
                                            <th className="px-5 py-4">Заводской номер</th>
                                            <th className="px-5 py-4">Депо приписки</th>
                                            <th className="px-5 py-4">Сервисный центр</th>
                                            <th className="px-5 py-4">Пробег до ТО-2, км</th>
                                            <th className="px-5 py-4">Простой на ТО-2, ч</th>
                                            <th className="px-5 py-4">Пробег до сервиса, км</th>
                                            <th className="px-5 py-4">Простой в сервисе, ч</th>
                                            <th className="px-5 py-4">Время экипировки, ч</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {filtered.map((l) => (
                                            <tr key={l.id} className="transition-colors hover:bg-gray-50/70">
                                                <td className="px-5 py-4 text-sm font-semibold text-gray-900">{l.series}</td>
                                                <td className="px-5 py-4 text-sm font-mono text-gray-700">{l.number}</td>
                                                <td className="px-5 py-4 text-sm text-gray-600">{l.depot}</td>
                                                <td className="px-5 py-4 text-sm text-gray-600">{l.serviceCenter}</td>
                                                <td className="px-5 py-4 text-sm text-gray-600">{l.to2MileageRange}</td>
                                                <td className="px-5 py-4 text-sm text-gray-600">{l.to2DowntimeHours}</td>
                                                <td className="px-5 py-4 text-sm text-gray-600">{l.serviceMileageRange}</td>
                                                <td className="px-5 py-4 text-sm text-gray-600">{l.serviceDowntimeHours}</td>
                                                <td className="px-5 py-4 text-sm text-gray-600">{l.supplyLeadHours}</td>
                                            </tr>
                                        ))}

                                        {filtered.length === 0 && (
                                            <tr>
                                                <td colSpan={9} className="bg-gray-50/50 px-5 py-10 text-center text-sm text-gray-500">
                                                    По выбранным фильтрам локомотивы не найдены
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
