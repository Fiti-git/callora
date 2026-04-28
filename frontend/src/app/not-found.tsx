import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
      <p style={{ fontSize: "0.875rem", color: "#888", letterSpacing: "0.1em" }}>404</p>
      <h1 style={{ fontSize: "2rem", margin: "0.5rem 0 1rem" }}>Page not found</h1>
      <p style={{ color: "#555", marginBottom: "1.5rem" }}>
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "0.6rem 1.25rem",
          background: "#DC0014",
          color: "#fff",
          borderRadius: 6,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Back to Callora
      </Link>
    </div>
  );
}
