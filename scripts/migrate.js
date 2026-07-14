import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrations = [
  "001_create_users.sql",
  "002_create_invitations.sql"
];

for (const migration of migrations) {
  const sql = await readFile(join(__dirname, "..", "db", "migrations", migration), "utf8");
  await getPool().query(sql);
  console.log(`Applied ${migration}`);
}

await getPool().end();
