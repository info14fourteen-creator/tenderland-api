import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { config, requireConfig } from "./config.js";

let client;

export function isFileStorageConfigured() {
  return Boolean(
    config.r2AccountId
    && config.r2AccessKeyId
    && config.r2SecretAccessKey
    && config.r2BucketName
  );
}

export function requireFileStorage() {
  requireConfig("R2_ACCOUNT_ID", config.r2AccountId);
  requireConfig("R2_ACCESS_KEY_ID", config.r2AccessKeyId);
  requireConfig("R2_SECRET_ACCESS_KEY", config.r2SecretAccessKey);
  requireConfig("R2_BUCKET_NAME", config.r2BucketName);
}

function getClient() {
  requireFileStorage();

  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: config.r2Endpoint || `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey
      }
    });
  }

  return client;
}

function signedUrlTtl() {
  const requested = Number(config.fileSignedUrlExpiresSeconds);
  if (!Number.isFinite(requested)) return 900;
  return Math.min(Math.max(Math.trunc(requested), 60), 3600);
}

function safeExtension(filename) {
  const extension = extname(filename || "").toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : "";
}

export function createObjectKey(dealId, source, filename) {
  const date = new Date();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return [
    "procedures",
    String(dealId),
    source,
    `${date.getUTCFullYear()}-${month}`,
    `${randomUUID()}${safeExtension(filename)}`
  ].join("/");
}

function contentDisposition(filename) {
  const ascii = String(filename || "document")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 140) || "document";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename || "document")}`;
}

export async function createUploadUrl({ objectKey, contentType, sizeBytes }) {
  const command = new PutObjectCommand({
    Bucket: config.r2BucketName,
    Key: objectKey,
    ContentType: contentType || "application/octet-stream",
    ContentLength: sizeBytes
  });
  const expiresIn = signedUrlTtl();

  return {
    url: await getSignedUrl(getClient(), command, { expiresIn }),
    headers: { "Content-Type": contentType || "application/octet-stream" },
    expiresIn
  };
}

export async function inspectObject(objectKey) {
  const result = await getClient().send(new HeadObjectCommand({
    Bucket: config.r2BucketName,
    Key: objectKey
  }));

  return {
    sizeBytes: Number(result.ContentLength || 0),
    contentType: result.ContentType || null,
    etag: result.ETag?.replace(/^"|"$/g, "") || null,
    metadata: result.Metadata || {}
  };
}

export async function createDownloadUrl({ objectKey, filename }) {
  const command = new GetObjectCommand({
    Bucket: config.r2BucketName,
    Key: objectKey,
    ResponseContentDisposition: contentDisposition(filename),
    ResponseContentType: "application/octet-stream"
  });

  return getSignedUrl(getClient(), command, { expiresIn: signedUrlTtl() });
}

export async function deleteStoredObject(objectKey) {
  await getClient().send(new DeleteObjectCommand({
    Bucket: config.r2BucketName,
    Key: objectKey
  }));
}

export async function uploadStream({ objectKey, body, contentType, contentLength }) {
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: config.r2BucketName,
      Key: objectKey,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      ...(Number.isFinite(contentLength) && contentLength >= 0
        ? { ContentLength: contentLength }
        : {})
    },
    queueSize: 2,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false
  });

  const result = await upload.done();
  return { etag: result.ETag?.replace(/^"|"$/g, "") || null };
}
