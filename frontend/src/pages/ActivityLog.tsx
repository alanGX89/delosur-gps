import { useEffect, useState } from "react";
import { getAuditLog } from "../api/client";
import type { AuditLogEntry } from "../api/client";

const ACTION_LABELS: Record<string, string> = {
  created: "Usuario creado",
  updated: "Datos actualizados",
  blocked: "Bloqueado",
  unblocked: "Desbloqueado",
  suspended: "Suspendido",
  unsuspended: "Reanudado",
  logo_updated: "Logo actualizado",
  login: "Inicio de sesión",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLog()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="activity-screen">
      <main className="activity-main">
        <div className="page-head">
          <div>
            <h1>Actividad de usuarios</h1>
            <p>Historial de todo lo que pasó con las cuentas: quién creó, editó, bloqueó o suspendió a quién.</p>
          </div>
        </div>

        <div className="table-card">
          {loading && <p className="empty-row">Cargando...</p>}
          {error && <p className="empty-row error">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="empty-row">Todavía no hay actividad registrada.</p>
          )}
          {!loading && entries.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Usuario afectado</th>
                  <th>Realizado por</th>
                  <th>Detalle</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span className="action-badge">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    </td>
                    <td className="ink">{entry.target_username ?? "—"}</td>
                    <td className="muted">{entry.actor_username ?? "Sistema"}</td>
                    <td className="muted">{entry.details ?? "—"}</td>
                    <td className="muted mono">{formatDateTime(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <style>{`
        .activity-screen { background: var(--bg); min-height: 100%; }
        .activity-main {
          max-width: 1100px;
          margin: 0 auto;
          padding: 32px 24px 60px;
        }
        .page-head { margin-bottom: 24px; }
        .page-head h1 {
          margin: 0 0 6px;
          font-size: 22px;
          font-weight: 800;
          color: var(--ink);
          letter-spacing: -0.01em;
        }
        .page-head p {
          margin: 0;
          font-size: 13.5px;
          color: var(--muted);
          max-width: 60ch;
        }
        .table-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 10px;
          box-shadow: 0 1px 2px rgba(2, 12, 40, 0.04);
          overflow-x: auto;
        }
        table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--line); }
        thead th {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: var(--muted);
          font-weight: 700;
          background: var(--surface-2);
          white-space: nowrap;
        }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:hover { background: var(--surface-2); }
        .ink { color: var(--ink); font-weight: 700; }
        .muted { color: var(--muted); }
        .mono { font-family: var(--mono); font-size: 12px; white-space: nowrap; }
        .action-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          background: #E4F0FA;
          color: var(--blue);
          white-space: nowrap;
        }
        .empty-row { text-align: center; color: var(--muted); padding: 32px; margin: 0; }
        .empty-row.error { color: var(--danger); }

        @media (max-width: 720px) {
          .activity-main { padding: 20px 14px 40px; }
        }
      `}</style>
    </div>
  );
}
