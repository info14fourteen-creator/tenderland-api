import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
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
