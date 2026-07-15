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
      }
    }))
  };
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
       from procedures
       where source = 'tenderland'
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
       insert into procedures (source, external_id, source_payload)
       select 'tenderland', external_id, payload
       from incoming
       on conflict (source, external_id)
       do update set source_payload = excluded.source_payload`,
      [JSON.stringify(procedures)]
    );

    await client.query("commit");

    return {
      inserted: procedures.filter((procedure) => !existing.has(procedure.external_id)).length,
      updated: procedures.filter((procedure) => existing.has(procedure.external_id)).length
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
  skippedRowsWithoutTenderId: grouped.rowsWithoutTenderId,
  report: report.Name,
  autosearch: autosearch.Name
}, null, 2));

await getPool().end();
