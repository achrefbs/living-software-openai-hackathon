import type { Metadata } from "next";

import { LiveRunClient } from "./live-run-client";

export const metadata: Metadata = {
  title: "Live Run",
  description:
    "Observe evidence, model proposals, proof, receipts, and governed source evolution as validated live events.",
};

export default function LiveRunPage() {
  return <LiveRunClient />;
}
