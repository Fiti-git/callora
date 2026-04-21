"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#compliance", label: "Compliance" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-[#F0F0F0]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="Callora home">
          <Image
            src="https://ik.imagekit.io/z85ct1wzn/callora-logo-dark.png"
            alt="Callora"
            width={140}
            height={40}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[#666] hover:text-[#1A1A1A] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-[#666] hover:text-[#1A1A1A] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="bg-[#DC0014] text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-[#b8000f] transition-colors"
          >
            Start Free Trial
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="md:hidden p-2 -mr-2 text-[#1A1A1A]"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-[#F0F0F0] bg-white">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm text-[#666] hover:text-[#1A1A1A] py-2"
              >
                {l.label}
              </a>
            ))}
            <div className="h-px bg-[#F0F0F0] my-1" />
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-sm text-[#666] py-2"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="bg-[#DC0014] text-white rounded-full px-5 py-2.5 text-sm font-semibold text-center hover:bg-[#b8000f]"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
