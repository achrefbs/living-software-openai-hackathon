import Link from "next/link";
import { Icon } from "@/components/icons";
import { getStudioDataset } from "@/lib/studio-data";
import { studioAppHref } from "@/lib/studio-routes";

export default async function NotFound() {
  const appId = (await getStudioDataset()).app.id;
  return (
    <main className="standalone-state">
      <span className="surface-state-icon">
        <Icon name="map" />
      </span>
      <p className="eyebrow">Unknown application</p>
      <h1>Studio has no evidence for this application.</h1>
      <p>Return to the currently loaded, validated Studio dataset.</p>
      <Link className="button button-primary" href={studioAppHref(appId, "map")}>
        Open current dataset
      </Link>
    </main>
  );
}
