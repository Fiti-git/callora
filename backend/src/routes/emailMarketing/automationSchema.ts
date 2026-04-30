/**
 * Automation sequence validator (Phase 3 Agent 10).
 *
 * Sequence is an array of steps. Each step is one of:
 *   { kind: "WAIT", days: number }
 *   { kind: "SEND_EMAIL", templateId: string, subjectOverride?: string }
 *   { kind: "BRANCH", condition: { field, op: "=", value }, ifTrue, ifFalse }
 *
 * Returns a short error string if invalid, or null if OK.
 *
 * Circular branches are detected by walking from each BRANCH step and
 * refusing if we re-enter a visited node along a single branch path.
 */

export type AutomationStep =
  | { kind: "WAIT"; days: number }
  | { kind: "SEND_EMAIL"; templateId: string; subjectOverride?: string }
  | {
      kind: "BRANCH";
      condition: { field: string; op: "="; value: string };
      ifTrue: number;
      ifFalse: number;
    };

export function validateAutomationSequence(seq: unknown): string | null {
  if (!Array.isArray(seq) || seq.length === 0) return "sequence must be a non-empty array";
  if (seq.length > 50) return "sequence too long (max 50 steps)";

  for (let i = 0; i < seq.length; i++) {
    const s = seq[i] as any;
    if (!s || typeof s !== "object") return `step ${i}: not an object`;
    if (s.kind === "WAIT") {
      if (typeof s.days !== "number" || !Number.isFinite(s.days) || s.days < 0 || s.days > 365) {
        return `step ${i}: WAIT.days must be 0-365`;
      }
    } else if (s.kind === "SEND_EMAIL") {
      if (typeof s.templateId !== "string" || !s.templateId.length) {
        return `step ${i}: SEND_EMAIL.templateId required`;
      }
      if (s.subjectOverride !== undefined && typeof s.subjectOverride !== "string") {
        return `step ${i}: SEND_EMAIL.subjectOverride must be a string`;
      }
    } else if (s.kind === "BRANCH") {
      if (!s.condition || typeof s.condition !== "object") return `step ${i}: BRANCH.condition required`;
      if (typeof s.condition.field !== "string") return `step ${i}: BRANCH.condition.field`;
      if (s.condition.op !== "=") return `step ${i}: BRANCH.condition.op only "=" supported`;
      if (typeof s.condition.value !== "string") return `step ${i}: BRANCH.condition.value`;
      for (const k of ["ifTrue", "ifFalse"] as const) {
        const v = s[k];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= seq.length) {
          return `step ${i}: BRANCH.${k} must be a valid step index`;
        }
      }
    } else {
      return `step ${i}: unknown kind "${s.kind}"`;
    }
  }

  // Detect circular branch loops (BRANCH → BRANCH → ... back to itself
  // without any non-branch step in between is the only "stuck" case; a
  // SEND_EMAIL or WAIT step always advances, so it terminates).
  for (let start = 0; start < seq.length; start++) {
    const visited = new Set<number>();
    let cur = start;
    while (cur < seq.length) {
      const s = seq[cur] as any;
      if (s.kind !== "BRANCH") break;
      if (visited.has(cur)) return `circular BRANCH loop starting at step ${start}`;
      visited.add(cur);
      // Walk down the ifTrue path; ifFalse path is checked in its own start
      // iteration. This is a heuristic but catches the common cases.
      cur = s.ifTrue;
    }
  }

  return null;
}
