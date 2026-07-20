import { redirect } from "next/navigation";
import { studioAppHref } from "@/lib/studio-routes";

export default async function AppIndex({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  redirect(studioAppHref(appId, "map"));
}
