export interface SourceHealth {
  name: string;
  ok: boolean;
  devices: number;
  checkedAt: string;
  lastOkAt: string | null;
  error: string | null;
}

// Resultado de la última consulta a cada fuente de tracking, para el panel del admin.
const sourceHealth = new Map<string, SourceHealth>();

export function recordSourceHealth(name: string, devices: number, error: string | null): void {
  const now = new Date().toISOString();
  sourceHealth.set(name, {
    name,
    ok: !error,
    devices,
    checkedAt: now,
    lastOkAt: error ? sourceHealth.get(name)?.lastOkAt ?? null : now,
    error,
  });
}

export function getSourceHealth(): SourceHealth[] {
  return [...sourceHealth.values()].sort((a, b) => a.name.localeCompare(b.name));
}
