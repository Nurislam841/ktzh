'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Map,
    Zap,
    ClipboardList,
    HelpCircle,
    LogOut,
    Train,
} from 'lucide-react';

const sidebarItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
    { href: '/node', icon: Map, label: 'Node View', id: 'node' },
    { href: '/simulation', icon: Zap, label: 'Simulation', id: 'simulation' },
    { href: '/versions', icon: ClipboardList, label: 'Versions', id: 'versions' },
];

export default function Sidebar({ stationId }: { stationId: string }) {
    const pathname = usePathname();

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center text-white mb-6 shadow-lg shadow-sky-200">
                <Train size={20} strokeWidth={2.5} />
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
                <button title="Help" className="sidebar-icon">
                    <HelpCircle size={20} />
                </button>
                <button title="Exit" className="sidebar-icon">
                    <LogOut size={20} />
                </button>
            </div>
        </aside>
    );
}
