"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "callora.cookieConsent.v1";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage blocked; render banner anyway
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, ts: Date.now() }));
    } catch {}
    setVisible(false);
  };

  const decline = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: false, ts: Date.now() }));
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-4"
    >
      <p className="text-sm text-gray-700 dark:text-gray-200">
        We use a small number of cookies to keep you signed in and to understand how Callora is used.
        See our{" "}
        <Link href="/privacy" className="underline text-blue-600 dark:text-blue-400">
          privacy policy
        </Link>
        .
      </p>
      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={decline}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Decline
        </button>
        <button
          onClick={accept}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-medium"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
