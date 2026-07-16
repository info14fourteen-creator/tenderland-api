import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrations = [
  "001_create_users.sql",
  "002_create_invitations.sql",
  "003_require_invitation_email.sql",
  "004_split_categories_and_roles.sql",
  "005_add_business_roles_array.sql",
  "006_add_legal_acceptance.sql",
  "007_create_procedures_and_contracts.sql",
  "008_create_companies_and_contacts.sql",
  "009_add_procedure_stage.sql",
  "010_unify_deals_and_product_positions.sql",
  "011_create_document_storage.sql"
];

for (const migration of migrations) {
  const sql = await readFile(join(__dirname, "..", "db", "migrations", migration), "utf8");
  await getPool().query(sql);
  console.log(`Applied ${migration}`);
}

await getPool().end();
