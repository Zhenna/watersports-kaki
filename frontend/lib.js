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
  inconclusive: "Inconclusive: nearby stations disagree",
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

// The standard Beaufort names, in whole knots. A plain description of the wind itself.
const BEAUFORT = [[1, "Calm"], [4, "Light air"], [7, "Light breeze"], [11, "Gentle breeze"],
                  [17, "Moderate breeze"], [22, "Fresh breeze"], [28, "Strong breeze"],
                  [34, "Near gale"], [41, "Gale"], [48, "Strong gale"], [56, "Storm"],
                  [64, "Violent storm"]];

export function beaufortName(knots) {
  if (typeof knots !== "number" || !Number.isFinite(knots) || knots < 0) return null;
  const k = Math.round(knots);
  for (const [limit, name] of BEAUFORT) if (k < limit) return name;
  return "Hurricane force";
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

function base(config) {
  return config.API_BASE.replace(/\/+$/, "");
}

export function catalogActivitiesUrl(config) {
  return `${base(config)}/api/catalog/activities`;
}

export function catalogSpotsUrl(config, activity) {
  return `${base(config)}/api/catalog/spots?${new URLSearchParams({ activity })}`;
}

export function conditionsUrl(config, { spot, activity, level }) {
  const q = new URLSearchParams({ activity, level });
  return `${base(config)}/api/spots/${encodeURIComponent(spot)}/conditions?${q}`;
}

export function selectionFromQuery(search) {
  const q = new URLSearchParams(search);
  return { activity: q.get("activity"), spot: q.get("spot"), level: levelFromQuery(search) };
}

// Use the wanted option if it exists, otherwise the first one. Never invent a value.
export function pickOption(options, wantedSlug) {
  if (!Array.isArray(options) || options.length === 0) return null;
  return options.find((o) => o.slug === wantedSlug) ?? options[0];
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

// Shown elsewhere (the lightning alert, the limits line), so not repeated as flags.
const HIDDEN_FLAG_CODES = new Set([
  "lightning_observed", "no_strikes_observed",
  "gusts_not_available", "direction_not_assessed", "wind_direction_unavailable",
  "rules_unreviewed",
]);

const ASSESSED_STATUSES = new Set(["within", "outside", "inconclusive"]);

export function pillLabel(g) {
  if (g.status === "not_published") return STATUS_LABELS.not_published;
  const range = g.review_status === "unreviewed" ? "provisional range" : "WSK reference range";
  const partial = !(g.scope?.direction && g.scope?.gusts);
  switch (g.wind_status) {
    case "within": return partial ? `Wind speed only: within ${range}` : `Within ${range}`;
    case "outside": return `Outside ${range}`;
    case "inconclusive": return STATUS_LABELS.inconclusive;
    case "not_applicable": return STATUS_LABELS.wind_not_applicable;
    case "unavailable": return STATUS_LABELS.unavailable;
    default: return STATUS_LABELS[g.status] ?? UNKNOWN_STATUS;  // older API responses
  }
}

export function notAssessed(g) {
  if (!ASSESSED_STATUSES.has(g.wind_status)) return [];
  const out = [];
  if (!g.scope?.gusts) out.push("gusts");
  if (!g.scope?.direction) out.push("wind direction relative to the shore");
  return out;
}

function provisional(text, g) {
  return g.review_status === "unreviewed" ? text.replace(/WSK reference range/g, "provisional reference range") : text;
}

function guidanceSummary(g) {
  if (g.status === "not_published") return g.summary || "Awaiting instructor review.";
  switch (g.wind_status) {
    case "within":
    case "outside":
    case "inconclusive": return provisional(g.wind_summary || g.summary || "Assessment unavailable.", g);
    case "not_applicable": return "Wind limits are not part of this activity's assessment.";
    case "unavailable": {
      const why = (g.wind_reasons || []).join("; ");
      return `Wind assessment unavailable${why ? `: ${why}` : ""}. ${FAIL_CLOSED_NOTE}`;
    }
    default: return g.summary || "Assessment unavailable.";
  }
}

// One alert, shown once, at the top. Lightning data that is missing or old is also an alert.
export function buildAlert(li) {
  if (!li) {
    return { kind: "unavailable", title: "Lightning data unavailable", text: "Check official advisories before going out." };
  }
  if (li.stale !== false) {
    return { kind: "unavailable", title: "Lightning data is out of date", text: "Check official advisories before going out." };
  }
  const n = li.strikes_within_radius ?? 0;
  if (n > 0) {
    const near = li.nearest_km != null ? ` Nearest strike: ${li.nearest_km} km away.` : "";
    return {
      kind: "lightning",
      title: "Lightning detected nearby",
      text: `${n} strike${n === 1 ? "" : "s"} within ${li.radius_km} km in the last ${li.lookback_min} minutes.${near} ` +
            "Follow official advisories and your operator's procedures.",
    };
  }
  return null;
}

function withAge(prefix, iso, ageMin) {
  const t = formatTimeSGT(iso);
  const ago = agoText(ageMin);
  if (!t && !ago) return null;
  return [t ? `${prefix} ${t} SGT` : prefix, ago].filter(Boolean).join(", ");
}

const kn = (x) => Number(x).toFixed(1);

function stationLine(r) {
  const name = r.station_name || r.station_id || "Station";
  const dist = r.distance_km != null ? `, ${r.distance_km} km away` : "";
  const mapped = r.selection === "mapped" ? ", mapped to this spot" : "";
  return `${name}${dist}: ${kn(r.knots)} kn (${kn(r.kmh)} km/h)${mapped}`;
}

function windHeadline(wind) {
  const lo = beaufortName(wind.knots_min ?? wind.knots);
  const hi = beaufortName(wind.knots_max ?? wind.knots);
  if (!lo) return null;
  return lo === hi ? lo : `${lo} to ${hi.toLowerCase()}`;
}

function limitationsText(p, g) {
  const parts = [];
  const rs = p?.observations?.wind?.readings || [];
  const ds = rs.map((r) => r.distance_km).filter((d) => d != null);
  if (rs.length === 1) {
    parts.push(ds.length ? `Based on wind readings from a station ${ds[0]} km away.`
                         : "Based on wind readings from a nearby station.");
  } else if (rs.length > 1) {
    parts.push(ds.length
      ? `Based on wind readings from ${rs.length} nearby stations, ${Math.min(...ds)} to ${Math.max(...ds)} km away.`
      : `Based on wind readings from ${rs.length} nearby stations.`);
  }
  const na = notAssessed(g);
  if (na.length) {
    const list = na.join(" and ");
    parts.push(`${list.charAt(0).toUpperCase()}${list.slice(1)} ${na.length === 1 ? "is" : "are"} not assessed.`);
  }
  if (g.review_status === "unreviewed" && g.status !== "not_published") parts.push("Reference ranges are provisional.");
  return parts.length ? parts.join(" ") : null;
}

// ---------- planner: upcoming weekend days and AM or PM ----------
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// AM and PM only, so a small number of people are not spread across many time cells.
export const SLOTS = [{ key: "AM", sub: "Morning" }, { key: "PM", sub: "Afternoon" }];

// The next weekend days after today, by the Singapore calendar date.
export function upcomingWeekendDays(now = new Date(), count = 4) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const y = get("year"), m = get("month"), d = get("day");
  const out = [];
  for (let i = 1; out.length < count && i <= 30; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const wd = dt.getUTCDay();
    if (wd === 6 || wd === 0) {
      out.push({
        iso: dt.toISOString().slice(0, 10),
        short: DAY_NAMES[wd],
        label: `${DAY_NAMES[wd]}, ${dt.getUTCDate()} ${MONTH_NAMES[dt.getUTCMonth()]}`,
      });
    }
  }
  return out;
}

export function planSummary(day, slotKey) {
  return day ? `${day.label} \u00b7 ${slotKey}` : "";
}

// The early-access form lists availability as "Sat AM", "Sat PM", "Sun AM", "Sun PM".
export function formHint(day, slotKey) {
  return day ? `In the form, tick ${day.short} ${slotKey}.` : "";
}

function lightningCard(li) {
  const a = buildAlert(li);
  if (a && a.kind === "lightning") {
    return { kind: "alert", pill: a.title, text: a.text, checked: withAge("Checked", li.fetched_at, li.age_min) };
  }
  if (a) return { kind: "unavailable", pill: a.title, text: a.text, checked: null };
  const near = li.nearest_km != null ? ` Nearest strike observed: ${li.nearest_km} km away.` : "";
  return {
    kind: "quiet",
    pill: "No strikes observed nearby",
    text: `No strikes observed within ${li.radius_km} km in the last ${li.lookback_min} minutes. ` +
          `This is not an all-clear. Data may be delayed.${near}`,
    checked: withAge("Checked", li.fetched_at, li.age_min),
  };
}

// Turn the API payload into plain strings and flags for the page to display.
export function buildView(p) {
  const wind = p?.observations?.wind ?? null;
  const li = p?.observations?.lightning ?? null;
  const g = p?.guidance ?? {};

  let windView = null;
  if (wind) {
    const readings = wind.readings?.length
      ? wind.readings
      : [{ station_name: wind.station?.station_name, distance_km: wind.station?.distance_km,
           selection: wind.station?.selection, kmh: wind.kmh, knots: wind.knots }];
    const multi = readings.length > 1;
    const card = degreesToCardinal(wind.from_deg);
    const ds = readings.map((r) => r.distance_km).filter((d) => d != null);
    windView = {
      big: multi ? `${kn(wind.knots_min)} to ${kn(wind.knots_max)} kn` : `${kn(wind.knots)} kn`,
      sub: multi ? `${kn(wind.kmh_min)} to ${kn(wind.kmh_max)} km/h` : `${kn(wind.kmh)} km/h`,
      directionShort: card ? `From ${card} \u00b7 ${Math.round(wind.from_deg)}\u00b0` : "Direction unavailable",
      source: multi ? `${readings.length} nearby stations` : (readings[0].station_name || "Nearby station"),
      sourceSub: ds.length
        ? (multi ? `${Math.min(...ds)} to ${Math.max(...ds)} km from spot` : `${ds[0]} km from spot`)
        : "Distance unknown",
      stations: readings.map(stationLine),
      observed: withAge("Observed", wind.observed_at, wind.age_min),
      stale: wind.stale !== false,  // anything but an explicit false is treated as stale
      note: wind.note || null,
    };
  }

  return {
    spotName: p?.spot?.name ?? "",
    levelLabel: LEVEL_LABELS[p?.level] ?? String(p?.level || ""),
    updated: formatTimeSGT(p?.generated_at),
    headline: wind ? windHeadline(wind) : null,
    wind: windView,
    windMessage: windView ? null : (p?.observations?.wind_message || "Wind data unavailable."),
    lightningCard: lightningCard(li),
    guidance: {
      status: g.status || "unavailable",
      statusLabel: pillLabel(g),
      summary: guidanceSummary(g),
      limitations: limitationsText(p, g),
      flags: (g.flags || [])
        .filter((f) => !HIDDEN_FLAG_CODES.has(f.code))
        .map((f) => ({
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
