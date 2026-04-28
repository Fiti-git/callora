"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
      <p style={{ color: "#555", marginBottom: "1.25rem" }}>
        We hit an unexpected error. Our team has been notified. You can try again or return home.
      </p>
      {error.digest ? (
        <p style={{ color: "#888", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            background: "#DC0014",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid #ccc",
            borderRadius: 6,
            textDecoration: "none",
            color: "#333",
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
