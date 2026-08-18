import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { pool } from "./pool";

export async function bootstrapDatabase(): Promise<void> {
  const dbName = process.env.PGDATABASE as string;

  const adminClient = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: "postgres",
  });

  await adminClient.connect();
  const { rowCount } = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName]
  );
  if (rowCount === 0) {
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Base de datos "${dbName}" creada.`);
  }
  await adminClient.end();

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schema);
  console.log("Esquema verificado/aplicado.");

  await seedAdminUser();
}

async function seedAdminUser(): Promise<void> {
  const username = process.env.LOGIN_USER as string;
  const password = process.env.LOGIN_PASSWORD as string;

  const { rowCount } = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
  if (rowCount && rowCount > 0) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, role, full_name)
     VALUES ($1, $2, 'admin', 'Administrador')`,
    [username, passwordHash]
  );
  console.log(`Usuario admin "${username}" creado.`);
}
