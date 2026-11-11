import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getAdminOverview } from "../api/client";
import type { AdminOverview as OverviewData, OverviewClient, OverviewDevice } from "../api/client";
import { normalizeStatus, statusColor, statusLabel } from "../status";
import type { NormalizedStatus } from "../status";

const REFRESH_MS = 60000;
const SPEED_KEY = "delosur_speed_limit";
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MS = DAY_MS;
const INACTIVE_MS = 30 * DAY_MS;
const EXPIRING_MS = 7 * DAY_MS;

const FLEET_TILES: { status: NormalizedStatus; label: string }[] = [
  { status: "moving", label: "En movimiento" },
  { status: "engine", label: "Motor encendido" },
  { status: "stopped", label: "Detenidos" },
  { status: "offline", label: "Sin conexión" },
];

const CLIENT_STATUS_LABELS: Record<string, string> = {
  active: "Activos",
  blocked: "Bloqueados",
  suspended: "Suspendidos",
  expired: "Vencidos",
  scheduled: "Programados",
};

const ACTION_LABELS: Record<string, string> = {
  created: "Usuario creado",
  updated: "Datos actualizados",
  blocked: "Bloqueado",
  unblocked: "Desbloqueado",
  suspended: "Suspendido",
  unsuspended: "Reanudado",
  logo_updated: "Logo actualizado",
};

type DetailKey = "unassigned" | "stale" | "speeding" | "expiring" | "never" | "inactive" | "noDevices";

const DETAIL_TITLES: Record<DetailKey, string> = {
  unassigned: "Vehículos sin asignar a ningún cliente",
  stale: "Vehículos sin señal hace más de 24 horas",
  speeding: "Vehículos sobre el límite de velocidad",
  expiring: "Clientes con acceso por vencer (7 días)",
  never: "Clientes que nunca ingresaron",
  inactive: "Clientes sin ingresar hace más de 30 días",
  noDevices: "Clientes sin vehículos asignados",
};

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "—";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function readSpeedLimit(): number {
  const n = Number(localStorage.getItem(SPEED_KEY));
  return n > 0 ? n : 90;
}

/** Últimos 30 días (incluido hoy) en la zona horaria del servidor, con 0 en los días sin ingresos. */
function lastDays(rows: { day: string; count: number }[], timeZone: string, now: number) {
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: 30 }, (_, i) => {
    const day = fmt.format(new Date(now - (29 - i) * DAY_MS));
    return { day, count: byDay.get(day) ?? 0 };
  });
}

function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

function LoginsChart({ days }: { days: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-total">{total}</span>
        <span className="muted">ingresos en 30 días</span>
      </div>
      <div className="chart-plot" onMouseLeave={() => setHover(null)}>
        {total > 0 ? (
          <>
            <span className="chart-max">{max}</span>
            <div className="chart-gridline" />
          </>
        ) : (
          <p className="chart-empty">Ningún cliente ingresó en los últimos 30 días.</p>
        )}
        <div className="chart-bars">
          {days.map((d, i) => (
            <div
              key={d.day}
              className="chart-col"
              onMouseEnter={() => setHover(i)}
              aria-label={`${shortDay(d.day)}: ${d.count} ingresos`}
              role="img"
            >
              <div
                className={hover === i ? "chart-bar hover" : "chart-bar"}
                style={{ height: d.count ? `${(d.count / max) * 100}%` : 0 }}
              />
            </div>
          ))}
        </div>
        {hover !== null && (
          <div
            className="chart-tip"
            // Acotado para que el tooltip de los extremos no se salga de la tarjeta.
            style={{ left: `${Math.min(88, Math.max(12, ((hover + 0.5) / days.length) * 100))}%` }}
          >
            <strong>{days[hover].count}</strong> {days[hover].count === 1 ? "ingreso" : "ingresos"}
            <span>{shortDay(days[hover].day)}</span>
          </div>
        )}
      </div>
      <div className="chart-axis">
        <span>{shortDay(days[0].day)}</span>
        <span>{shortDay(days[14].day)}</span>
        <span>Hoy</span>
      </div>
    </div>
  );
}

function AlertRow({
  k,
  count,
  label,
  detail,
  onToggle,
  children,
}: {
  k: DetailKey;
  count: number;
  label: string;
  detail: DetailKey | null;
  onToggle: (key: DetailKey) => void;
  children?: ReactNode;
}) {
  return (
    <div className={count > 0 ? "alert-row warn" : "alert-row"}>
      <span className="alert-count">{count}</span>
      <span className="alert-label">
        {label}
        {children}
      </span>
      <button className={detail === k ? "link-btn active" : "link-btn"} onClick={() => onToggle(k)}>
        {detail === k ? "Ocultar" : "Ver"}
      </button>
    </div>
  );
}

