import Image from "next/image";
import Link from "next/link";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Compliance", href: "/#compliance" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Redot Global", href: "https://redot.global", external: true },
      { label: "Careers", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "CASL Notice", href: "/privacy" },
      { label: "PDPA Notice", href: "/privacy" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "hello@callora.ai", href: "mailto:hello@callora.ai" },
      { label: "Vancouver · Singapore", href: "#" },
      { label: "Support", href: "/login" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="bg-[#1A1A1A] text-white py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8 pb-12 border-b border-white/10">
          <div className="max-w-sm">
            <Image
              src="https://ik.imagekit.io/z85ct1wzn/callora-logo-light.png"
              alt="Callora"
              width={140}
              height={40}
              className="h-8 w-auto mb-4"
            />
            <p className="text-sm text-white/60">
              AI-powered lead generation by Redot Global.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://www.linkedin.com"
              aria-label="LinkedIn"
              target="_blank"
              rel="noreferrer"
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v14H.22V8zm7.34 0h4.37v1.92h.06c.61-1.15 2.1-2.36 4.32-2.36 4.62 0 5.47 3.04 5.47 6.99V22h-4.56v-6.62c0-1.58-.03-3.6-2.19-3.6-2.19 0-2.53 1.71-2.53 3.49V22H7.56V8z" />
              </svg>
            </a>
            <a
              href="https://x.com"
              aria-label="X (Twitter)"
              target="_blank"
              rel="noreferrer"
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2H21l-6.51 7.44L22 22h-6.16l-4.83-6.32L5.4 22H2.64l6.96-7.96L2 2h6.32l4.36 5.78L18.24 2zm-1.08 18h1.7L7.93 4H6.12l11.04 16z" />
              </svg>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-12">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold mb-4">{col.title}</div>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {"external" in l && l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-white/60 hover:text-white transition-colors"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-white/60 hover:text-white transition-colors"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-white/50">
          <div>© {new Date().getFullYear()} Redot Global. All rights reserved.</div>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
