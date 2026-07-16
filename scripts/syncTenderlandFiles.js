import { randomUUID } from "node:crypto";
import { config, requireConfig } from "../src/config.js";
import { getPool, query } from "../src/db.js";
import {
  processNextTenderlandDocument,
  recoverStaleIngestionJobs,
  syncTenderlandDocuments
} from "../src/documentService.js";
import { isFileStorageConfigured } from "../src/fileStorage.js";

const MAX_PROCEDURES = 30;
const MAX_FILES = 200;

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function positiveInteger(name, fallback, maximum) {
  const value = Number(argument(name, fallback));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return Math.min(value, maximum);
}

requireConfig("TENDERLAND_API_KEY", config.tenderlandApiKey);
const procedureLimit = positiveInteger("procedures", MAX_PROCEDURES, MAX_PROCEDURES);
const fileLimit = positiveInteger("files", MAX_FILES, MAX_FILES);
const { rows: deals } = await query(
  `select id, external_id
   from deals
   where deal_type = 'procedure'
     and source = 'tenderland'
     and external_id is not null
   order by updated_at desc
   limit $1`,
  [procedureLimit]
);

const metadata = { synced: 0, failed: 0, discovered: 0, queued: 0 };
for (const deal of deals) {
  try {
    const result = await syncTenderlandDocuments({
      dealId: deal.id,
      externalId: deal.external_id
    });
    metadata.synced += 1;
    metadata.discovered += result.total;
    metadata.queued += result.queued;
  } catch (error) {
    metadata.failed += 1;
    console.error(`Metadata sync failed for ${deal.external_id}: ${error.code || error.message}`);
  }
}

const downloads = { completed: 0, failed: 0, recoveredLocks: 0 };
if (isFileStorageConfigured() && fileLimit > 0) {
  downloads.recoveredLocks = await recoverStaleIngestionJobs();
  const workerId = `file-sync-${randomUUID()}`;
  for (let index = 0; index < fileLimit; index += 1) {
    const result = await processNextTenderlandDocument(workerId);
    if (!result) break;
    if (result.error) downloads.failed += 1;
    else downloads.completed += 1;
  }
}

console.log(JSON.stringify({
  proceduresRequested: procedureLimit,
  filesRequested: fileLimit,
  storageConfigured: isFileStorageConfigured(),
  metadata,
  downloads
}, null, 2));

await getPool().end();
