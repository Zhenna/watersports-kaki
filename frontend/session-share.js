// The invitation behind "Create a session": the link, the message, and the WhatsApp address. Pure, so it can be tested.
//
// Nothing is stored. The message carries the day, the time and a link, and nothing that goes stale: no wind or tide
// numbers, no verdict. The link carries the sport, the place, the day and the time, and never the sender's skill level.

export const SITE_APP_URL = "https://www.watersportskaki.sg/app/";
export const OG_IMAGE_URL = "https://www.watersportskaki.sg/app/og-image.png";
// What WhatsApp shows for any link to the app. These are also the page's Open Graph tags, and a test keeps them in step.
export const OG_TITLE = "WaterSports Kaki: check conditions";
export const OG_DESCRIPTION = "Forecast, wind and tide for watersports in Singapore.";

export const SLOT_CHOICES = [
  { key: "am", label: "AM", words: "morning" },
  { key: "pm", label: "PM", words: "afternoon" },
  { key: "both", label: "AM and PM", words: "morning and afternoon" },
];
const SLOT_KEYS = new Set(SLOT_CHOICES.map((s) => s.key));
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// What the person is invited to be able to do. A sport with no entry here gets the general wording.
const CAN_ALREADY = { windsurf: "windsurf" };

function isRealDate(iso) {
  const m = typeof iso === "string" ? ISO.exec(iso) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

// The day and time a shared link asks the page to open on. Anything not recognised is ignored.
export function inviteFromQuery(search) {
  const q = new URLSearchParams(search);
  const day = q.get("day");
  const slot = q.get("slot");
  return { day: isRealDate(day) ? day : null, slot: SLOT_KEYS.has(slot) ? slot : null };
}

export function inviteLink({ activity, spot, day, slot }) {
  const u = new URL(SITE_APP_URL);
  if (typeof activity === "string" && SLUG.test(activity)) u.searchParams.set("activity", activity);
  if (typeof spot === "string" && SLUG.test(spot)) u.searchParams.set("spot", spot);
  u.searchParams.set("tab", "plan");
  if (isRealDate(day)) u.searchParams.set("day", day);
  if (SLOT_KEYS.has(slot)) u.searchParams.set("slot", slot);
  return u.toString();
}

function words(slot) {
  const s = SLOT_CHOICES.find((x) => x.key === slot);
  return s ? s.words : null;
}

// thundery: { am: bool, pm: bool }, from the forecast. Only the periods the invitation covers are mentioned.
export function inviteMessage({ sportName, sportSlug, spotName, dayShort, slot, thundery = {}, link }) {
  const when = words(slot);
  if (!when || !sportName || !spotName || !dayShort || !link) return null;
  const covered = slot === "both" ? ["am", "pm"] : [slot];
  const wet = covered.filter((k) => thundery && thundery[k]).map((k) => words(k));
  const can = Object.prototype.hasOwnProperty.call(CAN_ALREADY, sportSlug) ? `can already ${CAN_ALREADY[sportSlug]}` : "have done this before";
  return [
    `${sportName} at ${spotName}, ${dayShort}, ${when}.`,
    wet.length ? `Thundery showers are forecast for the ${wet.join(" and ")}.` : null,
    `Who's in? For people who ${can}.`,
    `Check the latest forecast and tide before you go: ${link}`,
  ].filter(Boolean).join(" ");
}

// Opens WhatsApp with the message ready. The person picks the chat. No phone number is involved.
export function waShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
