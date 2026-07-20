import { redirect } from "next/navigation";
import { getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export default async function HomePage() {
  const dataset = await getStudioDataset();
  redirect(studioAppHref(dataset.app.id, "map"));
}
