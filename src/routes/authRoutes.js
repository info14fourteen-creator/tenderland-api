import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, signUserToken } from "../auth.js";
import { query } from "../db.js";

const router = Router();

const registerSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120).optional()
});

const loginSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128)
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);

    const { rows } = await query(
      `insert into users (id, email, password_hash, full_name)
       values ($1, $2, $3, $4)
       returning id, email, full_name, role, status, created_at, updated_at, last_login_at`,
      [randomUUID(), input.email, passwordHash, input.fullName || null]
    );

    const user = rows[0];
    const token = signUserToken(user);

    return res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "USER_EMAIL_EXISTS" });
    }

    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const { rows } = await query(
      `select id, email, password_hash, full_name, role, status, created_at, updated_at, last_login_at
       from users
       where lower(email) = lower($1)
       limit 1`,
      [input.email]
    );

    const user = rows[0];
    const isPasswordValid = user
      ? await bcrypt.compare(input.password, user.password_hash)
      : false;

    if (!user || !isPasswordValid || user.status !== "active") {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    const updated = await query(
      `update users
       set last_login_at = now()
       where id = $1
       returning id, email, full_name, role, status, created_at, updated_at, last_login_at`,
      [user.id]
    );

    const token = signUserToken(updated.rows[0]);

    return res.json({ user: publicUser(updated.rows[0]), token });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: publicUser(req.user) });
});

export default router;
