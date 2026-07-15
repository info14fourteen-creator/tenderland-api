import express from "express";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getPool } from "./db.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const viewsDir = join(__dirname, "views");
const pagesDir = join(viewsDir, "pages");
const partialsDir = join(viewsDir, "partials");

async function renderPublicPage(filename) {
  const [page, header, footer, mobileNav, workspaceSidebar] = await Promise.all([
    readFile(join(pagesDir, filename), "utf8"),
    readFile(join(partialsDir, "site-header.html"), "utf8"),
    readFile(join(partialsDir, "site-footer.html"), "utf8"),
    readFile(join(partialsDir, "mobile-nav.html"), "utf8"),
    readFile(join(partialsDir, "workspace-sidebar.html"), "utf8")
  ]);

  return page
    .replace("<!-- SITE_HEADER -->", header)
    .replace("<!-- SITE_FOOTER -->", footer)
    .replace("<!-- MOBILE_NAV -->", mobileNav)
    .replace("<!-- WORKSPACE_SIDEBAR -->", workspaceSidebar);
}

function publicPage(filename) {
  return async (_req, res) => {
    res.type("html").send(await renderPublicPage(filename));
  };
}

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

app.get("/", publicPage("index.html"));
app.get(["/home", "/home/"], publicPage("home.html"));
app.get(["/account", "/account/"], publicPage("account.html"));
app.get(["/api-docs", "/api-docs/"], publicPage("api-docs.html"));
app.get(["/terms", "/terms/"], publicPage("terms.html"));
app.get(["/privacy", "/privacy/"], publicPage("privacy.html"));
app.get(/^\/brandbook$/, (_req, res) => res.redirect(308, "/brandbook/"));
app.get(/^\/brandbook\/$/, publicPage("brandbook.html"));

app.get("/index.html", (_req, res) => res.redirect(308, "/"));
app.get("/terms.html", (_req, res) => res.redirect(308, "/terms"));
app.get("/privacy.html", (_req, res) => res.redirect(308, "/privacy"));
app.get("/brandbook/index.html", (_req, res) => res.redirect(308, "/brandbook/"));

app.use(express.static(publicDir));

app.get(/^\/(?!api).*/, async (req, res, next) => {
  if (!req.accepts("html")) {
    return next();
  }

  return res.type("html").send(await renderPublicPage("index.html"));
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
