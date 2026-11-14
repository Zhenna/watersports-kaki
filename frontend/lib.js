// Pure helpers: no DOM and no network, so they can be tested with `npm test`.

export const LEVELS = ["never_tried", "beginner", "intermediate", "advanced"];
export const LEVEL_LABELS = {
  never_tried: "Never tried",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const STATUS_LABELS = {
  flagged: "Flags raised",
  unavailable: "Assessment unavailable",
  outside_reference_range: "Outside WSK reference range",
  within_reference_range: "Within WSK reference range",
  wind_not_applicable: "Wind limits not applicable",
  not_published: "Awaiting instructor review",
};
// Unknown statuses fall back to "Assessment unavailable": never to something favourable.
const UNKNOWN_STATUS = STATUS_LABELS.unavailable;

export const SEVERITY_LABELS = {
  hazard: "Important",
  advise_against: "Advice",
  caution: "Caution",
  info: "Note",
};

export const DEFAULT_DISCLAIMER =
  "WSK shows weather data and reference ranges for information only. It is not safety advice " +
  "and does not replace official advisories or your operator's decisions.";

export const FAIL_CLOSED_NOTE = "Check official advisories and conditions on site.";

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                   "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function degreesToCardinal(deg) {
  if (typeof deg !== "number" || !Number.isFinite(deg)) return null;
  const d = ((deg % 360) + 360) % 360;
  return CARDINALS[Math.round(d / 22.5) % 16];
}

export function formatTimeSGT(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

export function agoText(min) {
  if (typeof min !== "number" || !Number.isFinite(min) || min < 0) return null;
  if (min < 1) return "just now";
  const m = Math.round(min);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min ago` : `${h} h ago`;
}

export function levelFromQuery(search) {
  const v = new URLSearchParams(search).get("level");
  return LEVELS.includes(v) ? v : "beginner";
}

export function isSafeHttpsUrl(u) {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

export function apiUrl(config, level) {
  const base = config.API_BASE.replace(/\/+$/, "");
  const q = new URLSearchParams({ activity: config.ACTIVITY, level });
  return `${base}/api/spots/${encodeURIComponent(config.SPOT_SLUG)}/conditions?${q}`;
}

export function errorMessage(kind, status) {
  if (kind === "http") {
    if (status === 404) return "This spot isn't available yet.";
    if (status === 422) return "That sport or level isn't supported at this spot.";
    return "Conditions are unavailable right now.";
  }
  if (kind === "timeout") return "Conditions took too long to load.";
  return "Couldn't reach the conditions service.";
}

function stationText(s) {
  if (!s) return null;
  const dist = s.distance_km != null ? `, ${s.distance_km} km away` : "";
  const how = s.selection === "mapped" ? "station mapped to this spot" : "nearest station reporting wind";
  return `${s.station_name || s.station_id}${dist} (${how})`;
}

function withAge(prefix, iso, ageMin) {
  const t = formatTimeSGT(iso);
  const ago = agoText(ageMin);
  if (!t && !ago) return null;
  return [t ? `${prefix} ${t} SGT` : prefix, ago].filter(Boolean).join(", ");
}

function titleCase(s) {
  return String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// Turn the API payload into plain strings and flags for the page to display.
export function buildView(p) {
  const wind = p?.observations?.wind ?? null;
  const li = p?.observations?.lightning ?? null;
  const g = p?.guidance ?? {};

  let windView = null;
  if (wind) {
    const card = degreesToCardinal(wind.from_deg);
    windView = {
      knots: `${Number(wind.knots).toFixed(1)} kn`,
      kmh: `${Number(wind.kmh).toFixed(1)} km/h`,
      direction: card ? `from ${card} (${Math.round(wind.from_deg)}°)` : "Direction unavailable",
      station: stationText(wind.station),
      observed: withAge("Observed", wind.observed_at, wind.age_min),
      stale: wind.stale !== false,  // anything but an explicit false is treated as stale
      note: wind.note || null,
    };
  }

  let lightningView = null;
  if (li) {
    const n = li.strikes_within_radius ?? 0;
    const near = li.nearest_km != null ? ` Nearest strike observed: ${li.nearest_km} km away.` : "";
    lightningView = {
      headline: n > 0
        ? "Lightning detected nearby"
        : `No strikes observed within ${li.radius_km} km in the last ${li.lookback_min} min`,
      detail: n > 0
        ? `${n} strike${n === 1 ? "" : "s"} within ${li.radius_km} km in the last ${li.lookback_min} minutes.${near}`
        : `This is not an all-clear. Data may be delayed.${near}`,
      checked: withAge("Checked", li.fetched_at, li.age_min),
      stale: li.stale !== false,
    };
  }

  const status = g.status;
  return {
    spotName: p?.spot?.name ?? "",
    activityLabel: titleCase(p?.activity),
    levelLabel: LEVEL_LABELS[p?.level] ?? titleCase(p?.level),
    updated: formatTimeSGT(p?.generated_at),
    wind: windView,
    windMessage: windView ? null : "Wind data unavailable.",
    lightning: lightningView,
    lightningMessage: lightningView ? null : "Lightning data unavailable. Check official advisories.",
    guidance: {
      status: status || "unavailable",
      statusLabel: STATUS_LABELS[status] ?? UNKNOWN_STATUS,
      summary: g.summary || "Assessment unavailable.",
      flags: (g.flags || []).map((f) => ({
        severity: f.severity,
        label: SEVERITY_LABELS[f.severity] ?? "Note",
        message: f.message,
      })),
    },
    sources: Array.isArray(p?.sources) ? p.sources : [],
    advisories: (p?.official_advisories || []).filter((a) => isSafeHttpsUrl(a.url)),
    disclaimer: p?.disclaimer || DEFAULT_DISCLAIMER,
  };
}
