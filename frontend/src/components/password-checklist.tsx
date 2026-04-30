"use client";

/**
 * PasswordChecklist — live-updating per-rule UI for the password complexity
 * policy enforced by the backend. Uses the same rule set as
 * `backend/src/lib/passwordPolicy.ts` so what shows green here matches what
 * the API will accept.
 */
export interface PasswordChecks {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  digit: boolean;
  special: boolean;
}

export function evaluatePassword(pw: string): PasswordChecks {
  return {
    minLength: pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

const RULES: { key: keyof PasswordChecks; label: string }[] = [
  { key: "minLength", label: "At least 8 characters" },
  { key: "uppercase", label: "One uppercase letter" },
  { key: "lowercase", label: "One lowercase letter" },
  { key: "digit", label: "One number" },
  { key: "special", label: "One special character" },
];

export default function PasswordChecklist({ password }: { password: string }) {
  const checks = evaluatePassword(password);
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 text-xs">
      {RULES.map((r) => {
        const ok = checks[r.key];
        return (
          <li
            key={r.key}
            className={
              "flex items-center gap-2 " +
              (ok
                ? "text-green-600 dark:text-green-400"
                : "text-gray-500 dark:text-gray-400")
            }
          >
            <span
              aria-hidden
              className={
                "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold " +
                (ok ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600")
              }
            >
              {ok ? "✓" : ""}
            </span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
