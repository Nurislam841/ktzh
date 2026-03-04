import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'KTZ Node Control | Перепланирование железнодорожного узла',
    description: 'Система динамического перепланирования железнодорожного узла',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
            </head>
            <body className="text-gray-900 font-sans antialiased min-h-screen">
                {children}
            </body>
        </html>
    );
}
