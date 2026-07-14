import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../auth.js";
import { query } from "../db.js";

const router = Router();

const createInvitationSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  role: z.enum(["user", "admin"]).default("user"),
  expiresInDays: z.number().int().min(1).max(365).default(14)
});

function publicInvitation(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    code: invitation.code,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    createdAt: invitation.created_at
  };
}

router.post("/invitations", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = createInvitationSchema.parse(req.body);
    const code = randomBytes(18).toString("base64url");

    const { rows } = await query(
      `insert into invitations (id, email, code, role, created_by, expires_at)
       values ($1, $2, $3, $4, $5, now() + ($6::int * interval '1 day'))
       returning id, email, code, role, status, expires_at, created_at`,
      [randomUUID(), input.email, code, input.role, req.user.id, input.expiresInDays]
    );

    return res.status(201).json({ invitation: publicInvitation(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

export default router;
