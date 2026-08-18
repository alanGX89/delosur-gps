import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { getDevices } from "../api/client";
import type { HistoryPoint, TrackingDevice } from "../api/client";
import { normalizeStatus, statusColor, statusLabel } from "../status";
import type { NormalizedStatus } from "../status";
import VehicleMarker from "../components/VehicleMarker";
import HistoryPanel from "../components/HistoryPanel";

const POLL_MS = 15000;
const CENTER: [number, number] = [-33.06, -60.65];
const FILTERABLE_STATUSES: NormalizedStatus[] = ["moving", "engine", "stopped", "offline"];
const STATUS_LABELS: Record<NormalizedStatus, string> = {
  moving: "en movimiento",
  engine: "motor encendido",
  stopped: "detenidos",
  offline: "sin conexión",
  blocked: "bloqueados",
};

function filterStatus(status: NormalizedStatus): NormalizedStatus {
  // "blocked" no tiene chip propio; se cuenta junto a "detenidos".
  return status === "blocked" ? "stopped" : status;
}

function FlyTo({ device }: { device: TrackingDevice | null }) {
  const map = useMap();
  useEffect(() => {
    if (device) {
      map.flyTo([device.lat, device.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [device, map]);
  return null;
}

export default function Dashboard() {
  const [devices, setDevices] = useState<TrackingDevice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<Set<NormalizedStatus>>(
    () => new Set(FILTERABLE_STATUSES)
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  function toggleStatus(status: NormalizedStatus) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  async function load() {
    try {
      const data = await getDevices();
      setDevices(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al obtener los vehículos");
    }
  }

  useEffect(() => {
    load();
    timerRef.current = window.setInterval(load, POLL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const visibleDevices = useMemo(
    () =>
      devices.filter((d) => activeStatuses.has(filterStatus(normalizeStatus(d.online)))),
    [devices, activeStatuses]
  );

  const filtered = useMemo(
    () =>
      visibleDevices
        .filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [visibleDevices, query]
  );

  const selected = devices.find((d) => d.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const c = { moving: 0, engine: 0, stopped: 0, offline: 0, blocked: 0 };
    for (const d of devices) {
      c[normalizeStatus(d.online)]++;
    }
    return c;
  }, [devices]);

  return (
    <div className="dashboard">
      <header className="topbar">
        <button
          className="menu-toggle"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Ver flota"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div className="topbar-stats">
          {FILTERABLE_STATUSES.map((status) => {
            const active = activeStatuses.has(status);
            const color = statusColor(status);
            return (
              <button
                key={status}
                type="button"
                className={active ? "stat active" : "stat"}
                style={
                  active
                    ? { background: color, borderColor: color }
                    : { borderColor: color, color }
                }
                onClick={() => toggleStatus(status)}
                title={active ? "Click para ocultar" : "Click para mostrar"}
              >
                {counts[status]} {STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>
        <span className="updated-inline">
          {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString()}` : "Cargando..."}
        </span>
      </header>

      <div className="dashboard-body">
        {mobileNavOpen && (
          <div className="sidebar-overlay" onClick={() => setMobileNavOpen(false)} />
        )}
        <aside className={mobileNavOpen ? "sidebar open" : "sidebar"}>
          <button
            className="sidebar-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar"
          >
            ✕
          </button>
          <input
            className="search"
            placeholder="Buscar vehículo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {error && <p className="list-error">{error}</p>}
          <p className="updated-at">
            {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString()}` : "Cargando..."}
          </p>
          <ul className="vehicle-list">
            {filtered.map((d) => (
              <li
                key={d.id}
                className={d.id === selectedId ? "vehicle-item selected" : "vehicle-item"}
                onClick={() => {
                  setSelectedId(d.id);
                  setHistoryOpen(false);
                  setHistoryPoints([]);
                  setMobileNavOpen(false);
                }}
              >
                <span className="dot" style={{ background: statusColor(d.online) }} />
                <div className="vehicle-info">
                  <span className="vehicle-name">{d.name}</span>
                  <span className="vehicle-meta">
                    {statusLabel(d.online)} · {d.speed} km/h
                  </span>
                </div>
                {d.id === selectedId && (
                  <button
                    className="history-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryOpen(true);
                    }}
                  >
                    Historial
                  </button>
                )}
              </li>
            ))}
            {filtered.length === 0 && !error && <li className="empty">Sin resultados</li>}
          </ul>
        </aside>

        <main className="map-wrap">
          <MapContainer center={CENTER} zoom={12} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {visibleDevices.map((d) => (
              <VehicleMarker
                key={d.id}
                device={d}
                selected={d.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
            {!historyOpen && selected && selected.tail.length > 1 && (
              <Polyline
                positions={selected.tail.map((p) => [Number(p.lat), Number(p.lng)])}
                pathOptions={{ color: "#e1233a", weight: 3 }}
              />
            )}
            {historyOpen && historyPoints.length > 1 && (
              <>
                <Polyline
                  positions={historyPoints.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: "#0086c8", weight: 4, dashArray: "1 8", lineCap: "round" }}
                />
                <CircleMarker
                  center={[historyPoints[0].lat, historyPoints[0].lng]}
                  radius={7}
                  pathOptions={{ color: "#fff", weight: 2, fillColor: "#1f9d55", fillOpacity: 1 }}
                />
                <CircleMarker
                  center={[
                    historyPoints[historyPoints.length - 1].lat,
                    historyPoints[historyPoints.length - 1].lng,
                  ]}
                  radius={7}
                  pathOptions={{ color: "#fff", weight: 2, fillColor: "#e1233a", fillOpacity: 1 }}
                />
              </>
            )}
            <FlyTo device={selected} />
          </MapContainer>
        </main>

        {historyOpen && selected && (
          <HistoryPanel
            device={selected}
            onClose={() => {
              setHistoryOpen(false);
              setHistoryPoints([]);
            }}
            onResult={setHistoryPoints}
          />
        )}
      </div>

      <style>{`
        .dashboard {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .topbar {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 10px 20px;
          background: var(--surface);
          border-bottom: 1px solid var(--line);
          color: var(--ink);
        }
        .updated-inline {
          font-size: 11px;
          font-family: var(--mono);
          color: var(--muted);
          white-space: nowrap;
        }
        .menu-toggle {
          display: none;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--ink-soft);
          border-radius: 6px;
          width: 34px;
          height: 34px;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex: none;
        }
        .menu-toggle:hover { background: var(--surface-2); }
        .topbar-stats {
          display: flex;
          gap: 8px;
          flex: 1;
          flex-wrap: wrap;
        }
        .stat {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: var(--mono);
          font-size: 12.5px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1.5px solid var(--line);
          background: var(--surface);
          color: var(--ink-soft);
          cursor: pointer;
          transition: opacity .15s, background .15s;
        }
        .stat.active { color: #fff; border-color: transparent; }
        .stat:not(.active) { opacity: .7; }
        .stat:hover { opacity: 1; }

        .dashboard-body {
          flex: 1;
          display: flex;
          min-height: 0;
        }
        .sidebar {
          width: 300px;
          border-right: 1px solid var(--line);
          background: var(--surface);
          display: flex;
          flex-direction: column;
          padding: 14px;
          gap: 10px;
          flex: none;
        }
        .sidebar-close { display: none; }
        .sidebar-overlay { display: none; }
        .search {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 9px 10px;
          font-size: 13px;
          background: var(--bg);
          color: var(--ink);
        }
        .updated-at {
          margin: 0;
          font-size: 11px;
          font-family: var(--mono);
          color: var(--muted);
        }
        .list-error {
          margin: 0;
          font-size: 12px;
          color: var(--danger);
        }
        .vehicle-list {
          list-style: none;
          margin: 0;
          padding: 0;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .vehicle-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 8px;
          cursor: pointer;
        }
        .vehicle-item:hover { background: var(--surface-2); }
        .vehicle-item.selected { background: var(--sky); }
        .history-toggle {
          margin-left: auto;
          background: var(--navy);
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 5px 9px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          flex: none;
        }
        .history-toggle:hover { background: var(--navy-deep); }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex: none;
        }
        .vehicle-info { display: flex; flex-direction: column; }
        .vehicle-name { font-size: 13.5px; font-weight: 600; color: var(--ink); }
        .vehicle-meta { font-size: 11.5px; color: var(--muted); }
        .empty { padding: 10px; font-size: 13px; color: var(--muted); }

        .map-wrap { flex: 1; min-width: 0; }

        @media (max-width: 860px) {
          .menu-toggle { display: flex; }
          .topbar { gap: 10px; padding: 8px 12px; flex-wrap: nowrap; }
          .topbar-stats { display: none; }
          .updated-inline { display: none; }

          .dashboard-body { position: relative; }
          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 86vw;
            max-width: 340px;
            z-index: 60;
            transform: translateX(-100%);
            transition: transform .25s ease;
            box-shadow: 10px 0 30px rgba(2,12,40,.3);
            padding-top: 44px;
          }
          .sidebar.open { transform: translateX(0); }
          .sidebar-close {
            display: flex;
            position: absolute;
            top: 8px;
            right: 8px;
            width: 30px;
            height: 30px;
            align-items: center;
            justify-content: center;
            background: var(--surface-2);
            border: 1px solid var(--line);
            border-radius: 7px;
            font-size: 13px;
            color: var(--ink-soft);
            cursor: pointer;
          }
          .sidebar-overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(2,12,40,.45);
            z-index: 55;
          }
        }

      `}</style>
    </div>
  );
}
