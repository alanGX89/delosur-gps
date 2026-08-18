import bcrypt from "bcryptjs";
import { Router } from "express";
import { pool } from "../db/pool";
import { uploadLogo } from "../upload";
import { computeEffectiveStatus, UserStatus } from "../userStatus";

export const adminRouter = Router();

interface UserRow {
  id: number;
  username: string;
  role: "admin" | "user";
  full_name: string | null;
  logo_path: string | null;
  color_primary: string;
  color_accent: string;
  color_secondary: string;
  status: UserStatus;
  created_by: number | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

function toPublicUser(row: UserRow, deviceIds: number[], createdByUsername: string | null) {
  const validFrom = row.valid_from ? new Date(row.valid_from) : null;
  const validUntil = row.valid_until ? new Date(row.valid_until) : null;

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    fullName: row.full_name,
    logoPath: row.logo_path,
    colorPrimary: row.color_primary,
    colorAccent: row.color_accent,
    colorSecondary: row.color_secondary,
    status: row.status,
    effectiveStatus: computeEffectiveStatus(row.status, validFrom, validUntil),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdBy: row.created_by,
    createdByUsername,
    createdAt: row.created_at,
    deviceIds,
  };
}

async function getAssignedDeviceIds(userId: number): Promise<number[]> {
  const { rows } = await pool.query<{ device_id: number }>(
    "SELECT device_id FROM user_devices WHERE user_id = $1 ORDER BY device_id",
    [userId]
  );
  return rows.map((r) => r.device_id);
}

async function logAudit(
  userId: number,
  actorId: number | undefined,
  actorUsername: string | undefined,
  action: string,
  details?: string
) {
  await pool.query(
    `INSERT INTO user_audit_log (user_id, actor_id, actor_username, action, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, actorId ?? null, actorUsername ?? null, action, details ?? null]
  );
}

adminRouter.get("/users", async (_req, res) => {
  const { rows } = await pool.query<UserRow & { creator_username: string | null }>(
    `SELECT u.*, c.username AS creator_username
     FROM users u
     LEFT JOIN users c ON c.id = u.created_by
     ORDER BY u.created_at DESC`
  );
  const users = await Promise.all(
    rows.map(async (row) => toPublicUser(row, await getAssignedDeviceIds(row.id), row.creator_username))
  );
  res.json(users);
});

adminRouter.post("/users", async (req, res) => {
  const {
    username,
    password,
    fullName,
    role = "user",
    colorPrimary = "#021C59",
    colorAccent = "#E1233A",
    colorSecondary = "#0086C8",
    deviceIds = [],
    validFrom = null,
    validUntil = null,
  } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (username, password_hash, role, full_name, color_primary, color_accent, color_secondary, created_by, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        username,
        passwordHash,
        role,
        fullName || null,
        colorPrimary,
        colorAccent,
        colorSecondary,
        req.auth?.sub ?? null,
        validFrom,
        validUntil,
      ]
    );
    const user = rows[0];

    for (const deviceId of deviceIds as number[]) {
      await client.query(
        "INSERT INTO user_devices (user_id, device_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [user.id, deviceId]
      );
    }

    await client.query(
      `INSERT INTO user_audit_log (user_id, actor_id, actor_username, action, details)
       VALUES ($1, $2, $3, 'created', $4)`,
      [
        user.id,
        req.auth?.sub ?? null,
        req.auth?.username ?? null,
        validFrom || validUntil
          ? `Programado: ${validFrom ?? "sin inicio"} → ${validUntil ?? "sin fin"}`
          : "Sin límite de tiempo",
      ]
    );

    await client.query("COMMIT");
    res.status(201).json(toPublicUser(user, deviceIds, req.auth?.username ?? null));
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return res.status(409).json({ error: "Ese usuario ya existe" });
    }
    console.error(err);
    res.status(500).json({ error: "No se pudo crear el usuario" });
  } finally {
    client.release();
  }
});

adminRouter.put("/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const {
    fullName,
    role,
    colorPrimary,
    colorAccent,
    colorSecondary,
    password,
    deviceIds,
    validFrom,
    validUntil,
    clearSchedule,
  } = req.body ?? {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const { rows } = await client.query<UserRow>(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         role = COALESCE($3, role),
         color_primary = COALESCE($4, color_primary),
         color_accent = COALESCE($5, color_accent),
         color_secondary = COALESCE($6, color_secondary),
         password_hash = COALESCE($7, password_hash),
         valid_from = CASE WHEN $8 THEN NULL ELSE COALESCE($9, valid_from) END,
         valid_until = CASE WHEN $8 THEN NULL ELSE COALESCE($10, valid_until) END
       WHERE id = $1
       RETURNING *`,
      [
        userId,
        fullName ?? null,
        role ?? null,
        colorPrimary ?? null,
        colorAccent ?? null,
        colorSecondary ?? null,
        passwordHash,
        Boolean(clearSchedule),
        validFrom ?? null,
        validUntil ?? null,
      ]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (Array.isArray(deviceIds)) {
      await client.query("DELETE FROM user_devices WHERE user_id = $1", [userId]);
      for (const deviceId of deviceIds as number[]) {
        await client.query("INSERT INTO user_devices (user_id, device_id) VALUES ($1, $2)", [
          userId,
          deviceId,
        ]);
      }
    }

    await logAudit(userId, req.auth?.sub, req.auth?.username, "updated");

    await client.query("COMMIT");
    const creator = await pool.query<{ username: string | null }>(
      "SELECT username FROM users WHERE id = $1",
      [rows[0].created_by]
    );
    res.json(
      toPublicUser(rows[0], await getAssignedDeviceIds(userId), creator.rows[0]?.username ?? null)
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar el usuario" });
  } finally {
    client.release();
  }
});

adminRouter.delete("/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.auth?.sub) {
    return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
  }
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  res.status(204).end();
});

adminRouter.post("/users/:id/logo", uploadLogo.single("logo"), async (req, res) => {
  const userId = Number(req.params.id);
  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ninguna imagen" });
  }
  const logoPath = `/uploads/logos/${req.file.filename}`;
  await pool.query("UPDATE users SET logo_path = $1 WHERE id = $2", [logoPath, userId]);
  await logAudit(userId, req.auth?.sub, req.auth?.username, "logo_updated");
  res.json({ logoPath });
});

function setStatusRoute(path: string, status: UserStatus, action: string) {
  adminRouter.post(path, async (req, res) => {
    const userId = Number(req.params.id);
    if (userId === req.auth?.sub) {
      return res.status(400).json({ error: "No puedes cambiar el estado de tu propio usuario" });
    }
    const { rows } = await pool.query("UPDATE users SET status = $1 WHERE id = $2 RETURNING id", [
      status,
      userId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

    await logAudit(userId, req.auth?.sub, req.auth?.username, action);
    res.json({ ok: true, status });
  });
}

setStatusRoute("/users/:id/block", "blocked", "blocked");
setStatusRoute("/users/:id/unblock", "active", "unblocked");
setStatusRoute("/users/:id/suspend", "suspended", "suspended");
setStatusRoute("/users/:id/unsuspend", "active", "unsuspended");

adminRouter.get("/users/:id/logs", async (req, res) => {
  const userId = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT id, actor_id, actor_username, action, details, created_at
     FROM user_audit_log
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [userId]
  );
  res.json(rows);
});

adminRouter.get("/audit-log", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.user_id, u.username AS target_username, a.actor_id, a.actor_username,
            a.action, a.details, a.created_at
     FROM user_audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT 200`
  );
  res.json(rows);
});
