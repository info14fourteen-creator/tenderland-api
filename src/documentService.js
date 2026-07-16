import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { config } from "./config.js";
import { getPool, query } from "./db.js";
import {
  createObjectKey,
  isFileStorageConfigured,
  requireFileStorage,
  uploadStream
} from "./fileStorage.js";
import { getTenderlandFile, listTenderlandFiles } from "./tenderlandFiles.js";

function familyKey(file) {
  if (file.groupId) return `tenderland:group:${file.groupId}`;
  const normalized = file.name.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
  return `tenderland:name:${normalized}`;
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeError(error) {
  let message = error?.message || "Unknown file processing error";
  if (config.tenderlandApiKey) {
    message = message.split(config.tenderlandApiKey).join("[скрыто]");
  }
  return message.slice(0, 1000);
}

export async function findProcedureDeal(identifier) {
  const { rows } = await query(
    `select id, external_id, source
     from deals
     where deal_type = 'procedure'
       and (id::text = $1 or upper(external_id) = upper($1))
     limit 1`,
    [identifier]
  );
  return rows[0] || null;
}

export async function syncTenderlandDocuments({ dealId, externalId }) {
  const files = await listTenderlandFiles(externalId);
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const existingResult = await client.query(
      `select external_id
       from documents
       where deal_id = $1 and source = 'tenderland'`,
      [dealId]
    );
    const existing = new Set(existingResult.rows.map((row) => row.external_id));
    let queued = 0;

    for (const file of files) {
      const incomingStatus = file.storageId
        ? "queued"
        : (file.sourceUrl ? "external_only" : "metadata_only");
      const result = await client.query(
        `insert into documents (
           deal_id, source, external_id, external_storage_id, family_key, name,
           size_bytes, group_id, group_name, version, published_at, source_url,
           status, metadata
         )
         values ($1, 'tenderland', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (deal_id, source, external_id) where external_id is not null
         do update set
           external_storage_id = excluded.external_storage_id,
           family_key = excluded.family_key,
           name = excluded.name,
           size_bytes = coalesce(excluded.size_bytes, documents.size_bytes),
           group_id = excluded.group_id,
           group_name = excluded.group_name,
           version = excluded.version,
           published_at = excluded.published_at,
           source_url = excluded.source_url,
           metadata = excluded.metadata,
           status = case
             when documents.status in ('stored', 'quarantined', 'deleted') then documents.status
             else excluded.status
           end,
           error_code = case when documents.status = 'stored' then documents.error_code else null end,
           error_message = case when documents.status = 'stored' then documents.error_message else null end
         returning id, status`,
        [
          dealId,
          file.externalId,
          file.storageId,
          familyKey(file),
          file.name,
          file.sizeBytes,
          file.groupId,
          file.groupName,
          file.version,
          validDate(file.publishDate),
          file.sourceUrl,
          incomingStatus,
          file.metadata
        ]
      );

      const document = result.rows[0];
      if (document.status === "queued") {
        queued += 1;
        await client.query(
          `insert into document_ingestion_jobs (document_id, job_type, status)
           values ($1, 'download_tenderland', 'pending')
           on conflict (document_id, job_type)
           do update set
             status = case
               when document_ingestion_jobs.status = 'completed' then 'completed'
               else 'pending'
             end,
             attempts = case
               when document_ingestion_jobs.status = 'failed' then 0
               else document_ingestion_jobs.attempts
             end,
             scheduled_at = case
               when document_ingestion_jobs.status = 'completed'
                 then document_ingestion_jobs.scheduled_at
               else now()
             end,
             locked_at = null,
             locked_by = null,
             last_error = case
               when document_ingestion_jobs.status = 'completed'
                 then document_ingestion_jobs.last_error
               else null
             end`,
          [document.id]
        );
      }
    }

    await client.query(
      `with ranked as (
         select
           id,
           row_number() over (
             partition by family_key
             order by published_at desc nulls last, version desc nulls last, id desc
           ) as position
         from documents
         where deal_id = $1
           and source = 'tenderland'
           and deleted_at is null
       )
       update documents document
       set is_current = ranked.position = 1
       from ranked
       where document.id = ranked.id`,
      [dealId]
    );

    await client.query("commit");
    return {
      total: files.length,
      inserted: files.filter((file) => !existing.has(file.externalId)).length,
      updated: files.filter((file) => existing.has(file.externalId)).length,
      queued,
      storageConfigured: isFileStorageConfigured()
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function claimIngestionJob(workerId) {
  const { rows } = await query(
    `with candidate as (
       select job.id
       from document_ingestion_jobs job
       join documents document on document.id = job.document_id
       where job.status = 'pending'
         and job.scheduled_at <= now()
         and job.attempts < job.max_attempts
         and document.deleted_at is null
       order by job.scheduled_at, job.id
       for update of job skip locked
       limit 1
     ), claimed as (
       update document_ingestion_jobs job
       set status = 'running',
           attempts = job.attempts + 1,
           locked_at = now(),
           locked_by = $1,
           last_error = null
       from candidate
       where job.id = candidate.id
       returning job.*
     )
     select
       claimed.*,
       document.deal_id,
       document.external_storage_id,
       document.name,
       document.content_type,
       document.size_bytes
     from claimed
     join documents document on document.id = claimed.document_id`,
    [workerId]
  );
  const job = rows[0] || null;
  if (job) {
    await query(
      `update documents
       set status = 'downloading', error_code = null, error_message = null
       where id = $1`,
      [job.document_id]
    );
  }
  return job;
}

async function finishFailedJob(job, error, fileObjectId) {
  const finalFailure = Number(job.attempts) >= Number(job.max_attempts);
  const message = safeError(error);
  const retryDelay = `${Math.min(60, 2 ** Number(job.attempts))} minutes`;
  const client = await getPool().connect();

  try {
    await client.query("begin");
    if (fileObjectId) {
      await client.query(
        `update file_objects
         set status = 'failed', metadata = metadata || jsonb_build_object('error', $2::text)
         where id = $1`,
        [fileObjectId, message]
      );
    }
    await client.query(
      `update documents
       set status = $2,
           error_code = 'DOWNLOAD_FAILED',
           error_message = $3
       where id = $1`,
      [job.document_id, finalFailure ? "failed" : "queued", message]
    );
    await client.query(
      `update document_ingestion_jobs
       set status = $2,
           scheduled_at = case when $2 = 'pending' then now() + $4::interval else scheduled_at end,
           locked_at = null,
           locked_by = null,
           last_error = $3
       where id = $1`,
      [job.id, finalFailure ? "failed" : "pending", message, retryDelay]
    );
    await client.query("commit");
  } catch (updateError) {
    await client.query("rollback");
    throw updateError;
  } finally {
    client.release();
  }
}

export async function recoverStaleIngestionJobs() {
  const { rowCount } = await query(
    `update document_ingestion_jobs
     set status = 'pending',
         scheduled_at = now(),
         locked_at = null,
         locked_by = null,
         last_error = 'Worker lock expired'
     where status = 'running'
       and locked_at < now() - interval '30 minutes'`
  );
  return rowCount;
}

export async function processNextTenderlandDocument(workerId = randomUUID()) {
  requireFileStorage();
  const job = await claimIngestionJob(workerId);
  if (!job) return null;

  let fileObjectId = null;
  try {
    const response = await getTenderlandFile(job.external_storage_id);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLengthHeader = Number(response.headers.get("content-length"));
    const contentLength = Number.isFinite(contentLengthHeader) ? contentLengthHeader : null;
    const objectKey = createObjectKey(job.deal_id, "tenderland", job.name);
    const objectResult = await query(
      `insert into file_objects (
         storage_provider, bucket_name, object_key, status, original_name,
         content_type, size_bytes, metadata
       )
       values ('r2', $1, $2, 'uploading', $3, $4, $5, $6)
       returning id`,
      [
        config.r2BucketName,
        objectKey,
        job.name,
        contentType,
        contentLength,
        { tenderlandStorageId: job.external_storage_id, ingestionJobId: job.id }
      ]
    );
    fileObjectId = objectResult.rows[0].id;

    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      }
    });
    const body = Readable.fromWeb(response.body).pipe(meter);
    const uploaded = await uploadStream({
      objectKey,
      body,
      contentType,
      contentLength
    });

    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query(
        `update file_objects
         set status = 'stored',
             content_type = $2,
             size_bytes = $3,
             sha256 = $4,
             etag = $5,
             stored_at = now()
         where id = $1`,
        [fileObjectId, contentType, bytes, hash.digest("hex"), uploaded.etag]
      );
      await client.query(
        `update documents
         set file_object_id = $2,
             status = 'stored',
             content_type = $3,
             size_bytes = $4,
             error_code = null,
             error_message = null
         where id = $1`,
        [job.document_id, fileObjectId, contentType, bytes]
      );
      await client.query(
        `update document_ingestion_jobs
         set status = 'completed',
             completed_at = now(),
             locked_at = null,
             locked_by = null,
             last_error = null
         where id = $1`,
        [job.id]
      );
      await client.query(
        `insert into document_events (document_id, event_type, metadata)
         values ($1, 'tenderland_downloaded', $2)`,
        [job.document_id, { sizeBytes: bytes }]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return { documentId: String(job.document_id), name: job.name, sizeBytes: bytes };
  } catch (error) {
    await finishFailedJob(job, error, fileObjectId);
    return { documentId: String(job.document_id), name: job.name, error: safeError(error) };
  }
}
