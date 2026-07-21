import { assertLiveLocalRequest, noStoreJson } from "@/lib/live-http";
import { getLiveSession } from "@/lib/live-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    assertLiveLocalRequest(request, { mutation: false });
    const session = await getLiveSession();
    return noStoreJson(await session.view());
  } catch {
    return noStoreJson(
      { error: "Live state is unavailable" },
      500,
    );
  }
}
