import {
  evolutionReceiptSchema,
  type EvolutionReceipt,
  type JsonObject,
} from "@living-software/contracts";

import { canonicalJson, hashJson } from "./canonical.js";
import { SourceEvolutionError } from "./errors.js";

export type NewEvolutionReceipt = Readonly<{
  appId: string;
  evolutionId: string;
  sequence: number;
  previousHash: EvolutionReceipt["previousHash"];
  recordedAt: string;
  kind: EvolutionReceipt["kind"];
  actor: EvolutionReceipt["actor"];
  refs: EvolutionReceipt["refs"];
  payload: JsonObject;
}>;

export function buildEvolutionReceipt(
  input: NewEvolutionReceipt,
): EvolutionReceipt {
  const payloadHash = hashJson(input.payload);
  const content = {
    schemaVersion: "living.evolution-receipt/v1" as const,
    receiptId: `receipt.${input.evolutionId}.${input.sequence}`,
    appId: input.appId,
    evolutionId: input.evolutionId,
    sequence: input.sequence,
    previousHash: input.previousHash,
    recordedAt: input.recordedAt,
    kind: input.kind,
    actor: input.actor,
    refs: input.refs,
    payload: input.payload,
    payloadHash,
  };
  return evolutionReceiptSchema.parse({
    ...content,
    receiptHash: hashJson(content),
  });
}

export function verifyEvolutionReceiptChain(
  receipts: readonly EvolutionReceipt[],
  expected: Readonly<{ appId: string; evolutionId: string }>,
): readonly EvolutionReceipt[] {
  if (receipts.length === 0) {
    throw new SourceEvolutionError(
      "RECEIPT_CHAIN_INVALID",
      "The evolution receipt stream is empty",
    );
  }
  let previousHash: EvolutionReceipt["previousHash"] = null;
  return receipts.map((candidate, index) => {
    let receipt: EvolutionReceipt;
    try {
      receipt = evolutionReceiptSchema.parse(candidate);
    } catch (error) {
      throw new SourceEvolutionError(
        "RECEIPT_CHAIN_INVALID",
        `Receipt ${index} does not match the public evolution receipt schema`,
        { cause: error },
      );
    }
    const { receiptHash, ...content } = receipt;
    if (
      receipt.appId !== expected.appId ||
      receipt.evolutionId !== expected.evolutionId ||
      receipt.sequence !== index ||
      receipt.previousHash !== previousHash ||
      receipt.payloadHash !== hashJson(receipt.payload) ||
      receiptHash !== hashJson(content)
    ) {
      throw new SourceEvolutionError(
        "RECEIPT_CHAIN_INVALID",
        `Receipt ${index} failed identity, sequence, payload, or chain verification`,
      );
    }
    previousHash = receipt.receiptHash;
    return receipt;
  });
}

export function parseEvolutionReceiptStream(
  content: string,
  expected: Readonly<{ appId: string; evolutionId: string }>,
): readonly EvolutionReceipt[] {
  const lines = content.endsWith("\n")
    ? content.slice(0, -1).split("\n")
    : content.split("\n");
  if (lines.some((line) => line.length === 0)) {
    throw new SourceEvolutionError(
      "RECEIPT_CHAIN_INVALID",
      "The receipt stream contains a blank or partial record",
    );
  }
  let parsed: unknown[];
  try {
    parsed = lines.map((line) => JSON.parse(line));
  } catch (error) {
    throw new SourceEvolutionError(
      "RECEIPT_CHAIN_INVALID",
      "The receipt stream contains invalid JSON",
      { cause: error },
    );
  }
  return verifyEvolutionReceiptChain(
    parsed as EvolutionReceipt[],
    expected,
  );
}

export function serializeEvolutionReceipt(
  receipt: EvolutionReceipt,
): string {
  return `${canonicalJson(receipt)}\n`;
}
