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
  outside_reference_range: "Outside reference range",
  within_reference_range: "Within reference range",
  inconclusive: "Wind varies across stations",
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

export function forecastUrl(config, { spot, activity, level }) {
  const q = new URLSearchParams({ activity, level });
  return `${base(config)}/api/spots/${encodeURIComponent(spot)}/forecast?${q}`;
}

export function selectionFromQuery(search) {
  const q = new URLSearchParams(search);
  return {
    activity: q.get("activity"),
    spot: q.get("spot"),
    level: levelFromQuery(search),
    tab: q.get("tab") === "plan" ? "plan" : "now",
  };
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
  const range = g.review_status === "unreviewed" ? "provisional range" : "reference range";
  switch (g.wind_status) {
    case "within": return `Within ${range}`;
    case "outside":
      return g.wind_position === "below" ? `Below ${range}`
           : g.wind_position === "above" ? `Above ${range}`
           : `Outside ${range}`;
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

// A short line, only where the pill and the figures do not already say it.
function guidanceSummary(g) {
  if (g.status === "not_published") return "Guidance awaits instructor review.";
  switch (g.wind_status) {
    case "within":
    case "outside": return null;
    case "inconclusive": return "Nearby stations fall on both sides of the range.";
    case "not_applicable": return "Wind limits do not apply to this activity.";
    case "unavailable": {
      const why = (g.wind_reasons || []).join("; ");
      return `Wind assessment unavailable${why ? `: ${why}` : ""}. ${FAIL_CLOSED_NOTE}`;
    }
    default: return g.summary || "Assessment unavailable.";
  }
}

// The full sentence, kept for "View observation details".
function guidanceDetail(g) {
  if (!ASSESSED_STATUSES.has(g.wind_status)) return null;
  return provisional(g.wind_summary || g.summary || "", g) || null;
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
    const near = li.nearest_km != null ? ` Nearest: ${li.nearest_km} km.` : "";
    return {
      kind: "lightning",
      title: "Lightning detected nearby",
      text: `${n} strike${n === 1 ? "" : "s"} within ${li.radius_km} km in the last ${li.lookback_min} min.${near} ` +
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
  const card = degreesToCardinal(r.direction_deg);
  const from = card ? `, from ${card}` : "";
  const mapped = r.selection === "mapped" ? ", mapped to this spot" : "";
  return `${name}${dist}: ${kn(r.knots)} kn (${kn(r.kmh)} km/h)${from}${mapped}`;
}

function windHeadline(wind) {
  const lo = beaufortName(wind.knots_min ?? wind.knots);
  const hi = beaufortName(wind.knots_max ?? wind.knots);
  if (!lo) return null;
  return lo === hi ? lo : `${lo} to ${hi.toLowerCase()}`;
}

// Station details are already in the "Source" figure, so this only says what was not covered.
function limitationsText(p, g) {
  const parts = [];
  const na = notAssessed(g);
  if (na.length === 2) parts.push("Wind speed only", "Gusts and shore-relative direction not assessed");
  else if (na[0] === "gusts") parts.push("Gusts not assessed");
  else if (na.length === 1) parts.push("Shore-relative direction not assessed");
  if (g.review_status === "unreviewed" && g.status !== "not_published") parts.push("Ranges provisional");
  return parts.length ? `${parts.join(". ")}.` : null;
}

// ---------- planner: upcoming weekend days and AM or PM ----------
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
                    "September", "October", "November", "December"];

// AM and PM only, so a small number of people are not spread across many time cells.
export const SLOTS = [{ key: "AM", sub: "Morning" }, { key: "PM", sub: "Afternoon" }];

// The next days after today, by the Singapore calendar date. NEA's outlook reaches 4 days ahead,
// so a rolling week lets people check the days a forecast exists for, and still see the weekend.
export function upcomingDays(now = new Date(), count = 7) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const y = get("year"), m = get("month"), d = get("day");
  const out = [];
  for (let i = 1; i <= count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const wd = dt.getUTCDay();
    out.push({
      iso: dt.toISOString().slice(0, 10),
      short: DAY_NAMES[wd],
      num: dt.getUTCDate(),
      weekend: wd === 6 || wd === 0,
      label: `${DAY_NAMES[wd]}, ${dt.getUTCDate()} ${MONTH_NAMES[dt.getUTCMonth()]}`,
      long: `${DAY_LONG[wd]}, ${dt.getUTCDate()} ${MONTH_LONG[dt.getUTCMonth()]}`,
    });
  }
  return out;
}

const asList = (x) => (Array.isArray(x) ? x : [x]);

export function planSummary(day, slotKeys) {
  return day ? `${day.long ?? day.label} \u00b7 ${asList(slotKeys).join(" and ")}` : "";
}

// The early-access form lists "Sat AM", "Sat PM", "Sun AM" and "Sun PM". There are no evening slots,
// and the form has no weekday times yet, so weekdays say so instead of pointing at an option.
export function formHint(day, slotKeys) {
  if (!day) return "";
  if (!day.weekend) return "Weekday times aren't in the form yet.";
  return `In the form, tick ${asList(slotKeys).map((k) => `${day.short} ${k}`).join(" and ")}.`;
}

// Lightning is real time only and has its own panel: a headline, one line, and details.
const LIGHTNING_SOURCE =
  "Source: NEA lightning observations via data.gov.sg. Each point is a detected strike, not a station.";

function lightningCard(li, spotName = "this spot") {
  const a = buildAlert(li);
  if (a && a.kind === "lightning") {
    const n = li.strikes_within_radius;
    const near = li.nearest_km != null ? ` \u00b7 nearest ${li.nearest_km} km` : "";
    return {
      kind: "alert",
      headline: a.title,
      pill: "Follow official advisories",
      line: `${n} strike${n === 1 ? "" : "s"} within ${li.radius_km} km of this spot${near}`,
      detail: [
        `${n} strike${n === 1 ? "" : "s"} within ${li.radius_km} km of ${spotName} in the last ${li.lookback_min} minutes.`,
        "Follow official advisories and your operator's procedures.",
        withAge("Checked", li.fetched_at, li.age_min),
        LIGHTNING_SOURCE,
      ].filter(Boolean),
    };
  }
  if (a) {
    return { kind: "unavailable", headline: a.title, pill: "Check official advisories", line: null, detail: [a.text] };
  }
  const checked = withAge("Checked", li.fetched_at, li.age_min);
  return {
    kind: "quiet",
    headline: "No strikes observed",
    pill: "Not an all-clear",
    line: `Within ${li.radius_km} km of this spot, last ${li.lookback_min} min`,
    detail: [
      `No strikes within ${li.radius_km} km of ${spotName} in the last ${li.lookback_min} minutes. This is not an all-clear.`,
      li.nearest_km != null ? `Nearest strike: ${li.nearest_km} km from the spot.` : null,
      checked ? `${checked}.` : null,
      "Lightning data can lag by a few minutes.",
      LIGHTNING_SOURCE,
    ].filter(Boolean),
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
    windLine: windView ? `${windView.big} \u00b7 ${windView.directionShort}` : null,
    wind: windView,
    windMessage: windView ? null : (p?.observations?.wind_message || "Wind data unavailable."),
    lightningCard: lightningCard(li, p?.spot?.name || "this spot"),
    guidance: {
      status: g.status || "unavailable",
      statusLabel: pillLabel(g),
      summary: guidanceSummary(g),
      detail: guidanceDetail(g),
      limitations: limitationsText(p, g),
      // The cross-shore note moves to the wind direction card when the API sends guidance.direction.
      // Without it (an older API), the note stays here so nothing is lost.
      flags: (g.flags || [])
        .filter((f) => !HIDDEN_FLAG_CODES.has(f.code))
        .filter((f) => !(f.code === "cross_shore_wind" && g.direction))
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

// The dates that have a forecast, so the date row can mark them.
export function forecastDates(payload) {
  return payload?.available === true ? new Set((payload.days || []).map((d) => d.date)) : new Set();
}

// The plan-ahead view for one chosen day and one or both of AM and PM, from the /forecast response.
// Thunder comes first, then wind. Lightning is not here: it is checked live, under Right now.
export function buildForecastView(payload, day, slotKeys) {
  if (!payload || payload.available !== true) {
    return { state: "none", message: "Forecast unavailable right now." };
  }
  if (!day) return { state: "none", message: "Choose a day." };
  const f = (payload.days || []).find((d) => d.date === day.iso);
  if (!f) {
    return {
      state: "none",
      message: `Forecast not yet available for ${day.label}. NEA's outlook covers the next ${payload.horizon_days ?? 4} days. ` +
               "You can still show interest in this day.",
    };
  }
  const g = f.guidance || {};
  const w = f.wind;
  const slots = asList(slotKeys).map((k) => ({
    name: SLOTS.find((x) => x.key === k)?.sub ?? k,
    text: f.slots?.[k]?.text ?? null,
    thundery: !!f.slots?.[k]?.thundery,
  }));
  const thunder = slots.filter((x) => x.thundery);
  const range = w
    ? (w.knots_low === w.knots_high ? `${kn(w.knots_low)} kn` : `${kn(w.knots_low)} to ${kn(w.knots_high)} kn`)
    : null;
  return {
    state: "ok",
    thunderNotice: thunder.length
      ? `Thundery showers forecast for the ${thunder.map((x) => x.name.toLowerCase()).join(" and ")}.`
      : null,
    weatherLines: slots.filter((x) => !x.thundery && x.text).map((x) => `${x.name}: ${x.text}`),
    headline: w ? windHeadline({ knots_min: w.knots_low, knots_max: w.knots_high }) : null,
    pill: g.wind_status === "inconclusive" ? "Spans the range" : pillLabel(g),
    windLine: range ? `${range}${w.direction ? ` \u00b7 From ${w.direction}` : ""}` : null,
    summary: g.wind_status === "inconclusive" ? null : guidanceSummary(g),
    small: [payload.note, limitationsText(null, g)].filter(Boolean).join(" "),
    stale: !!f.stale,
  };
}
