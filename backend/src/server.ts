import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "path";
import { bootstrapDatabase } from "./db/bootstrap";
import { requireAdmin, requireAuth } from "./middleware/requireAuth";
import { startPoller } from "./poller";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { devicesRouter } from "./routes/devices";

async function main() {
  await bootstrapDatabase();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api", requireAuth, devicesRouter);
  app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`API DELOSUR GPS escuchando en http://localhost:${port}`);
  });

  startPoller();
}

main().catch((err) => {
  console.error("Error al iniciar el servidor:", err);
  process.exit(1);
});
