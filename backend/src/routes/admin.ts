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
  email: string | null;
  phone: string | null;
  notes: string | null;
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

function toPublicUser(
  row: UserRow,
  deviceIds: number[],
  createdByUsername: string | null,
  deviceNames: string[] = []
) {
  const validFrom = row.valid_from ? new Date(row.valid_from) : null;
  const validUntil = row.valid_until ? new Date(row.valid_until) : null;

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
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
    deviceNames,
  };
}

async function getAssignedDeviceIds(userId: number): Promise<number[]> {
  const { rows } = await pool.query<{ device_id: number }>(
    "SELECT device_id FROM user_devices WHERE user_id = $1 ORDER BY device_id",
    [userId]
  );
  return rows.map((r) => r.device_id);
}

async function getAssignedDeviceNames(deviceIds: number[]): Promise<string[]> {
  if (deviceIds.length === 0) return [];
  const { rows } = await pool.query<{ name: string }>(
    "SELECT name FROM devices WHERE id = ANY($1) ORDER BY name",
    [deviceIds]
  );
  return rows.map((r) => r.name);
}

const PROFILE_FIELD_LABELS: Record<string, string> = {
  full_name: "Nombre completo",
  email: "Email",
  phone: "Teléfono",
  notes: "Notas",
  role: "Rol",
  color_primary: "Color primario",
  color_accent: "Color de acento",
  color_secondary: "Color secundario",
  valid_from: "Vigente desde",
  valid_until: "Vigente hasta",
};

function diffUserChanges(
  before: UserRow,
  after: UserRow,
  devicesChanged: boolean
): string {
  const parts: string[] = [];
  for (const [field, label] of Object.entries(PROFILE_FIELD_LABELS)) {
    const b = (before as unknown as Record<string, unknown>)[field] ?? null;
    const a = (after as unknown as Record<string, unknown>)[field] ?? null;
    if (String(b) !== String(a)) {
      parts.push(`${label}: "${b ?? "—"}" → "${a ?? "—"}"`);
    }
  }
  if (devicesChanged) parts.push("Flota asignada modificada");
  return parts.length ? parts.join(" · ") : "Sin cambios detectados";
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
    rows.map(async (row) => {
      const deviceIds = await getAssignedDeviceIds(row.id);
      const deviceNames = await getAssignedDeviceNames(deviceIds);
      return toPublicUser(row, deviceIds, row.creator_username, deviceNames);
    })
  );
  res.json(users);
});

adminRouter.post("/users", async (req, res) => {
  const {
    username,
    password,
    fullName,
    email = null,
    phone = null,
    notes = null,
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
      `INSERT INTO users (username, password_hash, role, full_name, email, phone, notes, color_primary, color_accent, color_secondary, created_by, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        username,
        passwordHash,
        role,
        fullName || null,
        email || null,
        phone || null,
        notes || null,
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
    const deviceNames = await getAssignedDeviceNames(deviceIds as number[]);
    res.status(201).json(toPublicUser(user, deviceIds, req.auth?.username ?? null, deviceNames));
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
    email,
    phone,
    notes,
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

    const { rows: beforeRows } = await client.query<UserRow>("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    if (beforeRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    const before = beforeRows[0];

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const { rows } = await client.query<UserRow>(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         notes = COALESCE($5, notes),
         role = COALESCE($6, role),
         color_primary = COALESCE($7, color_primary),
         color_accent = COALESCE($8, color_accent),
         color_secondary = COALESCE($9, color_secondary),
         password_hash = COALESCE($10, password_hash),
         valid_from = CASE WHEN $11 THEN NULL ELSE COALESCE($12, valid_from) END,
         valid_until = CASE WHEN $11 THEN NULL ELSE COALESCE($13, valid_until) END
       WHERE id = $1
       RETURNING *`,
      [
        userId,
        fullName ?? null,
        email ?? null,
        phone ?? null,
        notes ?? null,
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

    const after = rows[0];

    let devicesChanged = false;
    if (Array.isArray(deviceIds)) {
      const currentIds = (await getAssignedDeviceIds(userId)).slice().sort();
      const nextIds = [...(deviceIds as number[])].sort();
      devicesChanged = JSON.stringify(currentIds) !== JSON.stringify(nextIds);
      await client.query("DELETE FROM user_devices WHERE user_id = $1", [userId]);
      for (const deviceId of deviceIds as number[]) {
        await client.query("INSERT INTO user_devices (user_id, device_id) VALUES ($1, $2)", [
          userId,
          deviceId,
        ]);
      }
    }

    const details = diffUserChanges(before, after, devicesChanged);
    const finalDetails = password ? `Contraseña actualizada · ${details}` : details;
    await logAudit(userId, req.auth?.sub, req.auth?.username, "updated", finalDetails);

    await client.query("COMMIT");
    const creator = await pool.query<{ username: string | null }>(
      "SELECT username FROM users WHERE id = $1",
      [rows[0].created_by]
    );
    const finalDeviceIds = await getAssignedDeviceIds(userId);
    const deviceNames = await getAssignedDeviceNames(finalDeviceIds);
    res.json(
      toPublicUser(rows[0], finalDeviceIds, creator.rows[0]?.username ?? null, deviceNames)
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
