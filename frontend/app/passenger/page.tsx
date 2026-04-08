import { redirect } from 'next/navigation';

export default function PassengerPage({
    searchParams,
}: {
    searchParams?: Record<string, string | string[] | undefined>;
}) {
    const params = new URLSearchParams();
    Object.entries(searchParams ?? {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (typeof item === 'string' && item.length > 0) params.append(key, item);
            });
            return;
        }
        if (typeof value === 'string' && value.length > 0) params.set(key, value);
    });
    const query = params.toString();
    redirect(query ? `/passenger-graph?${query}` : '/passenger-graph');
}
