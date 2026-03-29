'use client';

type StopRecord = {
    station: string;
    stationCode: string | null;
    distanceKm: number | null;
    arrivalRaw: string | null;
    departureRaw: string | null;
    dwellMinutes: number | null;
    arrivalOffsetMinutes: number | null;
    departureOffsetMinutes: number | null;
};

type TrainWindow = {
    trainNumber: string;
    routeName: string | null;
    sheetName: string;
    direction: 'forward' | 'backward';
    corridor: string | null;
    entersNodeAt: string | null;
    exitsNodeAt: string | null;
    astanaCoreStop: string | null;
    windowStops: StopRecord[];
};

type StationItem = {
    name: string;
    distanceKm: number | null;
};

type RoutePairSummary = {
    pairKey: string;
    trainNumbers: string[];
    routes: string[];
    corridors: string[];
    trainsCount: number;
};

type BindingEvent = {
    sheetName: string;
    depot: string | null;
    day: number;
    weekday: string | null;
    arrivalTrainNumber: string | null;
    arrivalTime: string | null;
    departureTrainNumber: string | null;
    departureTime: string | null;
    dwellMinutes: number | null;
    arrivalOffsetMinutes: number | null;
    departureOffsetMinutes: number | null;
};

type TurnaroundRecord = {
    stationSheet: string;
    day: number;
    weekday: string | null;
    depot: string | null;
    arrivalTrainNumber: string | null;
    arrivalRoute: string | null;
    arrivalAstanaStop: string | null;
    arrivalAstanaTime: string | null;
    arrivalBindingTime: string | null;
    departureTrainNumber: string | null;
    departureRoute: string | null;
    departureAstanaStop: string | null;
    departureAstanaTime: string | null;
    departureBindingTime: string | null;
    dwellMinutes: number | null;
    dwellHours: number | null;
    matchType: string;
    arrivalAstanaOffsetMinutes: number | null;
    departureAstanaOffsetMinutes: number | null;
};

type StopOperation = {
    trainNumber: string;
    station: string;
    stationTime: string | null;
    stationOffsetMinutes: number | null;
    type: 'LOCO_CHANGE' | 'TURNAROUND';
    label: string;
    details: string;
};

