'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    ClipboardList,
    Database,
    Globe,
    HelpCircle,
    LayoutDashboard,
    Link2,
    LogOut,
    Map,
    MapPinned,
    Route,
    Train,
    Zap,
} from 'lucide-react';

const sidebarItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Панель', id: 'dashboard' },
    { href: '/node', icon: Map, label: 'Узел', id: 'node' },
    { href: '/resources', icon: Database, label: 'Ресурсы', id: 'resources' },
    { href: '/simulation', icon: Zap, label: 'Симуляция', id: 'simulation' },
    { href: '/versions', icon: ClipboardList, label: 'Версии', id: 'versions' },
    { href: '/graph', icon: Route, label: 'График', id: 'graph' },
    { href: '/bindings', icon: Link2, label: 'Подвязки', id: 'bindings' },
    { href: '/map', icon: MapPinned, label: 'Карта', id: 'map' },
    { href: '/gis', icon: Globe, label: 'R-Атлас (GIS)', id: 'gis' },
];

export default function Sidebar({ stationId }: { stationId: string }) {
    const pathname = usePathname();
    const router = useRouter();

    const handleHelp = () => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        window.open(`${apiUrl}/api/docs`, '_blank', 'noopener,noreferrer');
    };

    const handleLogout = () => {
        window.localStorage.removeItem('ktz_station_id');
        router.push('/dashboard');
    };

    return (
        <aside className="sidebar">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-[1.25rem] border border-gray-700 bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-lg shadow-gray-200/50">
                <Train size={24} strokeWidth={2} />
            </div>

            <nav className="flex flex-1 flex-col items-center gap-1">
                {sidebarItems.map((item) => {
                    const isActive = pathname === `/${item.id}` || pathname.startsWith(`/${item.id}`);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.id}
                            href={`/${item.id}?stationId=${stationId}`}
                            title={item.label}
                            className={isActive ? 'sidebar-icon-active' : 'sidebar-icon'}
                        >
                            <Icon size={20} />
                        </Link>
                    );
                })}
            </nav>

            <div className="flex flex-col items-center gap-1">
                <button title="Помощь" className="sidebar-icon" onClick={handleHelp}>
                    <HelpCircle size={20} />
                </button>
                <button title="Выход" className="sidebar-icon" onClick={handleLogout}>
                    <LogOut size={20} />
                </button>
            </div>
        </aside>
    );
}
