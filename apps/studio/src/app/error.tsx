"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="standalone-state">
      <span className="surface-state-icon">
        <Icon name="warning" />
      </span>
      <p className="eyebrow">Studio error</p>
      <h1>The interface could not be rendered.</h1>
      <p>No evidence or lifecycle state was changed.</p>
      <button className="button button-primary" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
