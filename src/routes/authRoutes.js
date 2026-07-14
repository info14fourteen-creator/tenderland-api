import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { defaultBusinessRoles, primaryBusinessRole } from "../access.js";
import { config } from "../config.js";
import { requireAuth, signUserToken } from "../auth.js";
import { getPool, query } from "../db.js";
import { sendRegistrationPasswordEmail } from "../mailer.js";

const router = Router();
const termsVersion = "2026-07-14";
const privacyVersion = "2026-07-14";

const registerSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  inviteCode: z.string().trim().min(8).max(128),
  acceptedTerms: z.literal(true),
  fullName: z.string().trim().min(1).max(120).optional()
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

function randomChar(charset) {
  return charset[randomInt(charset.length)];
}

function shuffle(value) {
  return value
    .split("")
    .map((char) => ({ char, rank: randomInt(1_000_000) }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ char }) => char)
    .join("");
}

function generateTemporaryPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const all = `${upper}${lower}${digits}`;
  const required = [randomChar(upper), randomChar(lower), randomChar(digits)];
  const rest = Array.from({ length: 5 }, () => randomChar(all));

  return shuffle([...required, ...rest].join(""));
}

router.post("/register", async (req, res, next) => {
  let client;

  try {
    const input = registerSchema.parse(req.body);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const isAdminBootstrap =
      input.email === config.adminEmail &&
      Boolean(config.adminBootstrapInviteCode) &&
      input.inviteCode === config.adminBootstrapInviteCode;

    client = await getPool().connect();
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
      `insert into users (
         id, email, password_hash, full_name, category, business_role, business_roles, role,
         terms_accepted_at, terms_version, privacy_version
       )
       values (
         $1, $2, $3, $4, $5, $6, $7,
         case when $5 = 'super_admin' then 'admin' when $5 = 'admin' then 'admin' else 'user' end,
         now(), $8, $9
       )
       returning id, email, full_name, category, business_role, business_roles, status, created_at, updated_at, last_login_at`,
      [
        userId,
        input.email,
        passwordHash,
        input.fullName || null,
        category,
        businessRole,
        businessRoles,
        termsVersion,
        privacyVersion
      ]
    );

    if (invitationId) {
      await client.query(
        `update invitations
         set used_by = $1, used_at = now()
         where id = $2`,
        [userId, invitationId]
      );
    }

    try {
      await sendRegistrationPasswordEmail({
        to: input.email,
        password: temporaryPassword
      });
    } catch (error) {
      await client.query("rollback");

      if (error.code === "MAIL_NOT_CONFIGURED") {
        return res.status(503).json({ error: "MAIL_NOT_CONFIGURED" });
      }

      console.error(error);
      return res.status(502).json({ error: "MAIL_DELIVERY_FAILED" });
    }

    await client.query("commit");

    const user = rows[0];

    return res.status(201).json({ user: publicUser(user), passwordDelivery: "email" });
  } catch (error) {
    await client?.query("rollback").catch(() => {});

    if (error.code === "23505") {
      return res.status(409).json({ error: "USER_EMAIL_EXISTS" });
    }

    return next(error);
  } finally {
    client?.release();
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
