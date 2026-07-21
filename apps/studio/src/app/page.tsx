import { redirect } from "next/navigation";
import { isLiveStudioMode } from "@/lib/live-config";
import { getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export default async function HomePage() {
  if (isLiveStudioMode()) {
    redirect("/live");
  }
  const dataset = await getStudioDataset();
  redirect(studioAppHref(dataset.app.id, "map"));
}
