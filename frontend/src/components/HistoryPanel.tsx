import { useState } from "react";
import { getDeviceHistory } from "../api/client";
import type { HistoryPoint, TrackingDevice } from "../api/client";

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: toLocalInputValue(from), to: toLocalInputValue(to) };
}

export default function HistoryPanel({
  device,
  onClose,
  onResult,
}: {
  device: TrackingDevice;
  onClose: () => void;
  onResult: (points: HistoryPoint[]) => void;
}) {
  const [range, setRange] = useState(defaultRange());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    try {
      const data = await getDeviceHistory(
        device.id,
        new Date(range.from).toISOString(),
        new Date(range.to).toISOString()
      );
      setPoints(data);
      onResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo obtener el historial");
      setPoints(null);
      onResult([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <div>
          <p className="history-title">Historial de recorrido</p>
          <p className="history-subtitle">{device.name}</p>
        </div>
        <button className="history-close" onClick={onClose} aria-label="Cerrar historial">
          ✕
        </button>
      </div>

      <div className="history-fields">
        <label>
          <span>Desde</span>
          <input
            type="datetime-local"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </label>
        <label>
          <span>Hasta</span>
          <input
            type="datetime-local"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </label>
        <button className="history-search" onClick={handleSearch} disabled={loading}>
          {loading ? "Buscando..." : "Ver recorrido"}
        </button>
      </div>

      {error && <p className="history-error">{error}</p>}

      {points && (
        <div className="history-results">
          <p className="history-count">
            {points.length === 0
              ? "Sin registros en ese rango"
              : `${points.length} puntos registrados`}
          </p>
          <ul className="history-list">
            {points
              .slice()
              .reverse()
              .map((p, i) => (
                <li key={i}>
                  <span className="history-time">
                    {new Date(p.recorded_at).toLocaleString()}
                  </span>
                  <span className="history-speed">{p.speed} km/h</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <style>{`
        .history-panel {
          width: 300px;
          flex: none;
          border-left: 1px solid var(--line);
          background: var(--surface);
          display: flex;
          flex-direction: column;
          padding: 14px;
          gap: 14px;
          overflow-y: auto;
        }

        @media (max-width: 860px) {
          .history-panel {
            position: fixed;
            inset: 0;
            width: 100%;
            z-index: 3100;
            border-left: none;
            padding: 16px;
            animation: history-slide-up .2s ease-out;
          }
          @keyframes history-slide-up {
            from { transform: translateY(16px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        }
        .history-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }
        .history-title {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--muted);
        }
        .history-subtitle {
          margin: 4px 0 0;
          font-size: 15px;
          font-weight: 700;
          color: var(--ink);
        }
        .history-close {
          background: none;
          border: none;
          font-size: 14px;
          color: var(--muted);
          cursor: pointer;
          line-height: 1;
          padding: 4px;
        }
        .history-close:hover { color: var(--ink); }

        .history-fields {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .history-fields label {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          color: var(--ink-soft);
        }
        .history-fields input {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px 9px;
          font-size: 13px;
          background: var(--bg);
          color: var(--ink);
        }
        .history-search {
          background: var(--navy);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .history-search:hover:not(:disabled) { background: var(--navy-deep); }
        .history-search:disabled { opacity: .6; cursor: default; }

        .history-error {
          margin: 0;
          font-size: 12px;
          color: var(--danger);
        }

        .history-count {
          margin: 0 0 8px;
          font-size: 11.5px;
          font-family: var(--mono);
          color: var(--muted);
        }
        .history-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: 320px;
          overflow-y: auto;
        }
        .history-list li {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-family: var(--mono);
        }
        .history-list li:nth-child(odd) { background: var(--surface-2); }
        .history-time { color: var(--ink-soft); }
        .history-speed { color: var(--blue); font-weight: 700; }
      `}</style>
    </div>
  );
}
