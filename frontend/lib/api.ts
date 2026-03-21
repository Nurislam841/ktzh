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

export async function getNodeDecisionQueue(stationId: string, hours?: number) {
    const params = new URLSearchParams({ stationId });
    if (hours) params.set('hours', String(hours));
    return fetchApi(`/node/decision-queue?${params.toString()}`);
}

export async function getCrewCalls(stationId: string, hours?: number) {
    const params = new URLSearchParams({ stationId });
    if (hours) params.set('hours', String(hours));
    return fetchApi(`/crew-calls?${params.toString()}`);
}

export async function updateCrewCallStatus(
    id: string,
    data: { status: 'PLANNED' | 'NOTIFIED' | 'CONFIRMED' | 'MISSED' | 'CANCELLED'; notes?: string },
) {
    return fetchApi(`/crew-calls/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}

export async function getStations() {
    return fetchApi<{ stations: Array<{ id: string; name: string; code?: string | null; versions: number; trainRuns: number; locomotives: number; tracks: number; active: boolean }> }>('/node/stations');
}

export function getTrains() {
    return fetchApi<Array<{ id: string; number: string; movementType?: string }>>('/node/trains');
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

export async function getGlobalLocomotives() {
    return fetchApi<any[]>('/node/locomotives');
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

// ─── Optimizer ───────────────────────────────────────────────────────
export async function solveLap(stationId: string) {
    return fetchApi(`/optimizer/station/${stationId}/solve-lap`, { method: 'POST' });
}

export async function approveLap(stationId: string, data: { locomotiveId: string, trainRunId: string, recommendationType: string }) {
    return fetchApi(`/optimizer/station/${stationId}/approve-lap`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}


// ─── Binding Domain ──────────────────────────────────────────────────
export async function getBindings(filters?: {
    periodId?: string;
    stationId?: string;
    status?: string;
    skip?: number;
    take?: number;
}) {
    const params = new URLSearchParams();
    if (filters?.periodId) params.set('periodId', filters.periodId);
    if (filters?.stationId) params.set('stationId', filters.stationId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.skip) params.set('skip', String(filters.skip));
    if (filters?.take) params.set('take', String(filters.take));
    return fetchApi<{ items: any[]; total: number }>(`/api/v1/bindings?${params.toString()}`);
}

export async function getBindingDetail(bindingId: string) {
    return fetchApi(`/api/v1/bindings/${bindingId}`);
}

export async function createBinding(data: {
    periodId: string;
    turnaroundStationId: string;
    arrivalTrainId: string;
    arrivalDt: string;
    departureTrainId: string;
    departureDt: string;
    dwellMinutes?: number;
}) {
    return fetchApi('/api/v1/bindings', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function runBindingConflictCheck(periodId: string) {
    return fetchApi<{ checked: number; conflicts: any[] }>('/api/v1/conflicts/check', {
        method: 'POST',
        body: JSON.stringify({ periodId }),
    });
}

export async function getBindingConflicts(filters?: {
    periodId?: string;
    code?: string;
    bindingId?: string;
}) {
    const params = new URLSearchParams();
    if (filters?.periodId) params.set('periodId', filters.periodId);
    if (filters?.code) params.set('code', filters.code);
    if (filters?.bindingId) params.set('bindingId', filters.bindingId);
    return fetchApi<any[]>(`/api/v1/conflicts?${params.toString()}`);
}

export async function calculateBindingKpi(periodId: string, scopeType?: string, scopeId?: string) {
    return fetchApi('/api/v1/kpi/calculate', {
        method: 'POST',
        body: JSON.stringify({ periodId, scopeType, scopeId }),
    });
}

export async function getBindingKpi(periodId: string, scopeType?: string) {
    const params = new URLSearchParams({ periodId });
    if (scopeType) params.set('scopeType', scopeType);
    return fetchApi<any[]>(`/api/v1/kpi?${params.toString()}`);
}

export async function getConflictsSummary(periodId: string) {
    return fetchApi<{ periodId: string; total: number; byCode: Record<string, number> }>(
        `/api/v1/kpi/conflicts-summary?periodId=${periodId}`,
    );
}

export async function getLocomotiveModels() {
    return fetchApi<any[]>('/api/v1/reference/locomotive-models');
}

export async function getServiceShoulders(filters?: { depotId?: string; modelId?: string }) {
    const params = new URLSearchParams();
    if (filters?.depotId) params.set('depotId', filters.depotId);
    if (filters?.modelId) params.set('modelId', filters.modelId);
    return fetchApi<any[]>(`/api/v1/reference/shoulders?${params.toString()}`);
}
