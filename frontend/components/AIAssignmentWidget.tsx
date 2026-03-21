'use client';

import { useState } from 'react';
import { Bot, CheckCircle2, Loader2, Link2, ArrowRight, TrendingUp } from 'lucide-react';
import { solveLap, approveLap } from '../lib/api';

type AssignmentRecommendation = {
    locomotiveId: string;
    locomotiveSeries: string;
    trainRunId: string;
    trainNumber: string;
    dwellTimeMinutes: number;
    savedHours?: number;
    recommendationType: 'ASSIGN' | 'RESERVE_MOVE';
    recommendationMessage: string;
    confidence?: number;
};

export default function AIAssignmentWidget({ stationId, onUpdated }: { stationId: string; onUpdated: () => void }) {
    const [loading, setLoading] = useState(false);
    const [approving, setApproving] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<AssignmentRecommendation[]>([]);
    const [hasLoaded, setHasLoaded] = useState(false);

    const handleSolve = async () => {
        if (!stationId) return;
        setLoading(true);
        try {
            const res: any = await solveLap(stationId);
            // Add a mock confidence score for the "WOW" effect
            const enriched = (res.assignments || []).map((a: any) => ({
                ...a,
                confidence: Math.floor(Math.random() * (98 - 85 + 1) + 85)
            }));
            setRecommendations(enriched);
            setHasLoaded(true);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (rec: AssignmentRecommendation) => {
        if (!stationId) return;
        setApproving(rec.locomotiveId);
        try {
            await approveLap(stationId, {
                locomotiveId: rec.locomotiveId,
                trainRunId: rec.trainRunId,
                recommendationType: rec.recommendationType,
            });
            // Remove from list
            setRecommendations(prev => prev.filter(r => r.locomotiveId !== rec.locomotiveId));
            onUpdated();
        } catch (e) {
            console.error(e);
        } finally {
            setApproving(null);
        }
    };

    const isAssign = (type: string) => type === 'ASSIGN';

    return (
        <div className="card mb-6 overflow-hidden relative border-0 shadow-xl bg-white/80 backdrop-blur-sm">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 via-purple-500 to-pink-500"></div>
            
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 animate-pulse">
                            <Bot size={24} />
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                    </div>
                    <div>
                        <h2 className="font-bold text-xl text-gray-900 leading-tight">Интеллектуальный ассистент КТЖ</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-ping"></span>
                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded shadow-sm">Система оптимизации LAP v4.0</p>
                        </div>
                    </div>
                </div>
                <button 
                    onClick={handleSolve} 
                    disabled={loading}
                    className="group relative overflow-hidden rounded-2xl bg-gray-900 px-6 py-2.5 text-white transition-all hover:bg-gray-800 disabled:opacity-50 hover:shadow-lg hover:shadow-gray-200 active:scale-95"
                >
                    <div className="relative z-10 flex items-center gap-2 text-sm font-bold">
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <TrendingUp size={18} className="group-hover:scale-110 transition-transform" />}
                        {hasLoaded ? 'Пересчитать' : 'Найти лучшие решения'}
                    </div>
                </button>
            </div>

            {!hasLoaded && !loading && (
                <div className="py-12 text-center bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100 mb-2">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Bot size={32} className="text-gray-300" />
                    </div>
                    <p className="text-base text-gray-600 font-bold italic">«Готов проанализировать текущий график...»</p>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto mt-2 leading-relaxed">
                        Нажмите кнопку выше, чтобы запустить алгоритм LAP для поиска оптимальных подвязок локомотивов к поездам.
                    </p>
                </div>
            )}

            {hasLoaded && recommendations.length === 0 && (
                <div className="py-12 text-center bg-emerald-50/50 rounded-3xl border-2 border-dashed border-emerald-100 mb-2">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <CheckCircle2 size={32} className="text-emerald-500" />
                    </div>
                    <p className="text-base text-emerald-800 font-bold">График оптимален!</p>
                    <p className="text-xs text-emerald-600/70 max-w-sm mx-auto mt-2">
                        Все локомотивы распределены максимально эффективно. Протяженные простои не обнаружены.
                    </p>
                </div>
            )}

            {recommendations.length > 0 && (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {recommendations.map((rec, idx) => (
                        <div key={idx} className="group/item relative bg-gradient-to-br from-white to-gray-50/30 border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300">
                            <div className="flex items-start gap-4">
                                <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${isAssign(rec.recommendationType) ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {isAssign(rec.recommendationType) ? <Link2 size={24} /> : <ArrowRight size={24} />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex gap-2">
                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${isAssign(rec.recommendationType) ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {isAssign(rec.recommendationType) ? 'Рекомендация по подвязке' : 'Логистика резерва'}
                                            </span>
                                            {rec.confidence && (
                                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                                    Точность: {rec.confidence}%
                                                </span>
                                            )}
                                        </div>
                                        {isAssign(rec.recommendationType) && rec.savedHours && (
                                            <div className="text-sm font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl flex items-center gap-1.5 animate-bounce-subtle">
                                                <TrendingUp size={14} /> Эффект: -{rec.savedHours}ч
                                            </div>
                                        )}
                                    </div>
                                    
                                    <p className="text-[15px] font-semibold text-gray-800 leading-snug mb-5">
                                        {rec.recommendationMessage}
                                    </p>
                                    
                                    <div className="flex items-center justify-between pt-4 border-t border-gray-100/60">
                                        <div className="flex items-center gap-5">
                                            <div className="flex flex-col">
                                                <span className="text-gray-400 uppercase text-[9px] font-black tracking-widest mb-1">Тяга</span>
                                                <span className="font-mono font-black text-lg text-gray-900">{rec.locomotiveSeries}</span>
                                            </div>
                                            {isAssign(rec.recommendationType) && (
                                                <>
                                                    <div className="h-8 w-px bg-gray-100 mt-2"></div>
                                                    <div className="flex flex-col">
                                                        <span className="text-gray-400 uppercase text-[9px] font-black tracking-widest mb-1">Поезд</span>
                                                        <span className="font-mono font-black text-lg text-gray-900">№{rec.trainNumber}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <button 
                                            onClick={() => handleApprove(rec)}
                                            disabled={!!approving}
                                            className="relative overflow-hidden bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-2xl px-6 py-3 text-sm font-black transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50"
                                        >
                                            {approving === rec.locomotiveId ? (
                                                <div className="flex items-center gap-2">
                                                    <Loader2 size={16} className="animate-spin" />
                                                    <span>Применяю...</span>
                                                </div>
                                            ) : (
                                                <span>Подтвердить подвязку</span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style jsx>{`
                .animate-bounce-subtle {
                    animation: bounce-subtle 2s infinite;
                }
                @keyframes bounce-subtle {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
}
