import express from "express";
import { config } from "./config.js";
import { getPool } from "./db.js";
import authRoutes from "./routes/authRoutes.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  if (!config.databaseUrl) {
    return res.status(503).json({
      ok: false,
      service: "tenderland-api",
      database: "missing DATABASE_URL"
    });
  }

  await getPool().query("select 1");

  return res.json({
    ok: true,
    service: "tenderland-api",
    database: "ok"
  });
});

app.use("/api/auth", authRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

app.use((error, _req, res, _next) => {
  if (error.name === "ZodError") {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      issues: error.issues
    });
  }

  if (error.message?.startsWith("Missing required environment variable: DATABASE_URL")) {
    return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  }

  if (error.message?.startsWith("Missing required environment variable: JWT_SECRET")) {
    return res.status(503).json({ error: "AUTH_UNAVAILABLE" });
  }

  console.error(error);

  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
});

app.listen(config.port, () => {
  console.log(`tenderland-api listening on ${config.port}`);
});
