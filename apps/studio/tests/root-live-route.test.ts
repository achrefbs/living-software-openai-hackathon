import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("root route separates explicit live mode from the offline snapshot redirect", async () => {
  const source = await readFile(
    path.join(
      fileURLToPath(new URL("../src/", import.meta.url)),
      "app",
      "page.tsx",
    ),
    "utf8",
  );

  const liveModeCheck = source.indexOf("if (isLiveStudioMode())");
  const liveRedirect = source.indexOf('redirect("/live")');
  const offlineLoad = source.indexOf("await getStudioDataset()");
  const offlineRedirect = source.indexOf(
    'redirect(studioAppHref(dataset.app.id, "map"))',
  );

  assert.ok(liveModeCheck >= 0, "root route must check explicit live mode");
  assert.ok(liveModeCheck < liveRedirect, "live branch must redirect to /live");
  assert.ok(
    liveRedirect < offlineLoad,
    "live mode must redirect before loading any offline snapshot data",
  );
  assert.ok(
    offlineLoad < offlineRedirect,
    "offline mode must retain the existing dataset-derived map redirect",
  );
});
