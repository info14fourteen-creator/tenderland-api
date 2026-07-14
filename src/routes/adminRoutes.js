import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { businessRoles, defaultBusinessRoles, primaryBusinessRole, userCategories } from "../access.js";
import { requireAdmin, requireAuth } from "../auth.js";
import { query } from "../db.js";

const router = Router();

const createInvitationSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  category: z.enum(userCategories).default("user"),
  role: z.enum(businessRoles).optional(),
  roles: z.array(z.enum(businessRoles)).min(1).optional(),
  expiresInDays: z.number().int().min(1).max(365).default(14)
});

function normalizeRoles(input) {
  if (input.roles?.length) {
    return [...new Set(input.roles)];
  }

  if (input.role) {
    return [input.role];
  }

  return defaultBusinessRoles;
}

function publicInvitation(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    code: invitation.code,
    category: invitation.category,
    role: invitation.business_role,
    roles: invitation.business_roles,
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
    const assignedRoles = normalizeRoles(input);
    const primaryRole = primaryBusinessRole(assignedRoles);

    const { rows } = await query(
      `insert into invitations (id, email, code, category, business_role, business_roles, role, created_by, expires_at)
       values ($1, $2, $3, $4, $5, $6, case when $4 = 'super_admin' then 'admin' when $4 = 'admin' then 'admin' else 'user' end, $7, now() + ($8::int * interval '1 day'))
       returning id, email, code, category, business_role, business_roles, status, expires_at, created_at`,
      [randomUUID(), input.email, code, input.category, primaryRole, assignedRoles, req.user.id, input.expiresInDays]
    );

    return res.status(201).json({ invitation: publicInvitation(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.get("/access-options", requireAuth, requireAdmin, (_req, res) => {
  return res.json({
    categories: userCategories,
    roles: businessRoles,
    defaultRoles: defaultBusinessRoles
  });
});

export default router;
