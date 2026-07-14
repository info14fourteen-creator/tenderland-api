import jwt from "jsonwebtoken";
import { config, requireConfig } from "./config.js";
import { query } from "./db.js";

export function signUserToken(user) {
  requireConfig("JWT_SECRET", config.jwtSecret);

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      category: user.category,
      role: user.business_role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export async function requireAuth(req, res, next) {
  try {
    requireConfig("JWT_SECRET", config.jwtSecret);

    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(
      `select id, email, full_name, category, business_role, status, created_at, updated_at, last_login_at
       from users
       where id = $1 and status = 'active'`,
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: "AUTH_INVALID" });
    }

    req.user = rows[0];
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "AUTH_INVALID" });
    }

    return next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (!["admin", "super_admin"].includes(req.user?.category)) {
    return res.status(403).json({ error: "ADMIN_REQUIRED" });
  }

  return next();
}

export function requireSuperAdmin(req, res, next) {
  if (req.user?.category !== "super_admin") {
    return res.status(403).json({ error: "SUPER_ADMIN_REQUIRED" });
  }

  return next();
}
