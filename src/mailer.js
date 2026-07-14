import nodemailer from "nodemailer";
import { config } from "./config.js";

let transporter;

function isSmtpConfigured() {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass && config.mailFrom);
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    const error = new Error("MAIL_NOT_CONFIGURED");
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      },
      requireTLS: !config.smtpSecure
    });
  }

  return transporter;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendRegistrationPasswordEmail({ to, password }) {
  if (!isSmtpConfigured() && config.nodeEnv !== "production") {
    console.info(`Registration password for ${to}: ${password}`);
    return;
  }

  const loginUrl = config.appUrl;
  const safeTo = escapeHtml(to);
  const safePassword = escapeHtml(password);
  const safeLoginUrl = escapeHtml(loginUrl);
  const subject = "Доступ к Kortex Capital";
  const text = [
    "Здравствуйте.",
    "",
    "Для вашей почты создан доступ к Kortex Capital.",
    `Логин: ${to}`,
    `Временный пароль: ${password}`,
    "",
    `Войти: ${loginUrl}`,
    "",
    "Если вы не запрашивали доступ, просто проигнорируйте это письмо."
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #25274D; line-height: 1.5;">
      <h1 style="margin: 0 0 16px; font-size: 20px;">Доступ к Kortex Capital</h1>
      <p>Для вашей почты создан доступ к Kortex Capital.</p>
      <p><strong>Логин:</strong> ${safeTo}</p>
      <p><strong>Временный пароль:</strong> ${safePassword}</p>
      <p><a href="${safeLoginUrl}" style="color: #29648A;">Войти в систему</a></p>
      <p style="color: #464866;">Если вы не запрашивали доступ, просто проигнорируйте это письмо.</p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `"Kortex Capital" <${config.mailFrom}>`,
    to,
    subject,
    text,
    html
  });
}
