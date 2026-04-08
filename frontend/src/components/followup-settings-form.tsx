"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { updateFollowUpSettings } from "@/app/actions/campaign";

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  maxRetryAttempts: number;
  retryDelayHours: number;
  followUpDelayDays: number;
}

interface FollowUpSettingsFormProps {
  campaign: Campaign;
}

const inputCls = "w-20 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export function FollowUpSettingsForm({ campaign }: FollowUpSettingsFormProps) {
  const [maxRetry, setMaxRetry] = useState(campaign.maxRetryAttempts);
  const [retryDelay, setRetryDelay] = useState(campaign.retryDelayHours);
  const [followUpDelay, setFollowUpDelay] = useState(campaign.followUpDelayDays);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    maxRetry !== campaign.maxRetryAttempts ||
    retryDelay !== campaign.retryDelayHours ||
    followUpDelay !== campaign.followUpDelayDays;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateFollowUpSettings(campaign.id, {
        maxRetryAttempts: maxRetry,
        retryDelayHours: retryDelay,
        followUpDelayDays: followUpDelay,
      });
      setSaved(true);
      toast.success(`Saved settings for "${campaign.name}"`);
      setTimeout(() => setSaved(false), 2000);
    } catch (error: unknown) {
      toast.error("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setMaxRetry(campaign.maxRetryAttempts);
    setRetryDelay(campaign.retryDelayHours);
    setFollowUpDelay(campaign.followUpDelayDays);
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Campaign header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{campaign.name}</span>
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${
            campaign.type === "CSV"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30"
              : "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/30"
          }`}>
            {campaign.type === "CSV" ? "CSV Import" : "AI Leads"}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{campaign.status}</span>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleReset}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              saved
                ? "bg-green-600 text-white"
                : isDirty
                ? "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            }`}
          >
            {saving ? (
              <>
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : saved ? (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>

      {/* Settings fields */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
        {/* Max Retries */}
        <div className="px-6 py-5">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Max Retry Attempts
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            How many times to retry a no-answer or voicemail lead before stopping.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={10}
              value={maxRetry}
              onChange={(e) => setMaxRetry(Number(e.target.value))}
              className={inputCls}
            />
            <span className="text-sm text-gray-400 dark:text-gray-500">attempts</span>
          </div>
          {maxRetry === 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Set to 0 to disable retries entirely.</p>
          )}
        </div>

        {/* Retry Delay */}
        <div className="px-6 py-5">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Retry Delay
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Hours to wait before calling back a no-answer or voicemail lead.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={168}
              value={retryDelay}
              onChange={(e) => setRetryDelay(Number(e.target.value))}
              className={inputCls}
            />
            <span className="text-sm text-gray-400 dark:text-gray-500">
              {retryDelay === 1 ? "hour" : retryDelay < 24 ? `hours` : `hours (${(retryDelay / 24).toFixed(1)}d)`}
            </span>
          </div>
        </div>

        {/* Follow-Up Delay */}
        <div className="px-6 py-5">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Follow-Up Delay
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Days to wait before calling back a qualified (interested) lead.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={90}
              value={followUpDelay}
              onChange={(e) => setFollowUpDelay(Number(e.target.value))}
              className={inputCls}
            />
            <span className="text-sm text-gray-400 dark:text-gray-500">{followUpDelay === 1 ? "day" : "days"}</span>
          </div>
        </div>
      </div>

      {/* Visual summary */}
      <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          <span className="font-medium text-gray-500 dark:text-gray-400">Logic: </span>
          No answer → retry up to{" "}
          <span className="font-medium text-amber-600 dark:text-amber-400">{maxRetry}×</span>, every{" "}
          <span className="font-medium text-amber-600 dark:text-amber-400">{retryDelay}h</span>.
          {" "}Interested lead → follow-up after{" "}
          <span className="font-medium text-violet-600 dark:text-violet-400">{followUpDelay} day{followUpDelay !== 1 ? "s" : ""}</span>.
          {" "}Not interested → stop.
        </p>
      </div>
    </div>
  );
}
