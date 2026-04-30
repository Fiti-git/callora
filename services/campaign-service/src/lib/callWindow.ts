/**
 * TCPA call-window helpers (Phase 2 Agent 9).
 *
 * Federal TCPA restricts non-emergency telemarketing calls to 8:00–21:00
 * LOCAL TIME for the called party. A handful of states (FL, LA, MA, MS)
 * tighten this to 8:00–20:00. Times here are "starting points" for
 * compliance, NOT legal advice — operations team should review per state.
 *
 * The CallWindowConfig table is the source of truth at runtime;
 * STATE_DEFAULTS is used by `ensureCallWindowDefaults()` to seed the table
 * idempotently at boot.
 */

export interface StateWindow {
  state: string;       // 2-letter code or "DEFAULT"
  allowedFrom: string; // "HH:MM"
  allowedTo: string;   // "HH:MM"
  timezone: string;    // IANA TZ
  source: "TCPA_DEFAULT" | "STATE_OVERRIDE";
}

// Map state → primary IANA timezone. Multi-tz states pick the most populous tz.
const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago",     AK: "America/Anchorage",   AZ: "America/Phoenix",
  AR: "America/Chicago",     CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York",    DE: "America/New_York",    DC: "America/New_York",
  FL: "America/New_York",    GA: "America/New_York",    HI: "Pacific/Honolulu",
  ID: "America/Boise",       IL: "America/Chicago",     IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",     KS: "America/Chicago",     KY: "America/New_York",
  LA: "America/Chicago",     ME: "America/New_York",    MD: "America/New_York",
  MA: "America/New_York",    MI: "America/Detroit",     MN: "America/Chicago",
  MS: "America/Chicago",     MO: "America/Chicago",     MT: "America/Denver",
  NE: "America/Chicago",     NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York",    NM: "America/Denver",      NY: "America/New_York",
  NC: "America/New_York",    ND: "America/Chicago",     OH: "America/New_York",
  OK: "America/Chicago",     OR: "America/Los_Angeles", PA: "America/New_York",
  RI: "America/New_York",    SC: "America/New_York",    SD: "America/Chicago",
  TN: "America/Chicago",     TX: "America/Chicago",     UT: "America/Denver",
  VT: "America/New_York",    VA: "America/New_York",    WA: "America/Los_Angeles",
  WV: "America/New_York",    WI: "America/Chicago",     WY: "America/Denver",
};

const STRICTER = new Set(["FL", "LA", "MA", "MS"]); // 8:00–20:00

export function buildStateDefaults(): StateWindow[] {
  const rows: StateWindow[] = [];
  for (const [state, tz] of Object.entries(STATE_TZ)) {
    const allowedTo = STRICTER.has(state) ? "20:00" : "21:00";
    rows.push({
      state,
      allowedFrom: "08:00",
      allowedTo,
      timezone: tz,
      source: STRICTER.has(state) ? "STATE_OVERRIDE" : "TCPA_DEFAULT",
    });
  }
  // Conservative federal fallback when state is unknown.
  rows.push({
    state: "DEFAULT",
    allowedFrom: "08:00",
    allowedTo: "21:00",
    timezone: "America/New_York",
    source: "TCPA_DEFAULT",
  });
  return rows;
}

const DEFAULTS_BY_STATE: Record<string, StateWindow> = Object.fromEntries(
  buildStateDefaults().map((r) => [r.state, r])
);

export function getStaticWindow(state: string | null | undefined): StateWindow {
  if (!state) return DEFAULTS_BY_STATE.DEFAULT;
  const up = state.toUpperCase();
  return DEFAULTS_BY_STATE[up] ?? DEFAULTS_BY_STATE.DEFAULT;
}

/**
 * Get HH and MM in the given IANA timezone for the supplied instant.
 * Uses Intl.DateTimeFormat — no third-party tz library needed.
 */
export function getLocalHM(tz: string, at: Date): { hour: number; minute: number; weekday: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hour, minute, weekday };
}

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

/**
 * Pure check: is `at` within [allowedFrom, allowedTo) in the state's local tz?
 * Uses STATE_DEFAULTS — runtime callers that want DB overrides should pass
 * the row through `isWithinAllowedWindowFor`.
 */
export function isWithinAllowedWindow(
  state: string | null | undefined,
  at: Date = new Date()
): boolean {
  const w = getStaticWindow(state);
  return isWithinAllowedWindowFor(w, at);
}