function colorFromTrain(trainNumber: string) {
    let hash = 0;
    for (let i = 0; i < trainNumber.length; i++) {
        hash = trainNumber.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 42%)`;
}

function minuteLabel(offsetMinutes: number) {
    const totalMinutes = (20 * 60 + offsetMinutes) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function buildPolylinePoints(
    stops: StopRecord[],
    stationIndex: Map<string, number>,
    xForMinutes: (minutes: number) => number,
    yForStation: (index: number) => number,
) {
    const points: Array<{ x: number; y: number }> = [];

    stops.forEach((stop) => {
        const idx = stationIndex.get(stop.station);
        if (idx === undefined) return;
        const y = yForStation(idx);
        if (typeof stop.arrivalOffsetMinutes === 'number') {
            points.push({ x: xForMinutes(stop.arrivalOffsetMinutes), y });
        }
        if (typeof stop.departureOffsetMinutes === 'number') {
            points.push({ x: xForMinutes(stop.departureOffsetMinutes), y });
        }
    });

    return points;
}

export default function GituralTimeline({
    trains,
    stations,
    bindings,
    turnarounds,
    highlightedPair,
    stopOperations,
    selectedTrainNumber,
    onSelectTrain,
}: {
    trains: TrainWindow[];
    stations: StationItem[];
    bindings: BindingEvent[];
    turnarounds: TurnaroundRecord[];
    highlightedPair?: string;
    stopOperations: StopOperation[];
    selectedTrainNumber?: string;
    onSelectTrain?: (trainNumber: string) => void;
}) {
    const leftPad = 160;
    const topPad = 48;
    const rowHeight = 46;
    const width = 1600;
    const bodyWidth = width - leftPad - 36;
    const height = Math.max(420, topPad + stations.length * rowHeight + 32);
    const stationIndex = new Map(stations.map((station, index) => [station.name, index]));

    const xForMinutes = (minutes: number) => leftPad + (minutes / (24 * 60)) * bodyWidth;
    const yForStation = (index: number) => topPad + index * rowHeight;

    if (!stations.length) {
        return (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-sm text-gray-500">
                Нет данных для выбранного фильтра.
            </div>
        );
    }

    return (
        <div className="rounded-[28px] border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
                <svg width={width} height={height} className="min-w-full">
                    <rect x="0" y="0" width={width} height={height} fill="#fff" />

                    {Array.from({ length: 25 }).map((_, hour) => {
                        const minutes = hour * 60;
                        const x = xForMinutes(minutes);
                        return (
                            <g key={hour}>
                                <line
                                    x1={x}
                                    y1={topPad - 14}
                                    x2={x}
                                    y2={height - 24}
                                    stroke={hour % 6 === 0 ? '#cbd5e1' : '#e5e7eb'}
                                    strokeWidth={hour % 6 === 0 ? 1.5 : 1}
                                />
                                {hour < 24 && (
                                    <text x={x + 4} y={24} fontSize="11" fill="#475569">
                                        {minuteLabel(minutes)}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {stations.map((station, index) => {
                        const y = yForStation(index);
                        const normalized = station.name.toLowerCase().replace(/\s+/g, ' ').trim();
                        const isCore = ['астана-1', 'нурлы жол', 'сороковая'].includes(normalized);
                        return (
                            <g key={station.name}>
                                {isCore && (
                                    <rect x={leftPad} y={y - 16} width={width - leftPad - 24} height={26} fill="#ecfeff" opacity={0.7} />
                                )}
                                <line x1={leftPad} y1={y} x2={width - 24} y2={y} stroke={isCore ? '#99f6e4' : '#f1f5f9'} />
                                <text x={16} y={y + 4} fontSize="12" fill={isCore ? '#0f766e' : '#0f172a'} fontWeight={isCore ? 700 : 400}>
                                    {station.name}
                                </text>
                                {station.distanceKm !== null && (
                                    <text x={16} y={y + 18} fontSize="10" fill="#94a3b8">
                                        {station.distanceKm} км
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {trains.map((train) => {
                        const points = buildPolylinePoints(train.windowStops, stationIndex, xForMinutes, yForStation);
                        if (points.length < 2) return null;
                        const color = colorFromTrain(train.trainNumber);
                        const label = `${train.trainNumber} ${train.routeName ?? ''}`.trim();
                        const firstPoint = points[0];
                        const pairKeyMatch = train.sheetName.match(/(\d{1,4})\s*-\s*(\d{1,4})/);
                        const pairKey = pairKeyMatch
                            ? `${pairKeyMatch[1].padStart(3, '0')}/${pairKeyMatch[2].padStart(3, '0')}`
                            : train.trainNumber;
                        const isHighlighted = !highlightedPair || highlightedPair === pairKey;
                        const isSelected = selectedTrainNumber === train.trainNumber;
                        return (
                            <g
                                key={`${train.sheetName}-${train.direction}-${train.trainNumber}`}
                                opacity={isHighlighted ? 1 : 0.18}
                                onClick={() => onSelectTrain?.(train.trainNumber)}
                                style={{ cursor: onSelectTrain ? 'pointer' : 'default' }}
                            >
                                <polyline
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={isSelected ? 4.2 : isHighlighted ? 2.8 : 1.4}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                                />
                                {points.map((point, idx) => (
                                    <circle key={idx} cx={point.x} cy={point.y} r={isSelected ? 3.2 : 2.2} fill={color} />
                                ))}
                                {train.windowStops
                                    .filter((stop) => (stop.dwellMinutes ?? 0) >= 5)
                                    .map((stop) => {
                                        const idx = stationIndex.get(stop.station);
                                        if (idx === undefined) return null;
                                        if (typeof stop.arrivalOffsetMinutes !== 'number' || typeof stop.departureOffsetMinutes !== 'number') return null;
                                        const y = yForStation(idx) - 6;
                                        const x = xForMinutes(stop.arrivalOffsetMinutes);
                                        const width = Math.max(10, xForMinutes(stop.departureOffsetMinutes) - x);
                                        return (
                                            <g key={`${train.trainNumber}-${stop.station}-${stop.arrivalOffsetMinutes}`}>
                                                <rect
                                                    x={x}
                                                    y={y - 8}
                                                    width={width}
                                                    height={14}
                                                    rx={7}
                                                    fill={color}
                                                    opacity={0.18}
                                                />
                                                <text x={x + 4} y={y + 2} fontSize="9" fill={color}>
                                                    {stop.dwellMinutes}м
                                                </text>
                                            </g>
                                        );
                                    })}
                                <text x={firstPoint.x + 6} y={firstPoint.y - 6} fontSize="10" fill={color}>
                                    {`${pairKey} · ${label}`}
                                </text>
                                <title>{`${label}\n${train.corridor ?? 'Коридор не задан'}\n${train.entersNodeAt ?? '—'} → ${train.exitsNodeAt ?? '—'}`}</title>
                            </g>
                        );
                    })}

                    {stopOperations.map((item, index) => {
                        const stationIdx = stationIndex.get(item.station);
                        if (stationIdx === undefined || typeof item.stationOffsetMinutes !== 'number') return null;
                        const x = xForMinutes(item.stationOffsetMinutes);
                        const y = yForStation(stationIdx);
                        const fill = item.type === 'LOCO_CHANGE' ? '#f59e0b' : '#0f766e';
                        return (
                            <g key={`operation-${index}`}>
                                <rect
                                    x={x - 16}
                                    y={y - 22}
                                    width={32}
                                    height={12}
                                    rx={6}
                                    fill={fill}
                                    opacity={0.95}
                                />
                                <text x={x} y={y - 13} fontSize="8" fill="#fff" textAnchor="middle" fontWeight={700}>
                                    {item.label}
                                </text>
                                <title>{`${item.trainNumber} / ${item.station} / ${item.stationTime ?? '—'} / ${item.details}`}</title>
                            </g>
                        );
                    })}

                    {bindings.map((item, index) => {
                        const markers: Array<{ x: number; label: string }> = [];
                        if (typeof item.arrivalOffsetMinutes === 'number' && item.arrivalTrainNumber) {
                            markers.push({ x: xForMinutes(item.arrivalOffsetMinutes), label: `Приб. ${item.arrivalTrainNumber}` });
                        }
                        if (typeof item.departureOffsetMinutes === 'number' && item.departureTrainNumber) {
                            markers.push({ x: xForMinutes(item.departureOffsetMinutes), label: `Отпр. ${item.departureTrainNumber}` });
                        }

                        return markers.map((marker, markerIndex) => (
                            <g key={`binding-${index}-${markerIndex}`}>
                                <line x1={marker.x} y1={topPad - 10} x2={marker.x} y2={topPad - 2} stroke="#f59e0b" strokeWidth="2" />
                                <circle cx={marker.x} cy={topPad - 14} r="3" fill="#f59e0b" />
                                <title>{`${item.sheetName} / ${item.depot ?? 'депо не указано'} / ${marker.label}`}</title>
                            </g>
                        ));
                    })}

                    {turnarounds.map((item, index) => {
                        if (typeof item.arrivalAstanaOffsetMinutes !== 'number' || typeof item.departureAstanaOffsetMinutes !== 'number') {
                            return null;
                        }
                        const x1 = xForMinutes(item.arrivalAstanaOffsetMinutes);
                        const x2 = xForMinutes(item.departureAstanaOffsetMinutes);
                        const y = height - 22 - (index % 3) * 10;
                        return (
                            <g key={`turnaround-${index}`}>
                                <line x1={x1} y1={y} x2={x2} y2={y} stroke="#0f766e" strokeWidth="2" strokeDasharray="5 4" />
                                <text x={Math.min(x1, x2) + 4} y={y - 4} fontSize="9" fill="#0f766e">
                                    {`${item.arrivalTrainNumber ?? '—'}→${item.departureTrainNumber ?? '—'}`}
                                </text>
                                <title>{`Оборот ${item.arrivalTrainNumber ?? '—'} → ${item.departureTrainNumber ?? '—'} / ${item.stationSheet} / ${item.dwellHours ?? '—'}ч`}</title>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
