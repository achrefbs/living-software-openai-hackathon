import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Living Studio",
    template: "%s · Living Studio",
  },
  description:
    "A host-agnostic view of product structure, workflows, opportunities, and governed evolution.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
