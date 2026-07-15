import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";

const router = Router();

const listProceduresSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

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

export default router;
