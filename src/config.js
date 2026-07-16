import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  tenderlandApiBaseUrl: process.env.TENDERLAND_API_BASE_URL || "https://tenderland.ru/Api/v1",
  tenderlandApiKey: process.env.TENDERLAND_API_KEY || "",
  tenderlandApiKeyHeader: process.env.TENDERLAND_API_KEY_HEADER || "Tenderland-Api-Key",
  tenderlandReportName: process.env.TENDERLAND_REPORT_NAME || "Kortex CRM",
  tenderlandAutosearchName: process.env.TENDERLAND_AUTOSEARCH_NAME || "Kortex CRM",
  r2AccountId: process.env.R2_ACCOUNT_ID || "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  r2BucketName: process.env.R2_BUCKET_NAME || "",
  r2Endpoint: process.env.R2_ENDPOINT || "",
  fileUploadMaxBytes: Number(process.env.FILE_UPLOAD_MAX_BYTES || 262144000),
  fileSignedUrlExpiresSeconds: Number(process.env.FILE_SIGNED_URL_EXPIRES_SECONDS || 900),
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  adminEmail: (process.env.ADMIN_EMAIL || "admin@kortex.capital").toLowerCase(),
  adminBootstrapInviteCode: process.env.ADMIN_BOOTSTRAP_INVITE_CODE || "",
  appUrl: process.env.APP_URL || "https://kortex.capital",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_USER || "",
  nodeEnv: process.env.NODE_ENV || "development"
};

export function requireConfig(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}
