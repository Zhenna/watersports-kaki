// What the page says to someone who has never tried a sport, instead of showing them conditions.
//
// Conditions on this page are for people who have done the sport before. A first-timer who sees a wind range
// could read it as "go". So at the "never tried" level the page shows this card: what to do first, the entry
// requirement for the sport, and a way to say you are interested. It makes no requests for conditions.
//
// No operator is named. The sign-up button opens your existing interest form.

export const NEVER_TRIED = "never_tried";
export const STARTER_LEVEL = "beginner";    // where "I've tried it before" takes you

// Entry requirements by sport slug, then level. Only add a line here once an instructor has agreed the wording.
// A sport that is not listed gets the general card with no requirement line, never an invented one.
// Set reviewed to true when an instructor has signed the wording, and the "Provisional" note goes away.
// lessons is a claim that lessons exist, and it names nobody. Only add it for a sport where that is true.
// It was given by the site owner on 17 Nov 2026 for windsurfing at East Coast. Without it the card says only that
// WSK doesn't list a beginner course yet, which is true for every sport.
export const ENTRY_REQUIREMENTS = {
  windsurf: {
    never_tried: {
      requirements: ["Hold a recognised windsurfing proficiency certificate."],
      reviewed: false,
      lessons: "Lessons are run by instructors at East Coast.",
      footerQuestion: "Already certified to try windsurfing?",
    },
  },
};

// "When would you prefer to learn?" Flexible means either works, so a flexible person counts toward both sessions.
export const WHEN_OPTIONS = [
  { slug: "weekend", label: "Weekend" },
  { slug: "weekday", label: "Weekday" },
  { slug: "flexible", label: "Flexible" },
];

// The learner form is a Google Form made for this card, set in config.js as
//   LEARNER_FORM: { url: "https://docs.google.com/forms/d/e/<id>/viewform",
//                   when: { param: "entry.1234567890", values: { weekend: "Weekend", weekday: "Weekday", flexible: "Flexible" } },
//                   sport: { param: "entry.2222222222" },     // optional: filled with the sport's name, for one form shared by every sport
//                   place: { param: "entry.3333333333" } }    // optional: filled with the spot's name
// The values must match the form's answer options exactly. Anything missing or odd means no choice is shown, because a
// choice that never reaches the form would mislead the visitor. Short forms.gle links are refused: they cannot carry an answer.
export function learnerForm(cfg) {
  try {
    if (!cfg || typeof cfg.url !== "string" || !cfg.when) return null;
    const u = new URL(cfg.url);
    if (u.protocol !== "https:" || u.hostname !== "docs.google.com" || !u.pathname.startsWith("/forms/")) return null;
    const { param, values } = cfg.when;
    if (typeof param !== "string" || !/^entry\.\d{3,}$/.test(param) || !values || typeof values !== "object") return null;
    // sport and place are optional, but if one is given it must be right. A half-set answer would quietly lose data.
    const extra = {};
    for (const key of ["sport", "place"]) {
      if (cfg[key] === undefined) { extra[key] = null; continue; }
      const p = cfg[key] && cfg[key].param;
      if (typeof p !== "string" || !/^entry\.\d{3,}$/.test(p)) return null;
      extra[key] = p;
    }
    const all = [param, extra.sport, extra.place].filter(Boolean);
    if (new Set(all).size !== all.length) return null;       // two questions cannot share one entry number
    const clean = {};
    for (const o of WHEN_OPTIONS) {
      const v = Object.prototype.hasOwnProperty.call(values, o.slug) ? values[o.slug] : null;
      if (typeof v !== "string" || v.length < 1 || v.length > 60 || /[\u0000-\u001f]/.test(v)) return null;
      clean[o.slug] = v;
    }
    return { url: u.toString(), param, values: clean, sportParam: extra.sport, placeParam: extra.place };
  } catch (e) {
    return null;
  }
}

// A sport or place name, trimmed, or null if it is empty, too long or odd.
export function cleanText(v) {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length >= 1 && t.length <= 80 && !/[\u0000-\u001f]/.test(t) ? t : null;
}

