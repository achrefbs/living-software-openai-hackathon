import { parseLiveCommandEnvelope } from "@living-software/contracts";

import {
  assertLiveLocalRequest,
  noStoreJson,
  readBoundedJson,
} from "@/lib/live-http";
import { getLiveSession } from "@/lib/live-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_COMMAND_BYTES = 8 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    assertLiveLocalRequest(request, { mutation: true });
    const command = parseLiveCommandEnvelope(
      await readBoundedJson(request, MAX_COMMAND_BYTES),
    );
    const session = await getLiveSession();
    const result = await session.command(command);
    return noStoreJson(result, result.accepted ? 202 : 409);
  } catch {
    return noStoreJson(
      {
        schemaVersion: "living.live-command-result/v1",
        commandId: "invalid-command",
        accepted: false,
        revision: 0,
        error: {
          code: "invalid-command",
          message: "Live command request was rejected",
        },
      },
      400,
    );
  }
}