function DeviceTable({ devices, now }: { devices: OverviewDevice[]; now: number }) {
  if (devices.length === 0) return <p className="empty-row">Ninguno. Todo en orden.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Vehículo</th>
          <th>Estado</th>
          <th>Velocidad</th>
          <th>Último reporte</th>
          <th>Proveedor</th>
        </tr>
      </thead>
      <tbody>
        {devices.map((d) => (
          <tr key={d.id}>
            <td className="ink">{d.name}</td>
            <td>
              <span className="status-dot" style={{ background: statusColor(d.online) }} />
              {statusLabel(d.online)}
            </td>
            <td className="mono">{d.speed} km/h</td>
            <td className="muted">{timeAgo(d.lastReportAt, now)}</td>
            <td className="muted">{d.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClientTable({ clients, now }: { clients: OverviewClient[]; now: number }) {
  if (clients.length === 0) return <p className="empty-row">Ninguno. Todo en orden.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Estado</th>
          <th>Vehículos</th>
          <th>Último ingreso</th>
          <th>Vence</th>
        </tr>
      </thead>
      <tbody>
        {clients.map((c) => (
          <tr key={c.id}>
            <td>
              <span className="ink">{c.username}</span>
              {c.fullName && <span className="muted"> · {c.fullName}</span>}
            </td>
            <td className="muted">{CLIENT_STATUS_LABELS[c.effectiveStatus] ?? c.effectiveStatus}</td>
            <td className="mono">{c.deviceCount}</td>
            <td className="muted">{c.lastLoginAt ? timeAgo(c.lastLoginAt, now) : "Nunca"}</td>
            <td className="muted">{formatDate(c.validUntil)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [speedLimit, setSpeedLimit] = useState(readSpeedLimit);
  const detailRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      setData(await getAdminOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el panel");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(SPEED_KEY, String(speedLimit));
  }, [speedLimit]);

  useEffect(() => {
    if (detail) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [detail]);

  const now = data ? new Date(data.generatedAt).getTime() : Date.now();

  const view = useMemo(() => {
    if (!data) return null;
    const counts: Record<NormalizedStatus, number> = { moving: 0, engine: 0, stopped: 0, offline: 0, blocked: 0 };
    for (const d of data.devices) counts[normalizeStatus(d.online)]++;
    // "Bloqueado" no tiene tarjeta propia: se suma a detenidos, como en el mapa.
    counts.stopped += counts.blocked;

    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const devices = {
      unassigned: data.devices.filter((d) => !d.assigned).sort(byName),
      stale: data.devices
        .filter((d) => !d.lastReportAt || now - new Date(d.lastReportAt).getTime() > STALE_MS)
        .sort((a, b) => (a.lastReportAt ?? "").localeCompare(b.lastReportAt ?? "")),
      speeding: data.devices.filter((d) => d.speed > speedLimit).sort((a, b) => b.speed - a.speed),
    };

    const usable = data.clients.filter((c) => c.effectiveStatus === "active");
    const clients = {
      expiring: usable.filter(
        (c) => c.validUntil && new Date(c.validUntil).getTime() - now < EXPIRING_MS
      ),
      never: data.clients.filter((c) => !c.lastLoginAt),
      inactive: data.clients.filter(
        (c) => c.lastLoginAt && now - new Date(c.lastLoginAt).getTime() > INACTIVE_MS
      ),
      noDevices: data.clients.filter((c) => c.deviceCount === 0),
    };

    const clientStatus: Record<string, number> = {};
    for (const c of data.clients) clientStatus[c.effectiveStatus] = (clientStatus[c.effectiveStatus] ?? 0) + 1;

    return {
      counts,
      devices,
      clients,
      clientStatus,
      days: lastDays(data.loginsByDay, data.timeZone, now),
    };
  }, [data, now, speedLimit]);

  function toggle(key: DetailKey) {
    setDetail((d) => (d === key ? null : key));
  }

  const rowProps = { detail, onToggle: toggle };

  return (
    <div className="overview-screen">
      <main className="overview-main">
        <div className="page-head">
          <div>
            <h1>Panel general</h1>
            <p>Estado de la flota, los proveedores y los clientes. Se actualiza solo cada minuto.</p>
          </div>
          <div className="head-actions">
            {data && <span className="muted mono">Actualizado {new Date(data.generatedAt).toLocaleTimeString()}</span>}
            <button className="refresh-btn" onClick={load} disabled={loading}>
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {error && <p className="banner-error">{error}</p>}
        {!data && !error && <p className="empty-row">Cargando...</p>}

        {data && view && (
          <>
            <section className="tiles">
              <div className="tile">
                <span className="tile-value">{data.devices.length}</span>
                <span className="tile-label">Vehículos en total</span>
              </div>
              {FLEET_TILES.map((t) => (
                <div className="tile" key={t.status}>
                  <span className="tile-value">{view.counts[t.status]}</span>
                  <span className="tile-label">
                    <span className="status-dot" style={{ background: statusColor(t.status) }} />
                    {t.label}
                  </span>
                </div>
              ))}
            </section>

            <section className="grid">
              <div className="card">
                <h2>Requieren atención</h2>
                <AlertRow {...rowProps} k="unassigned" count={view.devices.unassigned.length} label="vehículos sin asignar a un cliente" />
                <AlertRow {...rowProps} k="stale" count={view.devices.stale.length} label="sin señal hace más de 24 h" />
                <AlertRow {...rowProps} k="speeding" count={view.devices.speeding.length} label="sobre ">
                  <input
                    className="speed-input"
                    type="number"
                    min={10}
                    max={200}
                    step={5}
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(Math.max(1, Number(e.target.value) || 0))}
                    aria-label="Límite de velocidad en km/h"
                  />
                  km/h ahora
                </AlertRow>
              </div>

              <div className="card">
                <h2>Proveedores de rastreo</h2>
                {data.sources.length === 0 && <p className="muted small">Esperando la primera consulta…</p>}
                {data.sources.map((s) => (
                  <div className="source-row" key={s.name}>
                    <span className={s.ok ? "pill ok" : "pill bad"}>{s.ok ? "✓ OK" : "✕ Error"}</span>
                    <div className="source-text">
                      <span className="ink">{s.name}</span>
                      <span className="muted small">
                        {s.ok
                          ? `${s.devices} vehículos · consultado ${timeAgo(s.checkedAt, now)}`
                          : `Último dato bueno ${timeAgo(s.lastOkAt, now)} · ${s.error}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2>Clientes</h2>
                <div className="client-status">
                  {Object.entries(CLIENT_STATUS_LABELS)
                    .filter(([k]) => k === "active" || view.clientStatus[k])
                    .map(([k, label]) => (
                      <span key={k}>
                        <strong>{view.clientStatus[k] ?? 0}</strong> {label.toLowerCase()}
                      </span>
                    ))}
                </div>
                <AlertRow {...rowProps} k="expiring" count={view.clients.expiring.length} label="con acceso por vencer (7 días)" />
                <AlertRow {...rowProps} k="never" count={view.clients.never.length} label="nunca ingresaron" />
                <AlertRow {...rowProps} k="inactive" count={view.clients.inactive.length} label="sin ingresar hace más de 30 días" />
                <AlertRow {...rowProps} k="noDevices" count={view.clients.noDevices.length} label="sin vehículos asignados" />
              </div>

              <div className="card">
                <h2>Ingresos de clientes</h2>
                <LoginsChart days={view.days} />
              </div>
            </section>

            {detail && (
              <section className="card detail" ref={detailRef}>
                <div className="detail-head">
                  <h2>{DETAIL_TITLES[detail]}</h2>
                  <button className="link-btn" onClick={() => setDetail(null)}>
                    Cerrar
                  </button>
                </div>
                <div className="table-wrap">
                  {detail === "unassigned" || detail === "stale" || detail === "speeding" ? (
                    <DeviceTable devices={view.devices[detail]} now={now} />
                  ) : (
                    <ClientTable clients={view.clients[detail]} now={now} />
                  )}
                </div>
              </section>
            )}

            <section className="card">
              <h2>Últimos cambios de administración</h2>
              {data.recentActions.length === 0 && <p className="muted small">Sin cambios registrados.</p>}
              <ul className="actions">
                {data.recentActions.map((a) => (
                  <li key={a.id}>
                    <span className="action-badge">{ACTION_LABELS[a.action] ?? a.action}</span>
                    <span className="ink">{a.target_username ?? "—"}</span>
                    <span className="muted">por {a.actor_username ?? "Sistema"}</span>
                    <span className="muted mono right">{timeAgo(a.created_at, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>

      <style>{`
        .overview-screen { background: var(--bg); min-height: 100%; }
        .overview-main { max-width: 1200px; margin: 0 auto; padding: 32px 24px 60px; display: flex; flex-direction: column; gap: 16px; }
        .page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
        .page-head h1 { margin: 0 0 6px; font-size: 22px; font-weight: 800; color: var(--ink); letter-spacing: -0.01em; }
        .page-head p { margin: 0; font-size: 13.5px; color: var(--muted); max-width: 60ch; }
        .head-actions { display: flex; align-items: center; gap: 12px; font-size: 12px; }
        .refresh-btn {
          background: var(--navy); color: #fff; border: none; border-radius: 8px;
          padding: 8px 14px; font-size: 13px; font-weight: 700; cursor: pointer;
        }
        .refresh-btn:disabled { opacity: .6; cursor: default; }
        .banner-error { margin: 0; padding: 12px 16px; border-radius: 8px; background: var(--surface); border: 1px solid var(--danger); color: var(--danger); font-size: 13px; }

        .tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .tile, .card {
          background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
          box-shadow: 0 1px 2px rgba(2, 12, 40, 0.04);
        }
        .tile { padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
        .tile-value { font-size: 30px; font-weight: 800; color: var(--ink); line-height: 1.1; font-variant-numeric: tabular-nums; }
        .tile-label { font-size: 12.5px; color: var(--ink-soft); display: inline-flex; align-items: center; gap: 6px; }
        .status-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; flex: none; }
        .tile-label .status-dot { margin-right: 0; }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .card { padding: 18px 20px; }
        .card h2 { margin: 0 0 12px; font-size: 13px; font-weight: 800; color: var(--ink); text-transform: uppercase; letter-spacing: .04em; }

        .alert-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--ink-soft); }
        .alert-row:first-of-type { border-top: none; }
        .alert-count { min-width: 60px; font-size: 18px; font-weight: 800; color: var(--muted); font-variant-numeric: tabular-nums; }
        .alert-row.warn .alert-count { color: var(--ink); }
        .alert-row.warn .alert-count::before { content: "⚠ "; font-size: 12px; color: var(--warn); }
        .alert-label { flex: 1; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .speed-input { width: 64px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); font-size: 13px; }
        .link-btn { background: none; border: 1px solid var(--line); color: var(--blue); border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .link-btn:hover, .link-btn.active { background: var(--surface-2); }

        .source-row { display: flex; align-items: flex-start; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line); }
        .source-row:first-of-type { border-top: none; }
        .source-text { display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; min-width: 0; }
        .source-text .small { overflow-wrap: anywhere; }
        .pill { flex: none; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .pill.ok { background: rgba(31, 157, 85, .12); color: var(--ok); }
        .pill.bad { background: rgba(225, 35, 58, .12); color: var(--danger); }

        .client-status { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--ink-soft); margin-bottom: 6px; }
        .client-status strong { color: var(--ink); }

        .chart-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; font-size: 13px; }
        .chart-total { font-size: 24px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
        .chart-plot { position: relative; height: 130px; border-bottom: 1px solid var(--line); }
        .chart-max { position: absolute; top: -2px; left: 0; font-size: 10.5px; color: var(--muted); font-family: var(--mono); }
        .chart-gridline { position: absolute; top: 14px; left: 0; right: 0; border-top: 1px dashed var(--line); }
        .chart-bars { position: absolute; inset: 14px 0 0 0; display: flex; align-items: flex-end; gap: 2px; }
        .chart-col { flex: 1; height: 100%; display: flex; align-items: flex-end; cursor: default; }
        .chart-bar { width: 100%; background: var(--blue); border-radius: 4px 4px 0 0; min-height: 0; transition: opacity .12s; }
        .chart-bars:hover .chart-bar { opacity: .45; }
        .chart-bars:hover .chart-bar.hover { opacity: 1; }
        .chart-tip {
          position: absolute; bottom: calc(100% - 8px); transform: translateX(-50%);
          background: var(--ink); color: var(--surface); border-radius: 6px; padding: 5px 9px;
          font-size: 12px; white-space: nowrap; pointer-events: none; display: flex; gap: 6px; align-items: baseline;
        }
        .chart-tip span { opacity: .75; font-size: 11px; }
        .chart-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; margin: 0; font-size: 12.5px; color: var(--muted); }
        .chart-axis { display: flex; justify-content: space-between; margin-top: 6px; font-size: 10.5px; color: var(--muted); font-family: var(--mono); }

        .detail-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
        .detail-head h2 { margin: 0; }
        .table-wrap { overflow-x: auto; max-height: 420px; overflow-y: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
        thead th { position: sticky; top: 0; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; background: var(--surface-2); }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:hover { background: var(--surface-2); }

        .actions { list-style: none; margin: 0; padding: 0; }
        .actions li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px; flex-wrap: wrap; }
        .actions li:first-child { border-top: none; }
        .action-badge { padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #E4F0FA; color: var(--blue); white-space: nowrap; }
        .right { margin-left: auto; }

        .ink { color: var(--ink); font-weight: 700; }
        .muted { color: var(--muted); }
        .small { font-size: 12px; }
        .mono { font-family: var(--mono); font-size: 12px; white-space: nowrap; }
        .empty-row { text-align: center; color: var(--muted); padding: 24px; margin: 0; font-size: 13px; }

        @media (max-width: 980px) {
          .tiles { grid-template-columns: repeat(3, 1fr); }
          .grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .overview-main { padding: 20px 14px 40px; }
          .tiles { grid-template-columns: repeat(2, 1fr); }
          .tile-value { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
