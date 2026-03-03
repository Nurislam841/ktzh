const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options?.headers ?? {}),
        },
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message ?? `HTTP ${res.status}`);
    }
    return res.json();
}

// ─── Admin ───────────────────────────────────────────────────────────
export async function seedData() {
    return fetchApi('/admin/seed', {
        method: 'POST',
        headers: { 'x-admin-token': 'super-secret-admin-token-change-me' },
    });
}

// ─── Node ────────────────────────────────────────────────────────────
export async function getNodeOverview(stationId: string, from?: string, to?: string) {
    const params = new URLSearchParams({ stationId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return fetchApi(`/node/overview?${params}`);
}

// ─── Schedule ────────────────────────────────────────────────────────
export async function getScheduleVersions(stationId: string, page = 1) {
    return fetchApi(`/schedule/versions?stationId=${stationId}&page=${page}`);
}

export async function getScheduleVersion(id: string) {
    return fetchApi(`/schedule/version/${id}`);
}

export async function compareVersions(fromVersionId: string, toVersionId: string) {
    return fetchApi(`/schedule/compare?fromVersionId=${fromVersionId}&toVersionId=${toVersionId}`);
}

// ─── Events ──────────────────────────────────────────────────────────
export type EventType =
    | 'LOCOMOTIVE_FAILURE'
    | 'CREW_UNAVAILABLE'
    | 'TRAIN_DELAY'
    | 'TRACK_BLOCKED'
    | 'MAINTENANCE_STARTED'
    | 'MAINTENANCE_ENDED';

export async function createEvent(data: {
    stationId: string;
    type: EventType;
    payload: Record<string, unknown>;
}) {
    return fetchApi('/events', { method: 'POST', body: JSON.stringify(data) });
}

export async function getEvents(stationId: string, page = 1) {
    return fetchApi(`/events?stationId=${stationId}&page=${page}`);
}

// ─── Analytics ───────────────────────────────────────────────────────
export async function getAnalytics(stationId: string, versionId?: string) {
    const params = new URLSearchParams({ stationId });
    if (versionId) params.set('versionId', versionId);
    return fetchApi(`/analytics/node-overview?${params}`);
}
