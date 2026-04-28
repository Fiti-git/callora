"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Application error</h1>
        <p style={{ color: "#555" }}>A critical error occurred. Please refresh or return to the homepage.</p>
        {error.digest ? <p style={{ color: "#888", fontSize: "0.875rem" }}>Ref: {error.digest}</p> : null}
        <p style={{ marginTop: "1rem" }}>
          <a href="/" style={{ color: "#DC0014" }}>Return home</a>
        </p>
      </body>
    </html>
  );
}
