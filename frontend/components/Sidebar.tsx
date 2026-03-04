'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Map,
    Zap,
    ClipboardList,
    Database,
    HelpCircle,
    LogOut,
    Train,
} from 'lucide-react';

const sidebarItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Панель', id: 'dashboard' },
    { href: '/node', icon: Map, label: 'Узел', id: 'node' },
    { href: '/resources', icon: Database, label: 'Ресурсы', id: 'resources' },
    { href: '/simulation', icon: Zap, label: 'Симуляция', id: 'simulation' },
    { href: '/versions', icon: ClipboardList, label: 'Версии', id: 'versions' },
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
            {/* Logo */}
            <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center text-white mb-8 shadow-lg shadow-gray-200/50 border border-gray-700">
                <Train size={24} strokeWidth={2} />
            </div>

            {/* Main nav */}
            <nav className="flex flex-col items-center gap-1 flex-1">
                {sidebarItems.map((item) => {
                    const isActive = pathname === '/' + item.id || pathname.startsWith('/' + item.id);
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

            {/* Bottom */}
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
