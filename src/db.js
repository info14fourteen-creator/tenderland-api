import pg from "pg";
import { config, requireConfig } from "./config.js";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    requireConfig("DATABASE_URL", config.databaseUrl);
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : false
    });
  }

  return pool;
}

export async function query(text, params) {
  const result = await getPool().query(text, params);
  return result;
}
