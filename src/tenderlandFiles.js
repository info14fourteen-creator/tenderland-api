import { config, requireConfig } from "./config.js";
import { safePublicUrl, sanitizeSourceValue } from "./sourceSanitizer.js";

export class TenderlandApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "TenderlandApiError";
    this.status = status;
    this.code = code;
  }
}

function buildUrl(pathname, searchParams = {}) {
  const url = new URL(`${config.tenderlandApiBaseUrl.replace(/\/$/, "")}${pathname}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function tenderlandFetch(pathname, searchParams) {
  requireConfig("TENDERLAND_API_KEY", config.tenderlandApiKey);
  const response = await fetch(buildUrl(pathname, searchParams), {
    headers: { [config.tenderlandApiKeyHeader]: config.tenderlandApiKey },
    signal: AbortSignal.timeout(60_000)
  });

  if (!response.ok) {
    const body = await response.text();
    let payload = {};
    try { payload = JSON.parse(body); } catch { /* Response is not JSON. */ }
    const code = payload.Code || payload.code || `HTTP_${response.status}`;
    throw new TenderlandApiError(`Tenderland request failed: ${code}`, response.status, code);
  }

  return response;
}

function listFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["items", "Items", "files", "Files", "data", "Data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function firstValue(item, ...names) {
  for (const name of names) {
    if (item?.[name] !== undefined && item?.[name] !== null) return item[name];
  }
  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export async function listTenderlandFiles(externalId) {
  const response = await tenderlandFetch("/File/GetEntityFileList", {
    entityId: externalId,
    entityTypeId: 1,
    format: "json"
  });
  const payload = await response.json();

  return listFromPayload(payload).map((raw, index) => {
    const id = firstValue(raw, "Id", "id") ?? `row-${index + 1}`;
    const storageId = numberOrNull(firstValue(raw, "StorageId", "storageId"));
    const name = String(firstValue(raw, "Name", "name") || `Документ ${index + 1}`).trim();
    const groupId = firstValue(raw, "GroupId", "groupId");
    const groupName = firstValue(raw, "GroupName", "groupName");
    const version = firstValue(raw, "Version", "version");
    const publishDate = firstValue(raw, "PublishDate", "publishDate");

    return {
      externalId: String(id),
      storageId: storageId && storageId > 0 ? storageId : null,
      name,
      sizeBytes: numberOrNull(firstValue(raw, "Size", "size")),
      groupId: groupId === null ? null : String(groupId),
      groupName: groupName === null ? null : String(groupName),
      version: version === null ? null : String(version),
      publishDate: publishDate || null,
      sourceUrl: safePublicUrl(firstValue(raw, "SourceLink", "sourceLink")),
      metadata: sanitizeSourceValue(raw)
    };
  });
}

export async function getTenderlandFile(storageId) {
  return tenderlandFetch("/File/Get", { storageId });
}
