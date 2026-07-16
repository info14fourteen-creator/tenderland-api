import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";
import { safePublicUrl, sanitizeSourceValue } from "../sourceSanitizer.js";
import procedureFileRoutes from "./procedureFileRoutes.js";

const router = Router();

const listProceduresSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

const procedureIdSchema = z.string().regex(/^(?:\d+|TL\d+)$/i);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function procedureFromRow(row) {
  const tender = row.source_payload?.rows?.[0]?.tender || {};
  const customer = tender.customers?.[0] || {};

  return {
    id: String(row.id),
    externalId: row.external_id,
    stage: row.stage_name || null,
    stageCode: row.stage_code || null,
    stageOrder: row.stage_order || null,
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

function productPositionFromRow(row) {
  return {
    id: String(row.id),
    sourcePositionId: row.source_position_id ? String(row.source_position_id) : null,
    kind: row.position_kind,
    name: row.name,
    description: row.description,
    sku: row.sku,
    category: row.category,
    ktruCode: row.ktru_code,
    okpd2Code: row.okpd2_code,
    okeiCode: row.okei_code,
    okeiName: row.okei_name,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unit_price),
    totalPrice: toNumber(row.total_price),
    currency: row.currency,
    attributes: row.attributes,
    sourceData: sanitizeSourceValue(row.source_payload),
    sortOrder: row.sort_order
  };
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { limit } = listProceduresSchema.parse(req.query);
    const { rows } = await query(
      `select
         deal.id,
         deal.external_id,
         deal.source_payload,
         deal.updated_at,
         stage.name as stage_name,
         stage.code as stage_code,
         stage.sort_order as stage_order
       from deals deal
       left join deal_stages stage on stage.id = deal.stage_id
       where deal.deal_type = 'procedure'
       order by
         nullif(deal.source_payload->'rows'->0->'tender'->>'endDate', '') asc nulls last,
         deal.updated_at desc
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

router.get("/stages", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `select
         stage.id,
         stage.code,
         stage.name,
         stage.stage_group,
         stage.sort_order,
         stage.is_terminal,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'type', responsibility.actor_type,
               'key', responsibility.actor_key,
               'name', responsibility.actor_name
             )
             order by responsibility.sort_order
           ) filter (where responsibility.stage_id is not null),
           '[]'::jsonb
         ) as actors
       from deal_stages stage
       left join deal_stage_responsibilities responsibility
         on responsibility.stage_id = stage.id
       where stage.deal_type = 'procedure'
       group by stage.id
       order by stage.sort_order`
    );

    return res.json({
      stages: rows.map((row) => ({
        id: String(row.id),
        code: row.code,
        name: row.name,
        group: row.stage_group,
        order: row.sort_order,
        isTerminal: row.is_terminal,
        actors: row.actors
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.use("/:id/files", procedureFileRoutes);

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = procedureIdSchema.parse(req.params.id);
    const { rows } = await query(
      `select
         deal.id,
         deal.source,
         deal.external_id,
         deal.source_payload,
         deal.created_at,
         deal.updated_at,
         stage.name as stage_name,
         stage.code as stage_code,
         stage.sort_order as stage_order
       from deals deal
       left join deal_stages stage on stage.id = deal.stage_id
       where deal.deal_type = 'procedure'
         and (deal.id::text = $1 or upper(deal.external_id) = upper($1))
       limit 1`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "PROCEDURE_NOT_FOUND" });
    }

    const row = rows[0];
    const positionsResult = await query(
      `select
         id,
         source_position_id,
         position_kind,
         name,
         description,
         sku,
         category,
         ktru_code,
         okpd2_code,
         okei_code,
         okei_name,
         quantity,
         unit_price,
         total_price,
         currency,
         attributes,
         source_payload,
         sort_order
       from product_positions
       where deal_id = $1
       order by sort_order, id`,
      [row.id]
    );

    return res.json({
      procedure: {
        ...procedureFromRow(row),
        source: row.source,
        createdAt: row.created_at,
        sourceData: sanitizeSourceValue(row.source_payload),
        productPositions: positionsResult.rows.map(productPositionFromRow)
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
