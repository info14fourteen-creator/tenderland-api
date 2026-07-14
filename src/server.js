import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getPool } from "./db.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

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
app.use("/api/admin", adminRoutes);

app.use(express.static(publicDir));

app.get(["/terms", "/terms/"], (_req, res) => {
  res.sendFile(join(publicDir, "terms.html"));
});

app.get(["/privacy", "/privacy/"], (_req, res) => {
  res.sendFile(join(publicDir, "privacy.html"));
});

app.get(/^\/(?!api).*/, (req, res, next) => {
  if (!req.accepts("html")) {
    return next();
  }

  res.sendFile(join(publicDir, "index.html"));
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

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
