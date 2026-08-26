import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";
import { canLogin, computeEffectiveStatus, UserStatus } from "../userStatus";

export const authRouter = Router();

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  full_name: string | null;
  logo_path: string | null;
  color_primary: string;
  color_accent: string;
  color_secondary: string;
  status: UserStatus;
  valid_from: Date | null;
  valid_until: Date | null;
}

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE username = $1", [
    username,
  ]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  if (!canLogin(user.status, user.valid_from, user.valid_until)) {
    const effective = computeEffectiveStatus(user.status, user.valid_from, user.valid_until);
    const messages: Record<string, string> = {
      blocked: "Este usuario está bloqueado. Contacta a un administrador.",
      suspended: "Este usuario está suspendido temporalmente.",
      scheduled: "Este usuario todavía no está habilitado para ingresar.",
      expired: "El acceso de este usuario expiró.",
    };
    return res.status(403).json({ error: messages[effective] || "Acceso no permitido" });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "12h" }
  );

  await pool.query(
    `INSERT INTO user_audit_log (user_id, actor_id, actor_username, action, details)
     VALUES ($1, $1, $2, 'login', $3)`,
    [user.id, user.username, `IP: ${req.ip ?? "desconocida"}`]
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      logoPath: user.logo_path,
      colorPrimary: user.color_primary,
      colorAccent: user.color_accent,
      colorSecondary: user.color_secondary,
    },
  });
});