// Where the Register button goes. With a valid learner form, whatever the page knows is filled in for the visitor: the
// time they chose, and (if the form has those questions) the sport and place. With nothing to fill it opens the form
// as it is. With no learner form it opens fallbackUrl, as before.
export function interestLink(form, fallbackUrl, choice, fill = {}) {
  if (!form) return fallbackUrl;
  const u = new URL(form.url);
  let filled = false;
  if (typeof choice === "string" && Object.prototype.hasOwnProperty.call(form.values, choice)) {
    u.searchParams.set(form.param, form.values[choice]);
    filled = true;
  }
  const sport = form.sportParam ? cleanText(fill && fill.sport) : null;
  if (sport) { u.searchParams.set(form.sportParam, sport); filled = true; }
  const place = form.placeParam ? cleanText(fill && fill.place) : null;
  if (place) { u.searchParams.set(form.placeParam, place); filled = true; }
  if (filled) u.searchParams.set("usp", "pp_url");
  return u.toString();
}

// Which blocks of the page show at a level.
export function panesFor(level) {
  return level === NEVER_TRIED ? { conditions: false, entry: true } : { conditions: true, entry: false };
}

function cleanName(name) {
  const n = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return n || "this sport";
}

// "Windsurfing" reads better as "windsurfing" in a sentence. A name like "SUP / Paddleboarding" is left as it is.
function inline(name) {
  return /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
}

// How many people have registered, from config.js: INTEREST_COUNTS: { windsurf: { count: 12, asOf: "2026-11-17" } }.
// You set it by hand from your summary sheet. Nothing is shown unless it is a real whole number from 2 up with a valid
// date that is not in the future. Below that, or if anything is missing, the card says "Be one of the first".
export const MIN_COUNT_SHOWN = 2;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function countView(counts, sportSlug, nowMs) {
  try {
    if (!counts || typeof counts !== "object" || typeof sportSlug !== "string") return null;
    if (!Object.prototype.hasOwnProperty.call(counts, sportSlug)) return null;
    const e = counts[sportSlug];
    if (!e || typeof e.count !== "number" || !Number.isInteger(e.count) || e.count < MIN_COUNT_SHOWN || e.count > 1_000_000) return null;
    const m = typeof e.asOf === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.asOf) : null;
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = Date.UTC(y, mo - 1, d);
    const check = new Date(t);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;   // not a real date
    if (typeof nowMs !== "number" || t > nowMs + 24 * 3600e3) return null;                                        // not from the future
    return { number: e.count, asOf: `${d} ${MONTHS[mo - 1]} ${y}` };
  } catch (err) {
    return null;
  }
}

// The card for a sport and level, or null if the level is not "never tried".
export function entryCard({ sportSlug, sportName, level }) {
  if (level !== NEVER_TRIED) return null;
  const name = inline(cleanName(sportName));
  const entry = typeof sportSlug === "string" && Object.prototype.hasOwnProperty.call(ENTRY_REQUIREMENTS, sportSlug)
    ? ENTRY_REQUIREMENTS[sportSlug][level] : null;
  const requirements = entry ? entry.requirements.slice() : [];
  const group = "If you'd rather learn in a small group with other first-timers, tell us when suits you and we'll let you know if we organise a session.";
  return {
    chip: `New to ${name}?`,
    heading: `Learn ${name} together`,
    intro: entry && entry.lessons
      ? `${entry.lessons} ${group}`
      : `WSK doesn't list a beginner course here yet. ${group.replace("If you'd rather", "If you'd like to")}`,
    noCount: "Be one of the first to register your interest.",
    registeredLabel: "registered",
    registeredText: `have registered interest in a beginner ${name} session`,
    countNote: "Counts only, from our sign-up form.",
    whenLabel: "When would you prefer to learn?",
    whenHelp: "Flexible means either works for you.",
    cta: "I'm interested \u2192",
    note: "Interest only. Nothing is booked or paid. We never share your name or contact details without your say-so.",
    detailsTitle: "Before you go out on your own",
    requirements,
    provisionalNote: entry && entry.reviewed !== true ? "Provisional: not yet reviewed by an instructor." : "",
    footerQuestion: entry && entry.footerQuestion ? entry.footerQuestion : `Already tried ${name}?`,
    footerLink: "View conditions",
  };
}
