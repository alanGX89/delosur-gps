import { Router } from "express";
import { pool } from "../db/pool";
import { fetchDevices } from "../trackingClient";

export const devicesRouter = Router();

async function getAssignedDeviceIds(userId: number): Promise<number[]> {
  const { rows } = await pool.query<{ device_id: number }>(
    "SELECT device_id FROM user_devices WHERE user_id = $1",
    [userId]
  );
  return rows.map((r) => r.device_id);
}

devicesRouter.get("/me", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, role, full_name, logo_path, color_primary, color_accent, color_secondary
     FROM users WHERE id = $1`,
    [req.auth?.sub]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    logoPath: user.logo_path,
    colorPrimary: user.color_primary,
    colorAccent: user.color_accent,
    colorSecondary: user.color_secondary,
  });
});

devicesRouter.get("/devices", async (req, res) => {
  try {
    const devices = await fetchDevices();

    if (req.auth?.role === "admin") {
      return res.json(devices);
    }

    const allowedIds = await getAssignedDeviceIds(req.auth!.sub);
    const allowedSet = new Set(allowedIds);
    res.json(devices.filter((d) => allowedSet.has(d.id)));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "No se pudo consultar la API de tracking" });
  }
});

devicesRouter.get("/devices/:id/history", async (req, res) => {
  const deviceId = Number(req.params.id);
  const { from, to } = req.query;

  if (req.auth?.role !== "admin") {
    const allowedIds = await getAssignedDeviceIds(req.auth!.sub);
    if (!allowedIds.includes(deviceId)) {
      return res.status(403).json({ error: "No tienes acceso a este vehículo" });
    }
  }

  if (!from || !to) {
    return res.status(400).json({ error: "Se requieren los parámetros 'from' y 'to' (ISO 8601)" });
  }

  const { rows } = await pool.query(
    `SELECT lat, lng, speed, course, recorded_at
     FROM device_positions
     WHERE device_id = $1 AND recorded_at BETWEEN $2 AND $3
     ORDER BY recorded_at ASC`,
    [deviceId, from, to]
  );

  res.json(rows);
});
