import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { config } from "../config.js";
import { query } from "../db.js";

const router = Router();

const listProceduresSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

const procedureIdSchema = z.string().regex(/^(?:\d+|TL\d+)$/i);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safePublicUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase() === "apikey") url.searchParams.delete(key);
    }

    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeSourceValue(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSourceValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeSourceValue(childValue, childKey)
      ])
    );
  }

  if (/api.?key|secret|token/i.test(key)) {
    return value ? "[скрыто]" : value;
  }

  if (typeof value !== "string") return value;

  let sanitized = value.replace(/([?&]apiKey=)[^&\s"']*/gi, "$1[скрыто]");
  if (config.tenderlandApiKey) {
    sanitized = sanitized.split(config.tenderlandApiKey).join("[скрыто]");
  }

  return sanitized;
}

function procedureFromRow(row) {
  const tender = row.source_payload?.rows?.[0]?.tender || {};
  const customer = tender.customers?.[0] || {};

  return {
    id: String(row.id),
    externalId: row.external_id,
    stage: row.stage,
    name: tender.name || tender.lotName || "Процедура без названия",
    registrationNumber: tender.regNumber || null,
    status: tender.status || null,
    customer: customer.lotCustomerShortName || customer.lotCustomerFullName || null,
    region: tender.region || tender.federalDistrict || null,
    amount: toNumber(tender.lotBeginPrice ?? tender.beginPrice),
    currency: tender.lotCurrency || null,
    endDate: tender.endDate || null,
    publishDate: tender.publishDate || null,
    platform: tender.etpName || null,
    module: tender.module || null,
    category: tender.lotCategories?.[0] || null,
    sourceUrl: safePublicUrl(tender.sourceLink || tender.linkToCard),
    updatedAt: row.updated_at
  };
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { limit } = listProceduresSchema.parse(req.query);
    const { rows } = await query(
      `select id, external_id, stage, source_payload, updated_at
       from procedures
       order by
         nullif(source_payload->'rows'->0->'tender'->>'endDate', '') asc nulls last,
         updated_at desc
       limit $1`,
      [limit]
    );

    return res.json({
      procedures: rows.map(procedureFromRow),
      total: rows.length
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = procedureIdSchema.parse(req.params.id);
    const { rows } = await query(
      `select id, source, external_id, stage, source_payload, created_at, updated_at
       from procedures
       where id::text = $1 or upper(external_id) = upper($1)
       limit 1`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "PROCEDURE_NOT_FOUND" });
    }

    const row = rows[0];
    return res.json({
      procedure: {
        ...procedureFromRow(row),
        source: row.source,
        createdAt: row.created_at,
        sourceData: sanitizeSourceValue(row.source_payload)
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
