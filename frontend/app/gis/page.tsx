'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import LocomotiveFleetWidget from '../../components/LocomotiveFleetWidget';

// Dynamically import the map because Leaflet uses window which breaks SSR in Next.js
const DynamicRailwayGISDashboard = dynamic(
    () => import('../../components/RailwayGISDashboard'),
    {
        ssr: false,
        loading: () => <div className="flex h-full w-full items-center justify-center rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div></div>
    }
);

export default function GisPage() {
    const [stationId, setStationId] = useState('');

    useEffect(() => {
        const sid = new URLSearchParams(window.location.search).get('stationId') || window.localStorage.getItem('ktz_station_id') || '';
        setStationId(sid);
    }, []);

    return (
        <div className="flex min-h-screen">
            <Sidebar stationId={stationId} />
            <div className="main-wrapper flex-1">
                <div className="max-w-7xl mx-auto h-full flex flex-col p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl tracking-tight font-bold text-gray-900 mb-1">R-Атлас (GIS)</h1>
                            <p className="text-gray-500">
                                Геоинформационная система мониторинга загруженности станций и дислокации локомотивов.
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 min-h-[700px] w-full shadow-sm rounded-2xl overflow-hidden bg-white border border-gray-100 p-2 relative z-0">
                        <DynamicRailwayGISDashboard />
                    </div>

                    <LocomotiveFleetWidget
                        className="mt-6"
                        title="Сведения по локомотивам"
                        subtitle="Отдельный информационный блок после карты. Таблица собрана для быстрого просмотра парка."
                        collapsible
                        defaultOpen
                    />
                </div>
            </div>
        </div>
    );
}
