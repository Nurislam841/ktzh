import React, { useMemo } from 'react';
import { Clock, Wrench, CheckCircle2, ChevronRight, AlertTriangle } from 'lucide-react';

interface GanttProps {
    stationId: string;
    locomotives: any[];
    trainRuns: any[]; // These are allocated/planned train runs
    windowHours: number;
    startDate: Date;
}

export default function LocomotiveGanttChart({ stationId, locomotives, trainRuns, windowHours, startDate }: GanttProps) {
    const endDate = new Date(startDate.getTime() + windowHours * 60 * 60000);
    const totalDurationMs = endDate.getTime() - startDate.getTime();

    // Helper to calculate percentage width/left for CSS positioning
    const getPercent = (time: Date | null | undefined, clampObj?: { min?: number, max?: number }) => {
        if (!time) return 0;
        let ms = time.getTime() - startDate.getTime();
        
        // Clamping logic
        if (clampObj?.min !== undefined) ms = Math.max(clampObj.min, ms);
        if (clampObj?.max !== undefined) ms = Math.min(clampObj.max, ms);
        
        let pct = (ms / totalDurationMs) * 100;
        return Math.max(0, Math.min(100, pct)); // Ensure it's between 0 and 100
    };

    // Process locomotives and their allocated runs
    const locoData = useMemo(() => {
        return locomotives.map(loco => {
            const locoId = loco.id;
            // Find runs assigned to this loco
            const runsForLoco = trainRuns.filter(r => r.locomotive?.id === locoId).sort((a, b) => new Date(a.plannedDeparture).getTime() - new Date(b.plannedDeparture).getTime());
            
            const blocks: any[] = [];
            const idleBlocks: any[] = [];

            // Add run blocks
            runsForLoco.forEach(run => {
                const dep = new Date(run.plannedDeparture);
                const arr = new Date(run.plannedArrival);
                blocks.push({
                    id: run.allocationId,
                    type: 'RUN',
                    start: dep,
                    end: arr,
                    trainNumber: run.trainRun?.number,
                    left: getPercent(dep),
                    width: getPercent(arr) - getPercent(dep)
                });
            });

            // Calculate Idle periods (gaps)
            let currentAvailableTime = loco.status === 'AVAILABLE' && loco.availableFrom ? new Date(loco.availableFrom) : startDate;
            
            runsForLoco.forEach(run => {
                const runStart = new Date(run.plannedDeparture);
                
                // If there's a gap between available time and train departure, that's Idle Time
                if (currentAvailableTime < runStart) {
                    const idleMs = runStart.getTime() - currentAvailableTime.getTime();
                    // Only show idle blocks larger than e.g., 30 mins
                    if (idleMs > 30 * 60000) {
                         idleBlocks.push({
                            type: 'IDLE',
                            start: currentAvailableTime,
                            end: runStart,
                            durationMs: idleMs,
                            left: getPercent(currentAvailableTime, { min: 0 }),
                            width: getPercent(runStart) - getPercent(currentAvailableTime, { min: 0 })
                        });
                    }
                }
                currentAvailableTime = new Date(run.plannedArrival); // Loc is available again after arrival
            });

            // Gap from last run to window end
            if (currentAvailableTime < endDate) {
                const idleMs = endDate.getTime() - currentAvailableTime.getTime();
                if (idleMs > 30 * 60000) {
                     idleBlocks.push({
                        type: 'IDLE',
                        start: currentAvailableTime,
                        end: endDate,
                        durationMs: idleMs,
                        left: getPercent(currentAvailableTime, { min: 0 }),
                        width: 100 - getPercent(currentAvailableTime, { min: 0 })
                    });
                }
            }

            return {
                ...loco,
                blocks,
                idleBlocks
            };
        });
    }, [locomotives, trainRuns, startDate, endDate]);

    if (!locomotives || locomotives.length === 0) {
        return <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed">Нет локомотивов для отображения</div>;
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-50 flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-gray-900">Занятость парка (Диаграмма Ганта)</h3>
                    <p className="text-xs text-gray-500">Ось показывает расписание локомотивов на {windowHours} часов. <span className="text-red-500 font-semibold inline-flex items-center gap-1"><AlertTriangle size={10} />Красные зоны</span> — простой (убыток).</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm" /> В пути</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-500 rounded-sm" /> ТО/Экипировка</span>
                    <span className="flex items-center gap-1 font-semibold text-red-600"><div className="w-3 h-3 bg-gradient-to-r from-red-500 to-rose-600 rounded-sm shadow-sm" /> Простой</span>
                </div>
            </div>

            <div className="relative flex-1 overflow-x-auto">
                <div className="min-w-[800px]">
                    {/* Time Header */}
                    <div className="flex border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
                        <div className="w-40 flex-shrink-0 p-3 text-xs font-medium text-gray-500 border-r border-gray-100 bg-white">Локомотив</div>
                        <div className="flex-1 relative h-10">
                            {[...Array(windowHours + 1)].map((_, i) => {
                                const t = new Date(startDate.getTime() + i * 60 * 60000);
                                const left = (i / windowHours) * 100;
                                return (
                                    <div key={i} className="absolute top-0 bottom-0 border-l border-gray-200" style={{ left: `${left}%` }}>
                                        <span className="absolute left-1 top-2 text-[10px] text-gray-400 font-mono">
                                            {t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Gantt Rows */}
                    <div className="divide-y divide-gray-50">
                        {locoData.map(loco => (
                            <div key={loco.id} className="flex group hover:bg-gray-50/30 transition-colors">
                                <div className="w-40 flex-shrink-0 p-3 border-r border-gray-100 bg-white group-hover:bg-gray-50/50 transition-colors z-10 flex flex-col justify-center">
                                    <div className="font-mono font-semibold text-sm text-gray-800">{loco.series}-{loco.number}</div>
                                    <div className="text-[10px] text-gray-400">{loco.status === 'MAINTENANCE' ? 'На ремонте' : loco.status === 'AVAILABLE' ? 'Свободен' : 'В работе'}</div>
                                </div>
                                <div className="flex-1 relative h-14 bg-stripes-gray">
                                    {/* Hour Grid Lines */}
                                    {[...Array(windowHours)].map((_, i) => (
                                        <div key={i} className="absolute top-0 bottom-0 border-l border-gray-100/50 pointer-events-none" style={{ left: `${(i / windowHours) * 100}%` }} />
                                    ))}

                                    {/* Idle Blocks (Money Drain) */}
                                    {loco.idleBlocks.map((idle: any, i: number) => {
                                        const hrs = Math.floor(idle.durationMs / 3600000);
                                        const mins = Math.floor((idle.durationMs % 3600000) / 60000);
                                        const label = hrs > 0 ? `${hrs}ч ${mins}м` : `${mins}м`;
                                        const isCritical = idle.durationMs > 2 * 3600000; // > 2 hours

                                        return (
                                            <div 
                                                key={`idle-${i}`} 
                                                className={`absolute top-2 bottom-2 rounded-md ${isCritical ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-sm shadow-red-200 z-20 group/idle' : 'bg-orange-100 border border-orange-200 opacity-60'}`}
                                                style={{ left: `${idle.left}%`, width: `${idle.width}%`, minWidth: '4px' }}
                                            >
                                                {isCritical && (
                                                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                                                        <span className="text-[10px] font-bold text-white whitespace-nowrap opacity-0 group-hover/idle:opacity-100 transition-opacity">
                                                            Простой: {label}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Work Blocks */}
                                    {loco.blocks.map((block: any) => (
                                        <div 
                                            key={block.id}  
                                            className="absolute top-3 bottom-3 bg-gradient-to-r from-emerald-400 to-green-500 rounded-lg shadow-sm shadow-green-100 border border-green-500/20 flex items-center px-2 overflow-hidden hover:scale-[1.02] transition-transform cursor-default z-30"
                                            style={{ left: `${block.left}%`, width: `${block.width}%`, minWidth: '20px' }}
                                            title={`Рейс #${block.trainNumber}\n${block.start.toLocaleTimeString('ru')} - ${block.end.toLocaleTimeString('ru')}`}
                                        >
                                            <span className="text-[10px] font-bold text-white whitespace-nowrap hidden sm:block truncate">#{block.trainNumber}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
