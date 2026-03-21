import { useState, useEffect } from 'react';
import { getStations, getTrains, createBinding } from '../lib/api';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    periodId: string;
    initialStationId: string;
}

export default function CreateBindingModal({ isOpen, onClose, onSuccess, periodId, initialStationId }: Props) {
    const [stations, setStations] = useState<any[]>([]);
    const [trains, setTrains] = useState<any[]>([]);

    const [stationId, setStationId] = useState(initialStationId);
    const [arrivalTrainId, setArrivalTrainId] = useState('');
    const [arrivalDt, setArrivalDt] = useState('');
    
    const [departureTrainId, setDepartureTrainId] = useState('');
    const [departureDt, setDepartureDt] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setStationId(initialStationId || '');
        setArrivalTrainId('');
        setDepartureTrainId('');
        setArrivalDt('');
        setDepartureDt('');
        setError('');
        
        Promise.all([getStations(), getTrains()]).then(([sReq, tReq]) => {
            setStations(sReq.stations);
            setTrains(tReq);
            if (initialStationId && sReq.stations.some((s: any) => s.id === initialStationId)) {
                setStationId(initialStationId);
            } else if (sReq.stations.length > 0) {
                setStationId(sReq.stations[0].id);
            }
        }).catch(err => console.error(err));
    }, [isOpen, initialStationId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        if (!stationId || !arrivalTrainId || !arrivalDt || !departureTrainId || !departureDt) {
            setError('Пожалуйста, заполните все поля');
            return;
        }

        const arrZ = new Date(arrivalDt).toISOString();
        const depZ = new Date(departureDt).toISOString();

        if (new Date(arrZ) > new Date(depZ)) {
            setError('Время отправления должно быть позже времени прибытия');
            return;
        }

        setLoading(true);
        try {
            await createBinding({
                periodId,
                turnaroundStationId: stationId,
                arrivalTrainId,
                arrivalDt: arrZ,
                departureTrainId,
                departureDt: depZ,
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Ошибка при сохранении');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-gray-100">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Новая подвязка</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Период: {periodId}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-sm text-red-600">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form id="binding-form" onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Станция разворота</label>
                            <select 
                                value={stationId} 
                                onChange={e => setStationId(e.target.value)}
                                className="input-field w-full bg-gray-50/50"
                            >
                                <option value="">Выберите станцию...</option>
                                {stations.map(s => <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <div className="space-y-3 p-4 bg-blue-50/30 rounded-xl border border-blue-100/50">
                                <div>
                                    <label className="block text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                        Отцепка
                                    </label>
                                    <select 
                                        value={arrivalTrainId} 
                                        onChange={e => setArrivalTrainId(e.target.value)}
                                        className="input-field w-full !py-1.5 text-sm"
                                    >
                                        <option value="">Номер поезда...</option>
                                        {trains.map(t => <option key={t.id} value={t.id}>№ {t.number}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] text-blue-600 font-semibold mb-1">Прибытие</label>
                                    <input 
                                        type="datetime-local" 
                                        value={arrivalDt}
                                        onChange={e => setArrivalDt(e.target.value)}
                                        className="input-field w-full !py-1.5 text-sm" 
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 p-4 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
                                <div>
                                    <label className="block text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Прицепка
                                    </label>
                                    <select 
                                        value={departureTrainId} 
                                        onChange={e => setDepartureTrainId(e.target.value)}
                                        className="input-field w-full !py-1.5 text-sm"
                                    >
                                        <option value="">Номер поезда...</option>
                                        {trains.map(t => <option key={t.id} value={t.id}>№ {t.number}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] text-emerald-600 font-semibold mb-1">Отправление</label>
                                    <input 
                                        type="datetime-local" 
                                        value={departureDt}
                                        onChange={e => setDepartureDt(e.target.value)}
                                        className="input-field w-full !py-1.5 text-sm" 
                                    />
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
                        Отмена
                    </button>
                    <button type="submit" form="binding-form" disabled={loading} className="btn-primary !px-5 rounded-xl">
                        {loading ? 'Создание...' : 'Добавить подвязку'}
                    </button>
                </div>
            </div>
        </div>
    );
}
