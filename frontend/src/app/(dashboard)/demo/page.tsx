d"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { startDemoCall, getDemoHistory } from "@/app/actions/demo";
import type { DemoCallResult, DemoCallLog } from "@/app/actions/demo";

const schema = z.object({
  phone: z.string().min(7, "Enter a valid phone number"),
  name: z.string().min(1, "Company or client name is required"),
  description: z.string().optional(),
  firstMessage: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type CallPhase = "idle" | "connecting" | "calling" | "analyzing" | "done" | "error";

const SENTIMENT_COLORS: Record<string, string> = {
  POSITIVE: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20",
  NEGATIVE: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20",
  NEUTRAL: "bg-gray-100 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "text-green-600 dark:text-green-400",
  NO_ANSWER: "text-yellow-600 dark:text-yellow-400",
  VOICEMAIL: "text-blue-600 dark:text-blue-400",
  FAILED: "text-red-600 dark:text-red-400",
};

const STATUS_BG: Record<string, string> = {
  COMPLETED: "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400",
  NO_ANSWER: "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  VOICEMAIL: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400",
  FAILED: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400",
};

const TIPS = [
  "Our AI qualifies leads 10x faster than human callers.",
  "Every call is analyzed for sentiment and interest level.",
  "Qualified leads are automatically flagged for follow-up.",
  "The AI adapts its pitch based on the prospect's responses.",
  "Call transcripts are saved for your review anytime.",
];

const STEPS: { key: CallPhase; label: string }[] = [
  { key: "connecting", label: "Connecting" },
  { key: "calling", label: "On Call" },
  { key: "analyzing", label: "Analyzing" },
  { key: "done", label: "Complete" },
];

function formatDuration(seconds: number) {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ScoreRing({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? "#22c55e" : score >= 4 ? "#eab308" : "#ef4444";
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="text-center z-10">
        <span className="text-xl font-bold text-gray-900 dark:text-white">{score}</span>
        <span className="text-gray-400 dark:text-gray-500 text-xs block leading-none">/10</span>
      </div>
    </div>
  );
}

function parseTranscript(transcript: string) {
  return transcript.split("\n").map((line, i) => {
    const lower = line.toLowerCase();
    const isAI = lower.startsWith("ai:") || lower.startsWith("assistant:") || lower.startsWith("agent:");
    const isHuman = lower.startsWith("human:") || lower.startsWith("user:") || lower.startsWith("prospect:") || lower.startsWith("customer:");
    return { line, isAI, isHuman, key: i };
  });
}

export default function DemoPage() {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [result, setResult] = useState<DemoCallResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<DemoCallLog[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getDemoHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (phase === "calling") {
      setElapsed(0);
      elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      tipRef.current = setInterval(() => setTipIndex((t) => (t + 1) % TIPS.length), 8000);
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (tipRef.current) clearInterval(tipRef.current);
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (tipRef.current) clearInterval(tipRef.current);
    };
  }, [phase]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    setPhase("connecting");
    setResult(null);
    setErrorMsg("");
    setShowTranscript(false);
    setElapsed(0);
    try {
      await delay(800);
      setPhase("calling");
      const res = await startDemoCall(data);
      setPhase("analyzing");
      await delay(600);
      setResult(res);
      setPhase("done");
      getDemoHistory().then(setHistory).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setErrorMsg(msg);
      setPhase("error");
    }
  }

  function copyTranscript() {
    if (result?.transcript) {
      navigator.clipboard.writeText(result.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const isRunning = phase === "connecting" || phase === "calling" || phase === "analyzing";
  const currentStepIndex = STEPS.findIndex((s) => s.key === phase);

  const inputCls = "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Demo Call</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Try the AI calling feature live — enter any phone number and watch it work.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-full px-3 py-1.5 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400 animate-pulse" />
          <span className="text-green-700 dark:text-green-400 text-xs font-medium">AI Ready</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Call Details</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                <input {...register("phone")} placeholder="+1 555 000 0000" className={inputCls} />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Company / Client Name <span className="text-red-500">*</span></label>
                <input {...register("name")} placeholder="Acme Corp" className={inputCls} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">About (optional)</label>
              <input {...register("description")} placeholder="e.g. Local restaurant, interested in digital marketing" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Custom Opening Line (optional)</label>
              <input {...register("firstMessage")} placeholder="Hi, is this from [Company Name]?" className={inputCls} />
              <p className="text-gray-400 dark:text-gray-600 text-xs mt-1">Leave blank to use the default greeting.</p>
            </div>

            <button
              type="submit"
              disabled={isRunning}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium text-sm py-3 rounded-lg transition-colors"
            >
              {isRunning ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {phase === "connecting" ? "Connecting..." : phase === "calling" ? "In Call..." : "Analyzing..."}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {phase === "done" ? "Start Another Call" : phase === "error" ? "Try Again" : "Start Demo Call"}
                </>
              )}
            </button>
          </form>

          {phase === "error" && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 flex gap-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-red-600 dark:text-red-400 text-sm">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Right: status / result / idle */}
        <div className="space-y-6">
          {(isRunning || phase === "done" || phase === "error") && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-5">Call Progress</h2>
              <div className="flex items-center">
                {STEPS.map((step, i) => {
                  const stepDone = phase === "done" || (currentStepIndex > i && phase !== "error");
                  const stepActive = currentStepIndex === i && phase !== "done" && phase !== "error";
                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                          stepDone ? "bg-green-500 border-green-500"
                            : stepActive ? "bg-blue-600 border-blue-500"
                            : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        }`}>
                          {stepDone ? (
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : stepActive ? (
                            <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{i + 1}</span>
                          )}
                        </div>
                        <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
                          stepDone ? "text-green-600 dark:text-green-400" : stepActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-600"
                        }`}>{step.label}</span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`h-0.5 flex-1 mb-5 mx-1 rounded transition-all duration-500 ${
                          currentStepIndex > i || phase === "done" ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {phase === "calling" && (
                <div className="mt-6 flex flex-col items-center py-4">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-full border-2 border-blue-400/30 animate-ping" />
                    <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-600/20 border-2 border-blue-200 dark:border-blue-500/40 flex items-center justify-center relative">
                      <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-gray-900 dark:text-white font-bold text-2xl tabular-nums">{formatDuration(elapsed)}</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-1 mb-5">Call in progress</p>
                  <div className="w-full bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 rounded-lg px-4 py-3 text-center min-h-[52px] flex items-center justify-center">
                    <p className="text-blue-600 dark:text-blue-300/80 text-xs italic">{TIPS[tipIndex]}</p>
                  </div>
                </div>
              )}

              {phase === "analyzing" && (
                <div className="mt-6 flex flex-col items-center py-4">
                  <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-purple-600 dark:text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <p className="text-gray-900 dark:text-white font-medium">Analyzing conversation...</p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">AI is evaluating interest level and sentiment</p>
                </div>
              )}
            </div>
          )}

          {result && phase === "done" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              {result.analysis.isQualified && (
                <div className="bg-green-50 dark:bg-green-500/10 border-b border-green-100 dark:border-green-500/20 px-6 py-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  <span className="text-green-700 dark:text-green-400 text-sm font-semibold">Qualified Lead Detected</span>
                </div>
              )}
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_BG[result.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                    {result.status.replace("_", " ")}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${SENTIMENT_COLORS[result.analysis.sentiment]}`}>
                    {result.analysis.sentiment}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 items-center">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-gray-500 dark:text-gray-500 text-xs mb-1">Duration</p>
                    <p className="text-gray-900 dark:text-white font-semibold text-sm">{formatDuration(result.durationSeconds)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex flex-col items-center">
                    <p className="text-gray-500 dark:text-gray-500 text-xs mb-2">Interest</p>
                    <ScoreRing score={result.analysis.interestScore} />
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-gray-500 dark:text-gray-500 text-xs mb-1">Cost</p>
                    <p className="text-gray-900 dark:text-white font-semibold text-sm">
                      {result.cost != null ? `$${result.cost.toFixed(4)}` : "—"}
                    </p>
                  </div>
                </div>

                {result.analysis.summary && (
                  <div className="border-l-2 border-blue-400 pl-4">
                    <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-1.5">Summary</p>
                    <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">{result.analysis.summary}</p>
                  </div>
                )}
                {result.analysis.nextSteps && (
                  <div className="border-l-2 border-purple-400 pl-4">
                    <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-1.5">Next Steps</p>
                    <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">{result.analysis.nextSteps}</p>
                  </div>
                )}

                {result.transcript && (
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <button onClick={() => setShowTranscript((v) => !v)} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-500 text-xs font-medium transition-colors">
                        <svg className={`w-3.5 h-3.5 transition-transform ${showTranscript ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        {showTranscript ? "Hide Transcript" : "View Full Transcript"}
                      </button>
                      {showTranscript && (
                        <button onClick={copyTranscript} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-colors">
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      )}
                    </div>
                    {showTranscript && (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 max-h-64 overflow-y-auto space-y-1.5">
                        {parseTranscript(result.transcript).map(({ line, isAI, isHuman, key }) => (
                          <div key={key} className={`text-xs leading-relaxed ${
                            isAI ? "text-blue-600 dark:text-blue-300" : isHuman ? "text-green-600 dark:text-green-300" : "text-gray-500 dark:text-gray-400"
                          }`}>{line}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === "idle" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">What happens?</h2>
              <div className="space-y-3">
                {[
                  { icon: "🔗", text: "Our AI connects and calls the number in seconds" },
                  { icon: "🗣️", text: "It introduces itself and qualifies the lead naturally" },
                  { icon: "🧠", text: "Gemini AI analyzes the conversation for intent and sentiment" },
                  { icon: "📋", text: "You get a full transcript and qualification summary" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Recent Demo Calls</h2>
        {historyLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        )}
        {!historyLoading && history !== null && history.length === 0 && (
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-6">No demo calls yet. Start one above!</p>
        )}
        {!historyLoading && history && history.length > 0 && (
          <div className="space-y-2">
            {history.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    log.status === "COMPLETED" ? "bg-green-50 dark:bg-green-500/10" : "bg-gray-100 dark:bg-gray-700"
                  }`}>
                    <svg className={`w-4 h-4 ${STATUS_COLORS[log.status] || "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-white text-sm font-medium">{log.lead.businessName}</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs">{log.lead.phone} · {formatDuration(log.duration)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-medium ${STATUS_COLORS[log.status] || "text-gray-400"}`}>{log.status.replace("_", " ")}</p>
                  <p className="text-gray-400 dark:text-gray-600 text-xs">{new Date(log.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
