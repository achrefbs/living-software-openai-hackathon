import type { LiveEvent } from "@living-software/contracts";

import { assertLiveLocalRequest, noStoreJson } from "@/lib/live-http";
import { getLiveSession } from "@/lib/live-session";
import { parseLastEventId } from "@/lib/live-event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();

export function encodeLiveSseEvent(event: LiveEvent): Uint8Array {
  return encoder.encode(
    `id: ${event.sequence}\nevent: live-event\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export async function GET(request: Request): Promise<Response> {
  try {
    assertLiveLocalRequest(request, { mutation: false });
    const afterSequence = parseLastEventId(request.headers.get("last-event-id"));
    const session = await getLiveSession();
    let close: (() => void) | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let replaying = true;
        const pending: LiveEvent[] = [];
        const subscription = await session.subscribe(afterSequence, (event) => {
          if (replaying) pending.push(event);
          else if (!closed) controller.enqueue(encodeLiveSseEvent(event));
        });
        close = subscription.close;
        controller.enqueue(encoder.encode(": live stream connected\n\n"));
        for (const replay of subscription.replays) {
          for (const event of replay.events) {
            if (!closed) controller.enqueue(encodeLiveSseEvent(event));
          }
        }
        replaying = false;
        pending.sort((left, right) => left.sequence - right.sequence);
        for (const event of pending) {
          if (!closed) controller.enqueue(encodeLiveSseEvent(event));
        }
        request.signal.addEventListener("abort", () => {
          if (closed) return;
          closed = true;
          close?.();
          try {
            controller.close();
          } catch {
            // The network stream may already have been closed by the runtime.
          }
        }, { once: true });
      },
      cancel() {
        closed = true;
        close?.();
      },
    });
    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-store, must-revalidate",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return noStoreJson(
      { error: "Live stream request was rejected" },
      400,
    );
  }
}
