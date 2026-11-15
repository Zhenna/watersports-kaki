// Deploy-time settings. The API address depends on where the page is served from.
const host = globalThis.location?.hostname;
const onThisMachine = host === "localhost" || host === "127.0.0.1";

export const CONFIG = {
  API_BASE: onThisMachine ? "http://127.0.0.1:8000" : "https://api.watersportskaki.sg",
  // Where "I'm interested" leads until in-app rooms exist.
  INTEREST_URL: "https://forms.gle/a8mwPQpaSkaex2w37",
};
