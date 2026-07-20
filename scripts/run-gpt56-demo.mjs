import { pathToFileURL } from "node:url";

import {
  createIntelligenceClient,
  MissingApiKeyError,
} from "@living-software/intelligence";

import { buildNeutralDemo } from "./run-neutral-demo.mjs";

export async function runGpt56Demo(
  intelligence = createIntelligenceClient(),
) {
  const { manifest, opportunity, evidenceEvents } = await buildNeutralDemo();
  return intelligence.draftEvolutionBrief({
    manifest,
    opportunity,
    evidenceEvents,
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await runGpt56Demo();
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "living.gpt56-demo-result/v1",
      ...result,
    }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      process.stderr.write(
        "OPENAI_API_KEY is required for the explicit live GPT-5.6 proof run.\n",
      );
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.exitCode = 1;
  }
}
