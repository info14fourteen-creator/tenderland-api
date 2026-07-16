import { config } from "./config.js";

export function safePublicUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    for (const key of [...url.searchParams.keys()]) {
      if (/^api.?key$/i.test(key) || /secret|token/i.test(key)) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeSourceValue(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSourceValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeSourceValue(childValue, childKey)
      ])
    );
  }

  if (/api.?key|secret|token/i.test(key)) {
    return value ? "[скрыто]" : value;
  }

  if (typeof value !== "string") return value;

  let sanitized = value.replace(/([?&]apiKey=)[^&\s"']*/gi, "$1[скрыто]");
  if (config.tenderlandApiKey) {
    sanitized = sanitized.split(config.tenderlandApiKey).join("[скрыто]");
  }

  return sanitized;
}
