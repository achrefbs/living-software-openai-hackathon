import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("live detector UI preserves recurring workflow context without inferring friction", async () => {
  const source = await readFile(
    path.join(
      fileURLToPath(new URL("../src/", import.meta.url)),
      "app",
      "live",
      "live-run-client.tsx",
    ),
    "utf8",
  );

  assert.match(source, /kind: "repeated-sequence"/u);
  assert.match(source, /label: "Recurring workflow"/u);
  assert.match(source, /recurrence alone does not prove friction or intent/iu);
});
