export interface TrackingSensor {
  id: number;
  type: string;
  name: string;
  value: string;
}

export interface TrackingDevice {
  id: number;
  name: string;
  online: "moving" | "stopped" | "offline" | "engine" | "blocked" | string;
  time: string;
  lat: number;
  lng: number;
  course: number;
  speed: number;
  icon_color: string;
  address: string;
  driver: string;
  sensors: TrackingSensor[];
  tail: { lat: string; lng: string }[];
  stop_duration: string;
  engine_status: boolean;
  total_distance: number;
  unit_of_distance: string;
}

export interface HistoryPoint {
  lat: number;
  lng: number;
  speed: string;
  course: string;
  recorded_at: string;
}

export interface SessionUser {
  id: number;
  username: string;
  role: "admin" | "user";
  fullName: string | null;
  logoPath: string | null;
  colorPrimary: string;
  colorAccent: string;
  colorSecondary: string;
}

export type UserStatus = "active" | "blocked" | "suspended";
export type EffectiveStatus = UserStatus | "scheduled" | "expired";

export interface AdminUser extends SessionUser {
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: UserStatus;
  effectiveStatus: EffectiveStatus;
  validFrom: string | null;
  validUntil: string | null;
  createdBy: number | null;
  createdByUsername: string | null;
  createdAt: string;
  deviceIds: number[];
  deviceNames: string[];
}

export interface UserPayload {
  username: string;
  password?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  role?: "admin" | "user";
  colorPrimary?: string;
  colorAccent?: string;
  colorSecondary?: string;
  deviceIds?: number[];
  validFrom?: string | null;
  validUntil?: string | null;
  clearSchedule?: boolean;
}

export interface AuditLogEntry {
  id: string;
  user_id?: number;
  target_username?: string;
  actor_id: number | null;
  actor_username: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

const TOKEN_KEY = "delosur_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Sesión expirada");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Error de red");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function login(username: string, password: string) {
  return request<{ token: string; user: SessionUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function getMe() {
  return request<SessionUser>("/api/me");
}

export function getDevices() {
  return request<TrackingDevice[]>("/api/devices");
}

export function getDeviceHistory(deviceId: number, from: string, to: string) {
  return request<HistoryPoint[]>(
    `/api/devices/${deviceId}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
}

export function getUsers() {
  return request<AdminUser[]>("/api/admin/users");
}

export function createUser(payload: UserPayload) {
  return request<AdminUser>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(id: number, payload: Partial<UserPayload>) {
  return request<AdminUser>(`/api/admin/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteUser(id: number) {
  return request<void>(`/api/admin/users/${id}`, { method: "DELETE" });
}

export async function uploadUserLogo(id: number, file: File) {
  const form = new FormData();
  form.append("logo", file);
  return request<{ logoPath: string }>(`/api/admin/users/${id}/logo`, {
    method: "POST",
    body: form,
  });
}

export function blockUser(id: number) {
  return request<{ ok: true; status: UserStatus }>(`/api/admin/users/${id}/block`, {
    method: "POST",
  });
}

export function unblockUser(id: number) {
  return request<{ ok: true; status: UserStatus }>(`/api/admin/users/${id}/unblock`, {
    method: "POST",
  });
}

export function suspendUser(id: number) {
  return request<{ ok: true; status: UserStatus }>(`/api/admin/users/${id}/suspend`, {
    method: "POST",
  });
}

export function unsuspendUser(id: number) {
  return request<{ ok: true; status: UserStatus }>(`/api/admin/users/${id}/unsuspend`, {
    method: "POST",
  });
}

export function getUserLogs(id: number) {
  return request<AuditLogEntry[]>(`/api/admin/users/${id}/logs`);
}

export function getAuditLog() {
  return request<AuditLogEntry[]>("/api/admin/audit-log");
}
