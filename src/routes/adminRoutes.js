import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { businessRoles, defaultBusinessRole, userCategories } from "../access.js";
import { requireAdmin, requireAuth } from "../auth.js";
import { query } from "../db.js";

const router = Router();

const createInvitationSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  category: z.enum(userCategories).default("user"),
  role: z.enum(businessRoles).default(defaultBusinessRole),
  expiresInDays: z.number().int().min(1).max(365).default(14)
});

function publicInvitation(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    code: invitation.code,
    category: invitation.category,
    role: invitation.business_role,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    createdAt: invitation.created_at
  };
}

router.post("/invitations", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = createInvitationSchema.parse(req.body);

    if (input.category !== "user" && req.user.category !== "super_admin") {
      return res.status(403).json({ error: "SUPER_ADMIN_REQUIRED" });
    }

    const code = randomBytes(18).toString("base64url");

    const { rows } = await query(
      `insert into invitations (id, email, code, category, business_role, role, created_by, expires_at)
       values ($1, $2, $3, $4, $5, case when $4 = 'super_admin' then 'admin' when $4 = 'admin' then 'admin' else 'user' end, $6, now() + ($7::int * interval '1 day'))
       returning id, email, code, category, business_role, status, expires_at, created_at`,
      [randomUUID(), input.email, code, input.category, input.role, req.user.id, input.expiresInDays]
    );

    return res.status(201).json({ invitation: publicInvitation(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.get("/access-options", requireAuth, requireAdmin, (_req, res) => {
  return res.json({
    categories: userCategories,
    roles: businessRoles
  });
});

export default router;
