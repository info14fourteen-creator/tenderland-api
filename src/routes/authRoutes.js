import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { defaultBusinessRoles, primaryBusinessRole } from "../access.js";
import { config } from "../config.js";
import { requireAuth, signUserToken } from "../auth.js";
import { getPool, query } from "../db.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
  passwordConfirm: z.string().min(8).max(128),
  inviteCode: z.string().trim().min(8).max(128),
  fullName: z.string().trim().min(1).max(120).optional()
}).refine((input) => input.password === input.passwordConfirm, {
  message: "Passwords do not match",
  path: ["passwordConfirm"]
});

const loginSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128)
});

const forgotPasswordSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase())
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    category: user.category,
    role: user.business_role,
    roles: user.business_roles,
    status: user.status,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at
  };
}

router.post("/register", async (req, res, next) => {
  const client = await getPool().connect();

  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const isAdminBootstrap =
      input.email === config.adminEmail &&
      Boolean(config.adminBootstrapInviteCode) &&
      input.inviteCode === config.adminBootstrapInviteCode;

    await client.query("begin");

    let category = "user";
    let businessRoles = defaultBusinessRoles;
    let invitationId = null;

    if (isAdminBootstrap) {
      category = "super_admin";
      businessRoles = defaultBusinessRoles;
    } else {
      const invitation = await client.query(
        `select id, category, business_roles
         from invitations
         where code = $1
           and status = 'active'
           and used_at is null
           and lower(email) = lower($2)
           and (expires_at is null or expires_at > now())
         limit 1`,
        [input.inviteCode, input.email]
      );

      if (!invitation.rows[0]) {
        await client.query("rollback");
        return res.status(403).json({ error: "INVALID_INVITATION" });
      }

      invitationId = invitation.rows[0].id;
      category = invitation.rows[0].category;
      businessRoles = invitation.rows[0].business_roles;
    }

    const userId = randomUUID();
    const businessRole = primaryBusinessRole(businessRoles);
    const { rows } = await client.query(
      `insert into users (id, email, password_hash, full_name, category, business_role, business_roles, role)
       values ($1, $2, $3, $4, $5, $6, $7, case when $5 = 'super_admin' then 'admin' when $5 = 'admin' then 'admin' else 'user' end)
       returning id, email, full_name, category, business_role, business_roles, status, created_at, updated_at, last_login_at`,
      [userId, input.email, passwordHash, input.fullName || null, category, businessRole, businessRoles]
    );

    if (invitationId) {
      await client.query(
        `update invitations
         set used_by = $1, used_at = now()
         where id = $2`,
        [userId, invitationId]
      );
    }

    await client.query("commit");

    const user = rows[0];
    const token = signUserToken(user);

    return res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    await client.query("rollback").catch(() => {});

    if (error.code === "23505") {
      return res.status(409).json({ error: "USER_EMAIL_EXISTS" });
    }

    return next(error);
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const { rows } = await query(
      `select id, email, password_hash, full_name, category, business_role, business_roles, status, created_at, updated_at, last_login_at
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
       returning id, email, full_name, category, business_role, business_roles, status, created_at, updated_at, last_login_at`,
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

router.post("/forgot-password", async (req, res, next) => {
  try {
    forgotPasswordSchema.parse(req.body);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
