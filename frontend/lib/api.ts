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
        const error = await res.json().catch(() => ({ message: 'Неизвестная ошибка' }));
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

export async function seedDataWithOptions(options: {
    tracks?: number;
    locomotives?: number;
    crews?: number;
    trainRuns?: number;
    windowHours?: number;
}) {
    return fetchApi('/admin/seed', {
        method: 'POST',
        headers: { 'x-admin-token': 'super-secret-admin-token-change-me' },
        body: JSON.stringify(options),
    });
}

export async function importDataFromFolder(dataDir?: string) {
    return fetchApi('/admin/import-data', {
        method: 'POST',
        headers: { 'x-admin-token': 'super-secret-admin-token-change-me' },
        body: JSON.stringify({ dataDir }),
    });
}

export async function bootstrapOperationalData() {
    return fetchApi('/admin/bootstrap-ops', {
        method: 'POST',
        headers: { 'x-admin-token': 'super-secret-admin-token-change-me' },
    });
}

export async function importAndBootstrap(dataDir?: string) {
    return fetchApi('/admin/import-bootstrap', {
        method: 'POST',
        headers: { 'x-admin-token': 'super-secret-admin-token-change-me' },
        body: JSON.stringify({ dataDir }),
    });
}

// ─── Node ────────────────────────────────────────────────────────────
export async function getNodeOverview(stationId: string, from?: string, to?: string, hours?: number) {
    const params = new URLSearchParams({ stationId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (hours) params.set('hours', String(hours));
    return fetchApi(`/node/overview?${params}`);
}

export async function getNodeResources(stationId: string) {
    const params = new URLSearchParams({ stationId });
    return fetchApi(`/node/resources?${params.toString()}`);
}

export async function getStations() {
    return fetchApi<{ stations: Array<{ id: string; name: string; code?: string | null; versions: number; trainRuns: number; locomotives: number; tracks: number; active: boolean }> }>('/node/stations');
}

export function pickBestStationId(stations: Array<{ id: string; trainRuns: number; versions: number; locomotives: number; active: boolean }>) {
    if (!stations.length) return '';
    const sorted = [...stations].sort((a, b) => {
        const scoreA = a.trainRuns * 100 + a.locomotives * 10 + a.versions;
        const scoreB = b.trainRuns * 100 + b.locomotives * 10 + b.versions;
        return scoreB - scoreA;
    });
    const active = sorted.find((s) => s.active);
    return (active ?? sorted[0]).id;
}

// ─── Schedule ────────────────────────────────────────────────────────
export type ApprovalMode = 'AUTOMATIC' | 'MANUAL';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export async function getScheduleVersions(
    stationId: string,
    options?: {
        page?: number;
        limit?: number;
        approvalMode?: ApprovalMode;
        approvalStatus?: ApprovalStatus;
    },
) {
    const params = new URLSearchParams({ stationId });
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.approvalMode) params.set('approvalMode', options.approvalMode);
    if (options?.approvalStatus) params.set('approvalStatus', options.approvalStatus);
    return fetchApi(`/schedule/versions?${params.toString()}`);
}

export async function getScheduleVersion(id: string) {
    return fetchApi(`/schedule/version/${id}`);
}

export async function compareVersions(fromVersionId: string, toVersionId: string) {
    return fetchApi(`/schedule/compare?fromVersionId=${fromVersionId}&toVersionId=${toVersionId}`);
}

export async function setScheduleApprovalMode(versionId: string, mode: ApprovalMode) {
    return fetchApi(`/schedule/version/${versionId}/mode`, {
        method: 'PATCH',
        body: JSON.stringify({ mode }),
    });
}

export async function approveScheduleVersion(versionId: string, approvedByUserId?: string) {
    return fetchApi(`/schedule/version/${versionId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ approvedByUserId }),
    });
}

export async function rejectScheduleVersion(
    versionId: string,
    rejectedByUserId?: string,
    reason?: string,
) {
    return fetchApi(`/schedule/version/${versionId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ rejectedByUserId, reason }),
    });
}

// ─── Events ──────────────────────────────────────────────────────────
export type EventType =
    | 'TRACK_CLOSURE'
    | 'LOCOMOTIVE_FAILURE'
    | 'CREW_ABSENCE'
    | 'LATE_TRAIN'
    | 'MAINTENANCE'
    | 'WEATHER'
    | 'CAPACITY_CONFLICT'
    // Backward-compatible aliases
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

// ─── Scheduling ──────────────────────────────────────────────────────
export async function runScheduling(data: {
    stationId: string;
    reason?: string;
    baseVersionId?: string | null;
}) {
    return fetchApi('/scheduling/run', { method: 'POST', body: JSON.stringify(data) });
}

export async function getLatestScheduleVersion(stationId: string) {
    return fetchApi(`/scheduling/latest?stationId=${stationId}`);
}

// ─── Conflicts ───────────────────────────────────────────────────────
export async function getConflicts(params: { versionId?: string; stationId?: string }) {
    const qs = new URLSearchParams();
    if (params.versionId) qs.set('versionId', params.versionId);
    if (params.stationId) qs.set('stationId', params.stationId);
    return fetchApi(`/conflicts?${qs.toString()}`);
}

// ─── Analytics ───────────────────────────────────────────────────────
export async function getAnalytics(stationId: string, versionId?: string) {
    const params = new URLSearchParams({ stationId });
    if (versionId) params.set('versionId', versionId);
    return fetchApi(`/analytics/node-overview?${params}`);
}

export async function getAssistantInsights(stationId: string) {
    const params = new URLSearchParams({ stationId });
    return fetchApi(`/analytics/assistant?${params.toString()}`);
}

export async function getDashboardNotifications(stationId: string) {
    const params = new URLSearchParams({ stationId });
    return fetchApi(`/analytics/notifications?${params.toString()}`);
}
