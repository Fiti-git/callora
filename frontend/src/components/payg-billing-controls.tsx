"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCredits,
  updateAutoRecharge,
  type CreditsSummary,
} from "@/app/actions/billing";
import { ConfirmationModal } from "@/components/confirmation-modal";

interface Props {
  credits: CreditsSummary;
}

/**
 * Phase 5 Agent M7 — interactive PAYG controls for the /billing page.
 *
 * Server component renders the read-only summary; this client island wraps
 * the "Add credits" CTA, the auto-recharge settings panel, and inline
 * error messages. All mutations go through Server Actions.
 */
export default function PaygBillingControls({ credits }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [showTopUpConfirm, setShowTopUpConfirm] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [enabled, setEnabled] = useState(credits.autoRechargeEnabled);
  const [thresholdDollars, setThresholdDollars] = useState(
    String(Math.round(credits.autoRechargeThresholdCents / 100))
  );
  const [amountDollars, setAmountDollars] = useState(
    String(Math.round(credits.autoRechargeAmountCents / 100))
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<string | null>(null);

  const handleTopUp = () => {
    setTopUpError(null);
    startTransition(async () => {
      const r = await addCredits(2500);
      if (!r.ok) {
        setTopUpError(r.error ?? "Top-up failed");
        return;
      }
      setShowTopUpConfirm(false);
      router.refresh();
    });
  };

  const handleSaveSettings = () => {
    setSettingsError(null);
    const tCents = Math.round(Number(thresholdDollars) * 100);
    const aCents = Math.round(Number(amountDollars) * 100);
    if (!Number.isFinite(tCents) || tCents < 500 || tCents > 10_000) {
      setSettingsError("Threshold must be between $5 and $100");
      return;
    }
    if (!Number.isFinite(aCents) || aCents < 2500 || aCents > 50_000) {
      setSettingsError("Top-up amount must be between $25 and $500");
      return;
    }
    startTransition(async () => {
      const r = await updateAutoRecharge({
        enabled,
        thresholdCents: tCents,
        amountCents: aCents,
      });
      if (!r.ok) {
        setSettingsError(r.error ?? "Update failed");
        return;
      }
      setSettingsSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    });
  };

  const autoRechargeLabel = credits.autoRechargeEnabled
    ? `Auto-recharge: ON ($${(credits.autoRechargeAmountCents / 100).toFixed(0)} when below $${(credits.autoRechargeThresholdCents / 100).toFixed(0)})`
    : "Auto-recharge: OFF";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={() => setShowTopUpConfirm(true)}
          disabled={pending || !credits.hasPaymentMethod}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded disabled:opacity-50"
          title={
            credits.hasPaymentMethod
              ? "Add $25 to your credit balance"
              : "Add a payment method first"
          }
        >
          Add $25
        </button>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="border border-slate-600 hover:border-slate-400 text-slate-200 px-4 py-2 rounded text-sm"
        >
          {autoRechargeLabel}
        </button>
        {!credits.hasPaymentMethod && (
          <span className="text-xs text-amber-400">
            No payment method on file. Add one from Onboarding to enable top-ups.
          </span>
        )}
      </div>

      {topUpError && (
        <p className="text-sm text-red-400">{topUpError}</p>
      )}

      {showSettings && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3 max-w-xl">
          <h3 className="text-lg font-semibold">Auto-recharge settings</h3>
          <p className="text-xs text-slate-400">
            When your balance drops below the threshold, we&apos;ll
            automatically charge your card for the top-up amount.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable auto-recharge
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 block">
              Threshold ($)
              <input
                type="number"
                min={5}
                max={100}
                value={thresholdDollars}
                onChange={(e) => setThresholdDollars(e.target.value)}
                disabled={!enabled}
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm disabled:opacity-50"
              />
            </label>
            <label className="text-xs text-slate-400 block">
              Top-up amount ($)
              <input
                type="number"
                min={25}
                max={500}
                step={5}
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                disabled={!enabled}
                className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm disabled:opacity-50"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save settings"}
          </button>
          {settingsError && <p className="text-sm text-red-400">{settingsError}</p>}
          {settingsSavedAt && (
            <p className="text-xs text-emerald-400">Saved at {settingsSavedAt}</p>
          )}
        </div>
      )}

      <ConfirmationModal
        isOpen={showTopUpConfirm}
        onClose={() => setShowTopUpConfirm(false)}
        onConfirm={handleTopUp}
        title="Add $25 in credits?"
        message="We'll charge your card on file $25.00 and credit your account immediately."
        confirmText={pending ? "Charging..." : "Charge $25"}
        isLoading={pending}
      />
    </div>
  );
}
