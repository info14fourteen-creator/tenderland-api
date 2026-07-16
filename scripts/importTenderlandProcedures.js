import { getPool } from "../src/db.js";
import { config, requireConfig } from "../src/config.js";

const MAX_PROCEDURES = 30;

function getArgument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function getLimit() {
  const requested = Number(getArgument("limit", MAX_PROCEDURES));

  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error("--limit must be a positive integer");
  }

  return Math.min(requested, MAX_PROCEDURES);
}

async function tenderlandRequest(pathname, searchParams = {}) {
  const url = new URL(`${config.tenderlandApiBaseUrl}${pathname}`);

  for (const [name, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      [config.tenderlandApiKeyHeader]: config.tenderlandApiKey
    }
  });
  const body = await response.text();
  let data;

  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Tenderland returned non-JSON response (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(
      `Tenderland request failed (${response.status}): ${data.Code || data.code || "API_ERROR"}`
    );
  }

  return data;
}

function getItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.Items)) return data.Items;
  return [];
}

function findByName(items, name, entityName) {
  const matches = items
    .filter((item) => item.Name === name)
    .sort((left, right) => Number(right.Id) - Number(left.Id));

  if (!matches.length) {
    throw new Error(`${entityName} "${name}" was not found in Tenderland`);
  }

  return matches[0];
}

