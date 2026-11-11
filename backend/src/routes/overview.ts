import { Router } from "express";
import { pool } from "../db/pool";
import { getSourceHealth } from "../sourceHealth";
import { deviceSourceName, fetchDevices } from "../trackingClient";
import { computeEffectiveStatus, UserStatus } from "../userStatus";

// Panel general del admin: foto de la flota en vivo, salud de las fuentes,
// estado de los clientes y actividad reciente. Solo lectura.
export const overviewRouter = Router();

const TIME_ZONE = "America/La_Paz";

interface ClientRow {
  id: number;
  username: string;
  full_name: string | null;
  status: UserStatus;
  valid_from: string | null;
  valid_until: string | null;
  device_count: number;
  last_login: string | null;
}

overviewRouter.get("/overview", async (_req, res) => {
  try {
    const [devices, assigned, clients, logins, actions] = await Promise.all([
      fetchDevices(),
      pool.query<{ device_id: number }>(
        `SELECT DISTINCT ud.device_id
         FROM user_devices ud JOIN users u ON u.id = ud.user_id
         WHERE u.role = 'user'`
      ),
      pool.query<ClientRow>(
        `SELECT u.id, u.username, u.full_name, u.status, u.valid_from, u.valid_until,
                (SELECT count(*)::int FROM user_devices d WHERE d.user_id = u.id) AS device_count,
                (SELECT max(l.created_at) FROM user_audit_log l
                  WHERE l.user_id = u.id AND l.action = 'login') AS last_login
         FROM users u
         WHERE u.role = 'user'
         ORDER BY u.username`
      ),
      pool.query<{ day: string; count: number }>(
        `SELECT to_char(l.created_at AT TIME ZONE $1, 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM user_audit_log l JOIN users u ON u.id = l.user_id
         WHERE l.action = 'login' AND u.role = 'user'
           AND l.created_at > now() - interval '30 days'
         GROUP BY 1 ORDER BY 1`,
        [TIME_ZONE]
      ),
      pool.query(
        `SELECT l.id, l.action, l.details, l.actor_username, l.created_at, u.username AS target_username
         FROM user_audit_log l LEFT JOIN users u ON u.id = l.user_id
         WHERE l.action <> 'login'
         ORDER BY l.created_at DESC
         LIMIT 8`
      ),
    ]);

    const assignedIds = new Set(assigned.rows.map((r) => r.device_id));
    const now = new Date();

    res.json({
      generatedAt: now.toISOString(),
      timeZone: TIME_ZONE,
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        online: d.online,
        speed: d.speed,
        lastReportAt: d.timestamp ? new Date(d.timestamp * 1000).toISOString() : null,
        source: deviceSourceName(d.id),
        assigned: assignedIds.has(d.id),
      })),
      sources: getSourceHealth(),
      clients: clients.rows.map((c) => ({
        id: c.id,
        username: c.username,
        fullName: c.full_name,
        effectiveStatus: computeEffectiveStatus(
          c.status,
          c.valid_from ? new Date(c.valid_from) : null,
          c.valid_until ? new Date(c.valid_until) : null,
          now
        ),
        validUntil: c.valid_until,
        deviceCount: c.device_count,
        lastLoginAt: c.last_login,
      })),
      loginsByDay: logins.rows,
      recentActions: actions.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo armar el panel general" });
  }
});
