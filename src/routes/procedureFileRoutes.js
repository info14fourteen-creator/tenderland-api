import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { config } from "../config.js";
import { findProcedureDeal, syncTenderlandDocuments } from "../documentService.js";
import {
  createDownloadUrl,
  createObjectKey,
  createUploadUrl,
  deleteStoredObject,
  inspectObject,
  isFileStorageConfigured
} from "../fileStorage.js";
import { getPool, query } from "../db.js";
import { TenderlandApiError } from "../tenderlandFiles.js";

const router = Router({ mergeParams: true });

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(120).optional()
});
const uploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(0),
  contentType: z.string().trim().max(255).optional()
});
const documentIdSchema = z.coerce.number().int().positive();

function documentFromRow(row) {
  return {
    id: String(row.id),
    source: row.source,
    name: row.name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    groupId: row.group_id,
    groupName: row.group_name,
    version: row.version,
    publishedAt: row.published_at,
    status: row.status,
    isCurrent: row.is_current,
    hasStoredFile: row.file_status === "stored",
    hasExternalSource: Boolean(row.source_url),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function requireProcedure(req, res) {
  const deal = await findProcedureDeal(req.params.id);
  if (!deal) {
    res.status(404).json({ error: "PROCEDURE_NOT_FOUND" });
    return null;
  }
  return deal;
}

function storageUnavailable(res) {
  return res.status(503).json({
    error: "FILE_STORAGE_UNAVAILABLE",
    message: "Файловое хранилище пока не настроено"
  });
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const deal = await requireProcedure(req, res);
    if (!deal) return;
    const { limit, offset, q } = listSchema.parse(req.query);
    const search = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
    const [documentsResult, summaryResult] = await Promise.all([
      query(
        `select
           document.*,
           file_object.status as file_status
         from documents document
         left join file_objects file_object on file_object.id = document.file_object_id
         where document.deal_id = $1
           and document.deleted_at is null
           and ($4::text is null or document.name ilike $4 escape '\\')
         order by
           document.is_current desc,
           document.published_at desc nulls last,
           document.created_at desc,
           document.id desc
         limit $2 offset $3`,
        [deal.id, limit, offset, search]
      ),
      query(
        `select
           count(*)::integer as total,
           count(*) filter (
             where $2::text is null or name ilike $2 escape '\\'
           )::integer as matched_total,
           count(*) filter (where status = 'stored')::integer as stored,
           count(*) filter (where status in ('queued', 'downloading'))::integer as processing,
           count(*) filter (where status = 'failed')::integer as failed,
           coalesce(sum(size_bytes) filter (where status = 'stored'), 0)::bigint as stored_bytes
         from documents
         where deal_id = $1 and deleted_at is null`,
        [deal.id, search]
      )
    ]);
    const summary = summaryResult.rows[0];

    return res.json({
      documents: documentsResult.rows.map(documentFromRow),
      pagination: {
        limit,
        offset,
        total: Number(summary.matched_total)
      },
      summary: {
        total: Number(summary.total),
        stored: Number(summary.stored),
        processing: Number(summary.processing),
        failed: Number(summary.failed),
        storedBytes: Number(summary.stored_bytes)
      },
      capabilities: {
        storageConfigured: isFileStorageConfigured(),
        maxUploadBytes: Number(config.fileUploadMaxBytes)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/uploads", requireAuth, async (req, res, next) => {
  try {
    if (!isFileStorageConfigured()) return storageUnavailable(res);
    const deal = await requireProcedure(req, res);
    if (!deal) return;
    const input = uploadSchema.parse(req.body);
    if (input.size > config.fileUploadMaxBytes) {
      return res.status(413).json({ error: "FILE_TOO_LARGE" });
    }

    const contentType = input.contentType || "application/octet-stream";
    const objectKey = createObjectKey(deal.id, "manual", input.name);
    const signedUpload = await createUploadUrl({
      objectKey,
      contentType,
      sizeBytes: input.size
    });
    const familyKey = `manual:${randomUUID()}`;
    const client = await getPool().connect();
    let document;

    try {
      await client.query("begin");
      const objectResult = await client.query(
        `insert into file_objects (
           storage_provider, bucket_name, object_key, status, original_name,
           content_type, size_bytes, created_by
         )
         values ('r2', $1, $2, 'pending', $3, $4, $5, $6)
         returning id`,
        [config.r2BucketName, objectKey, input.name, contentType, input.size, req.user.id]
      );
      const documentResult = await client.query(
        `insert into documents (
           deal_id, file_object_id, source, family_key, name, content_type,
           size_bytes, status, created_by
         )
         values ($1, $2, 'manual', $3, $4, $5, $6, 'pending_upload', $7)
         returning *`,
        [deal.id, objectResult.rows[0].id, familyKey, input.name, contentType, input.size, req.user.id]
      );
      document = documentResult.rows[0];
      await client.query(
        `insert into document_events (document_id, user_id, event_type, metadata)
         values ($1, $2, 'upload_created', $3)`,
        [document.id, req.user.id, { sizeBytes: input.size }]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({
      document: documentFromRow(document),
      upload: {
        url: signedUpload.url,
        headers: signedUpload.headers,
        expiresAt: new Date(Date.now() + signedUpload.expiresIn * 1000).toISOString()
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:documentId/complete", requireAuth, async (req, res, next) => {
  try {
    if (!isFileStorageConfigured()) return storageUnavailable(res);
    const deal = await requireProcedure(req, res);
    if (!deal) return;
    const documentId = documentIdSchema.parse(req.params.documentId);
    const { rows } = await query(
      `select
         document.id,
         document.size_bytes as expected_size,
         document.file_object_id,
         file_object.object_key
       from documents document
       join file_objects file_object on file_object.id = document.file_object_id
       where document.id = $1
         and document.deal_id = $2
         and document.source = 'manual'
         and document.deleted_at is null`,
      [documentId, deal.id]
    );
    const document = rows[0];
    if (!document) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });

    let stored;
    try {
      stored = await inspectObject(document.object_key);
    } catch (error) {
      if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        return res.status(409).json({ error: "UPLOAD_NOT_FOUND" });
      }
      throw error;
    }

    if (Number(document.expected_size) !== stored.sizeBytes) {
      await query(
        `update documents set status = 'failed', error_code = 'FILE_SIZE_MISMATCH'
         where id = $1`,
        [documentId]
      );
      await query(
        `update file_objects set status = 'failed' where id = $1`,
        [document.file_object_id]
      );
      return res.status(409).json({ error: "FILE_SIZE_MISMATCH" });
    }

    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query(
        `update file_objects
         set status = 'stored', size_bytes = $2, content_type = $3,
             etag = $4, metadata = metadata || $5::jsonb, stored_at = now()
         where id = $1`,
        [document.file_object_id, stored.sizeBytes, stored.contentType, stored.etag, stored.metadata]
      );
      const result = await client.query(
        `update documents
         set status = 'stored', size_bytes = $2,
             content_type = coalesce($3, content_type), error_code = null, error_message = null
         where id = $1
         returning *`,
        [documentId, stored.sizeBytes, stored.contentType]
      );
      await client.query(
        `insert into document_events (document_id, user_id, event_type, metadata)
         values ($1, $2, 'upload_completed', $3)`,
        [documentId, req.user.id, { sizeBytes: stored.sizeBytes }]
      );
      await client.query("commit");
      return res.json({ document: documentFromRow({ ...result.rows[0], file_status: "stored" }) });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

router.get("/:documentId/download", requireAuth, async (req, res, next) => {
  try {
    const deal = await requireProcedure(req, res);
    if (!deal) return;
    const documentId = documentIdSchema.parse(req.params.documentId);
    const { rows } = await query(
      `select
         document.id, document.name, document.status, document.source_url,
         file_object.object_key, file_object.status as file_status
       from documents document
       left join file_objects file_object on file_object.id = document.file_object_id
       where document.id = $1
         and document.deal_id = $2
         and document.deleted_at is null`,
      [documentId, deal.id]
    );
    const document = rows[0];
    if (!document) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });

    let url;
    let external = false;
    if (document.file_status === "stored" && document.object_key) {
      if (!isFileStorageConfigured()) return storageUnavailable(res);
      url = await createDownloadUrl({ objectKey: document.object_key, filename: document.name });
    } else if (document.source_url) {
      url = document.source_url;
      external = true;
    } else {
      return res.status(409).json({ error: "DOCUMENT_NOT_READY" });
    }

    await query(
      `insert into document_events (document_id, user_id, event_type, metadata)
       values ($1, $2, 'download_requested', $3)`,
      [documentId, req.user.id, { external }]
    );
    return res.json({ url, external });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:documentId", requireAuth, async (req, res, next) => {
  try {
    const deal = await requireProcedure(req, res);
    if (!deal) return;
    const documentId = documentIdSchema.parse(req.params.documentId);
    const documentResult = await query(
      `select
         document.id,
         document.file_object_id,
         file_object.object_key,
         file_object.status as file_status
       from documents document
       left join file_objects file_object on file_object.id = document.file_object_id
       where document.id = $1
         and document.deal_id = $2
         and document.deleted_at is null`,
      [documentId, deal.id]
    );
    const document = documentResult.rows[0];
    if (!document) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    if (document.object_key && document.file_status !== "deleted") {
      if (!isFileStorageConfigured()) return storageUnavailable(res);
      await deleteStoredObject(document.object_key);
    }
    const client = await getPool().connect();

    try {
      await client.query("begin");
      const result = await client.query(
        `update documents
         set status = 'deleted', deleted_at = now(), is_current = false
         where id = $1 and deal_id = $2 and deleted_at is null
         returning file_object_id`,
        [documentId, deal.id]
      );
      if (!result.rows[0]) {
        await client.query("rollback");
        return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
      }
      if (result.rows[0].file_object_id) {
        await client.query(
          `update file_objects set status = 'deleted', deleted_at = now() where id = $1`,
          [result.rows[0].file_object_id]
        );
      }
      await client.query(
        `insert into document_events (document_id, user_id, event_type)
         values ($1, $2, 'deleted')`,
        [documentId, req.user.id]
      );
      await client.query("commit");
      return res.status(204).end();
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

router.post("/sync", requireAuth, async (req, res, next) => {
  try {
    const deal = await requireProcedure(req, res);
    if (!deal) return;
    if (deal.source !== "tenderland" || !deal.external_id) {
      return res.status(409).json({ error: "TENDERLAND_SOURCE_REQUIRED" });
    }
    const result = await syncTenderlandDocuments({
      dealId: deal.id,
      externalId: deal.external_id
    });
    return res.json({ sync: result });
  } catch (error) {
    if (error instanceof TenderlandApiError) {
      return res.status(502).json({
        error: "TENDERLAND_FILE_SYNC_FAILED",
        providerStatus: error.status,
        providerCode: error.code
      });
    }
    return next(error);
  }
});

export default router;