function groupProcedureRows(rows, metadata) {
  const grouped = new Map();
  let rowsWithoutTenderId = 0;

  for (const row of rows) {
    const tenderId = row?.tender_id ?? row?.tender?.id ?? row?.Tender?.Id;

    if (tenderId === undefined || tenderId === null || tenderId === "") {
      rowsWithoutTenderId += 1;
      continue;
    }

    const externalId = String(tenderId);
    const current = grouped.get(externalId) || [];
    current.push(row);
    grouped.set(externalId, current);
  }

  return {
    rowsWithoutTenderId,
    procedures: [...grouped].map(([externalId, procedureRows]) => ({
      external_id: externalId,
      payload: {
        import: metadata,
        rows: procedureRows
      },
      positions: productPositionsFromRows(procedureRows)
    }))
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function productPositionsFromRows(rows) {
  const positions = new Map();

  rows.forEach((row, rowIndex) => {
    const tender = row?.tender || {};
    const products = Array.isArray(tender.products) ? tender.products : [];

    products.forEach((product, productIndex) => {
      const externalId = String(
        product.id
        ?? product.lotProductId
        ?? `row-${rowIndex + 1}-product-${productIndex + 1}`
      );

      positions.set(externalId, {
        external_id: externalId,
        name: product.lotProductName || null,
        ktru_code: product.lotKtruCode || null,
        okpd2_code: product.lotOkpd2Code || null,
        okei_code: product.lotProductsOkeiCode || null,
        okei_name: product.lotProductsOkeiName || null,
        quantity: numberOrNull(product.lotProductCount),
        unit_price: numberOrNull(product.lotProductPrice),
        total_price: numberOrNull(product.lotProductsSum),
        currency: tender.lotCurrency || null,
        source_payload: product,
        sort_order: productIndex + 1
      });
    });
  });

  return [...positions.values()];
}

async function syncProductPositions(client, procedures) {
  const externalIds = procedures.map((procedure) => procedure.external_id);
  const dealsResult = await client.query(
    `select id, external_id
     from deals
     where deal_type = 'procedure'
       and source = 'tenderland'
       and external_id = any($1::text[])`,
    [externalIds]
  );
  const dealIds = new Map(dealsResult.rows.map((row) => [row.external_id, row.id]));

  await client.query(
    `delete from product_positions
     where source = 'tenderland'
       and deal_id = any($1::bigint[])`,
    [dealsResult.rows.map((row) => row.id)]
  );

  const positions = procedures.flatMap((procedure) => {
    const dealId = dealIds.get(procedure.external_id);
    if (!dealId) return [];

    return procedure.positions.map((position) => ({
      ...position,
      deal_id: dealId
    }));
  });

  if (!positions.length) return 0;

  await client.query(
    `with incoming as (
       select *
       from jsonb_to_recordset($1::jsonb) as item(
         deal_id bigint,
         external_id text,
         name text,
         ktru_code text,
         okpd2_code text,
         okei_code text,
         okei_name text,
         quantity numeric,
         unit_price numeric,
         total_price numeric,
         currency text,
         source_payload jsonb,
         sort_order integer
       )
     )
     insert into product_positions (
       deal_id,
       source,
       external_id,
       name,
       ktru_code,
       okpd2_code,
       okei_code,
       okei_name,
       quantity,
       unit_price,
       total_price,
       currency,
       source_payload,
       sort_order
     )
     select
       deal_id,
       'tenderland',
       external_id,
       name,
       ktru_code,
       okpd2_code,
       okei_code,
       okei_name,
       quantity,
       unit_price,
       total_price,
       currency,
       source_payload,
       sort_order
     from incoming`,
    [JSON.stringify(positions)]
  );

  return positions.length;
}

async function upsertProcedures(procedures) {
  if (!procedures.length) return { inserted: 0, updated: 0 };

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const externalIds = procedures.map((procedure) => procedure.external_id);
    const existingResult = await client.query(
      `select external_id
       from deals
       where deal_type = 'procedure'
         and source = 'tenderland'
         and external_id = any($1::text[])`,
      [externalIds]
    );
    const existing = new Set(existingResult.rows.map((row) => row.external_id));

    await client.query(
      `with incoming as (
         select external_id, payload
         from jsonb_to_recordset($1::jsonb)
           as item(external_id text, payload jsonb)
       )
       insert into deals (deal_type, stage_id, source, external_id, source_payload)
       select 'procedure', stage.id, 'tenderland', incoming.external_id, incoming.payload
       from incoming
       join deal_stages stage
         on stage.deal_type = 'procedure'
        and stage.code = 'exported'
       on conflict (source, external_id, deal_type)
       do update set source_payload = excluded.source_payload`,
      [JSON.stringify(procedures)]
    );

    const syncedProductPositions = await syncProductPositions(client, procedures);

    await client.query("commit");

    return {
      inserted: procedures.filter((procedure) => !existing.has(procedure.external_id)).length,
      updated: procedures.filter((procedure) => existing.has(procedure.external_id)).length,
      syncedProductPositions
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

requireConfig("TENDERLAND_API_BASE_URL", config.tenderlandApiBaseUrl);
requireConfig("TENDERLAND_API_KEY", config.tenderlandApiKey);

const limit = getLimit();
const reportName = getArgument("report", config.tenderlandReportName);
const autosearchName = getArgument("autosearch", config.tenderlandAutosearchName);

const [reportList, autosearchList] = await Promise.all([
  tenderlandRequest("/Dictionary/GetExportViewList", { format: "json" }),
  tenderlandRequest("/Dictionary/GetAutosearchList", { format: "json" })
]);
const report = findByName(getItems(reportList), reportName, "Report");
const autosearch = findByName(getItems(autosearchList), autosearchName, "Autosearch");

if (!report.Fields?.includes("tender_id")) {
  throw new Error(`Report "${reportName}" must include tender_id`);
}

const exportTask = await tenderlandRequest("/Export/Create", {
  autosearchId: autosearch.Id,
  exportViewId: report.Id,
  limit,
  batchSize: limit,
  orderBy: "tender_sysPublishDate.desc",
  format: "json"
});
const exportId = exportTask.Id ?? exportTask.id ?? exportTask.exportId;

if (!exportId) {
  throw new Error("Tenderland did not return an export task identifier");
}

const exportResult = await tenderlandRequest("/Export/Get", {
  exportId,
  offset: 0,
  format: "json"
});
const exportedRows = getItems(exportResult).slice(0, limit);
const exportedAt = new Date().toISOString();
const grouped = groupProcedureRows(exportedRows, {
  exportedAt,
  autosearchId: autosearch.Id,
  autosearchName: autosearch.Name,
  reportId: report.Id,
  reportName: report.Name
});
const result = await upsertProcedures(grouped.procedures);

console.log(JSON.stringify({
  requestedLimit: limit,
  exportTotalCount: Number(exportTask.TotalCount ?? exportTask.totalCount ?? exportedRows.length),
  exportedRows: exportedRows.length,
  uniqueProcedures: grouped.procedures.length,
  inserted: result.inserted,
  updated: result.updated,
  syncedProductPositions: result.syncedProductPositions,
  skippedRowsWithoutTenderId: grouped.rowsWithoutTenderId,
  report: report.Name,
  autosearch: autosearch.Name
}, null, 2));

await getPool().end();
