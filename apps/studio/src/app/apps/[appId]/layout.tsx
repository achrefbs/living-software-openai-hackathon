import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio-shell";
import { getStudioDataset } from "@/lib/studio-data";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const dataset = await getStudioDataset();

  if (dataset.app.id !== appId) {
    notFound();
  }

  return <StudioShell dataset={dataset}>{children}</StudioShell>;
}
