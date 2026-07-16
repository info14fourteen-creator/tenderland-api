import assert from "node:assert/strict";
import test from "node:test";
import { createObjectKey } from "../src/fileStorage.js";
import { safePublicUrl, sanitizeSourceValue } from "../src/sourceSanitizer.js";

test("safePublicUrl removes API credentials from query strings", () => {
  const result = safePublicUrl("https://tenderland.ru/file?id=7&apiKey=secret&token=other");
  const url = new URL(result);

  assert.equal(url.searchParams.get("id"), "7");
  assert.equal(url.searchParams.has("apiKey"), false);
  assert.equal(url.searchParams.has("token"), false);
});

test("sanitizeSourceValue recursively redacts secret fields and URLs", () => {
  const result = sanitizeSourceValue({
    nested: [{ apiKey: "secret", sourceLink: "https://example.com/a?apiKey=secret&x=1" }]
  });

  assert.equal(result.nested[0].apiKey, "[скрыто]");
  assert.doesNotMatch(result.nested[0].sourceLink, /secret/);
});

test("object keys do not expose the original filename", () => {
  const key = createObjectKey(42, "manual", "sensitive contract.PDF");

  assert.match(key, /^procedures\/42\/manual\/\d{4}-\d{2}\/[0-9a-f-]+\.pdf$/);
  assert.doesNotMatch(key, /sensitive|contract/i);
});