export function isWithinAllowedWindowFor(w: StateWindow, at: Date): boolean {
  const { hour, minute } = getLocalHM(w.timezone, at);
  const cur = hour * 60 + minute;
  const from = parseHM(w.allowedFrom);
  const to = parseHM(w.allowedTo);
  const fromMin = from.h * 60 + from.m;
  const toMin = to.h * 60 + to.m;
  return cur >= fromMin && cur < toMin;
}

/**
 * Compute the next allowed window start (a Date in UTC) for a given state.
 * If `at` is before today's window, returns today's start. Otherwise
 * tomorrow's start.
 */
export function nextAllowedWindow(
  state: string | null | undefined,
  at: Date = new Date()
): Date {
  const w = getStaticWindow(state);
  return nextAllowedWindowFor(w, at);
}

export function nextAllowedWindowFor(w: StateWindow, at: Date): Date {
  const { hour, minute } = getLocalHM(w.timezone, at);
  const cur = hour * 60 + minute;
  const from = parseHM(w.allowedFrom);
  const fromMin = from.h * 60 + from.m;

  // Compute today's window start in UTC. We approximate by taking `at`,
  // converting to local Y/M/D in tz, then constructing a UTC instant by
  // walking minutes from `at`. Walk loop bounded at 48 hours.
  const STEP_MS = 60_000;
  let cursor = new Date(at.getTime());
  if (cur < fromMin) {
    // Today might still work. Walk forward a minute at a time until inside window.
    for (let i = 0; i < 60 * 24; i++) {
      if (isWithinAllowedWindowFor(w, cursor)) return cursor;
      cursor = new Date(cursor.getTime() + STEP_MS);
    }
  }
  // Past today's window — walk forward up to 48h.
  for (let i = 0; i < 60 * 48; i++) {
    cursor = new Date(cursor.getTime() + STEP_MS);
    if (isWithinAllowedWindowFor(w, cursor)) return cursor;
  }
  // Pathological — should never hit. Return now + 8h as a safety net.
  return new Date(at.getTime() + 8 * 3600_000);
}

/**
 * North American area-code → state mapping. Best-effort; only covers area
 * codes assigned to a single state. Multi-state codes are intentionally
 * omitted (function returns null and the caller falls back to DEFAULT).
 */
