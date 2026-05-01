// TCPA-safe consent disclosure. Prepended to the assistant prompt before
// the call begins. Keep this short — Vapi opening lines that exceed ~25
// words tend to get cut by IVR systems.

const DISCLOSURE_TEMPLATE =
  "Hi, this is an automated assistant calling on behalf of {orgName}. " +
  "This call may be recorded for quality and training. " +
  "Press 9 or say 'stop' anytime to opt out.";

const SENTINEL = "[CALLORA_CONSENT_DISCLOSURE]";

export function injectConsentDisclosure(
  assistantPrompt: string,
  orgName: string
): string {
  const safeOrg =
    orgName && orgName.trim().length > 0 ? orgName.trim() : "our team";

  // Idempotent — if the prompt already contains our sentinel, leave it.
  if (assistantPrompt && assistantPrompt.includes(SENTINEL)) {
    return assistantPrompt;
  }

  const disclosure = DISCLOSURE_TEMPLATE.replace("{orgName}", safeOrg);

  return (
    `${SENTINEL}\nOPENING DISCLOSURE (must be spoken first, verbatim):\n` +
    `"${disclosure}"\n\n` +
    `--- ASSISTANT PROMPT BELOW ---\n` +
    (assistantPrompt ?? "")
  );
}