const AREA_CODE_TO_STATE: Record<string, string> = {
  // AL
  "205": "AL", "251": "AL", "256": "AL", "334": "AL", "938": "AL",
  // AK
  "907": "AK",
  // AZ
  "480": "AZ", "520": "AZ", "602": "AZ", "623": "AZ", "928": "AZ",
  // AR
  "479": "AR", "501": "AR", "870": "AR",
  // CA (subset — CA has many codes)
  "209": "CA", "213": "CA", "310": "CA", "323": "CA", "408": "CA", "415": "CA",
  "510": "CA", "530": "CA", "559": "CA", "562": "CA", "619": "CA", "626": "CA",
  "650": "CA", "657": "CA", "661": "CA", "707": "CA", "714": "CA", "747": "CA",
  "760": "CA", "805": "CA", "818": "CA", "831": "CA", "858": "CA", "909": "CA",
  "916": "CA", "925": "CA", "949": "CA", "951": "CA",
  // CO
  "303": "CO", "719": "CO", "720": "CO", "970": "CO",
  // CT
  "203": "CT", "475": "CT", "860": "CT", "959": "CT",
  // DE
  "302": "DE",
  // DC
  "202": "DC",
  // FL
  "239": "FL", "305": "FL", "321": "FL", "352": "FL", "386": "FL", "407": "FL",
  "561": "FL", "727": "FL", "754": "FL", "772": "FL", "786": "FL", "813": "FL",
  "850": "FL", "863": "FL", "904": "FL", "941": "FL", "954": "FL",
  // GA
  "229": "GA", "404": "GA", "470": "GA", "478": "GA", "678": "GA", "706": "GA", "762": "GA", "770": "GA", "912": "GA",
  // HI
  "808": "HI",
  // ID
  "208": "ID", "986": "ID",
  // IL
  "217": "IL", "224": "IL", "309": "IL", "312": "IL", "331": "IL", "618": "IL",
  "630": "IL", "708": "IL", "773": "IL", "779": "IL", "815": "IL", "847": "IL", "872": "IL",
  // IN
  "219": "IN", "260": "IN", "317": "IN", "574": "IN", "765": "IN", "812": "IN", "930": "IN",
  // IA
  "319": "IA", "515": "IA", "563": "IA", "641": "IA", "712": "IA",
  // KS
  "316": "KS", "620": "KS", "785": "KS", "913": "KS",
  // KY
  "270": "KY", "364": "KY", "502": "KY", "606": "KY", "859": "KY",
  // LA
  "225": "LA", "318": "LA", "337": "LA", "504": "LA", "985": "LA",
  // ME
  "207": "ME",
  // MD
  "240": "MD", "301": "MD", "410": "MD", "443": "MD", "667": "MD",
  // MA
  "339": "MA", "351": "MA", "413": "MA", "508": "MA", "617": "MA", "774": "MA", "781": "MA", "857": "MA", "978": "MA",
  // MI
  "231": "MI", "248": "MI", "269": "MI", "313": "MI", "517": "MI", "586": "MI", "616": "MI", "734": "MI", "810": "MI", "906": "MI", "947": "MI", "989": "MI",
  // MN
  "218": "MN", "320": "MN", "507": "MN", "612": "MN", "651": "MN", "763": "MN", "952": "MN",
  // MS
  "228": "MS", "601": "MS", "662": "MS", "769": "MS",
  // MO
  "314": "MO", "417": "MO", "573": "MO", "636": "MO", "660": "MO", "816": "MO",
  // MT
  "406": "MT",
  // NE
  "308": "NE", "402": "NE", "531": "NE",
  // NV
  "702": "NV", "725": "NV", "775": "NV",
  // NH
  "603": "NH",
  // NJ
  "201": "NJ", "551": "NJ", "609": "NJ", "732": "NJ", "848": "NJ", "856": "NJ", "862": "NJ", "908": "NJ", "973": "NJ",
  // NM
  "505": "NM", "575": "NM",
  // NY
  "212": "NY", "315": "NY", "332": "NY", "347": "NY", "516": "NY", "518": "NY", "585": "NY", "607": "NY", "631": "NY", "646": "NY", "680": "NY", "716": "NY", "718": "NY", "838": "NY", "845": "NY", "914": "NY", "917": "NY", "929": "NY", "934": "NY",
  // NC
  "252": "NC", "336": "NC", "704": "NC", "743": "NC", "828": "NC", "910": "NC", "919": "NC", "980": "NC", "984": "NC",
  // ND
  "701": "ND",
  // OH
  "216": "OH", "220": "OH", "234": "OH", "330": "OH", "380": "OH", "419": "OH", "440": "OH", "513": "OH", "567": "OH", "614": "OH", "740": "OH", "937": "OH",
  // OK
  "405": "OK", "539": "OK", "580": "OK", "918": "OK",
  // OR
  "458": "OR", "503": "OR", "541": "OR", "971": "OR",
  // PA
  "215": "PA", "223": "PA", "267": "PA", "272": "PA", "412": "PA", "445": "PA", "484": "PA", "570": "PA", "610": "PA", "717": "PA", "724": "PA", "814": "PA", "878": "PA",
  // RI
  "401": "RI",
  // SC
  "803": "SC", "843": "SC", "854": "SC", "864": "SC",
  // SD
  "605": "SD",
  // TN
  "423": "TN", "615": "TN", "629": "TN", "731": "TN", "865": "TN", "901": "TN", "931": "TN",
  // TX (subset)
  "210": "TX", "214": "TX", "254": "TX", "281": "TX", "325": "TX", "346": "TX", "361": "TX", "409": "TX", "430": "TX", "432": "TX", "469": "TX", "512": "TX", "682": "TX", "713": "TX", "726": "TX", "737": "TX", "806": "TX", "817": "TX", "830": "TX", "832": "TX", "903": "TX", "915": "TX", "936": "TX", "940": "TX", "956": "TX", "972": "TX", "979": "TX",
  // UT
  "385": "UT", "435": "UT", "801": "UT",
  // VT
  "802": "VT",
  // VA
  "276": "VA", "434": "VA", "540": "VA", "571": "VA", "703": "VA", "757": "VA", "804": "VA",
  // WA
  "206": "WA", "253": "WA", "360": "WA", "425": "WA", "509": "WA", "564": "WA",
  // WV
  "304": "WV", "681": "WV",
  // WI
  "262": "WI", "414": "WI", "534": "WI", "608": "WI", "715": "WI", "920": "WI",
  // WY
  "307": "WY",
};

/**
 * Best-effort area-code → state lookup. Returns null when:
 *  - input is unparseable
 *  - the area code is multi-state (we don't guess)
 */
export function inferStateFromAreaCode(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  let area: string | null = null;
  if (digits.length === 10) area = digits.slice(0, 3);
  else if (digits.length === 11 && digits.startsWith("1")) area = digits.slice(1, 4);
  else if (digits.length > 10) area = digits.slice(-10, -7);
  if (!area) return null;
  return AREA_CODE_TO_STATE[area] ?? null;
}
