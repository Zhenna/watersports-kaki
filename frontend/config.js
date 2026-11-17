// Deploy-time settings. The API address depends on where the page is served from.
const host = globalThis.location?.hostname;
const onThisMachine = host === "localhost" || host === "127.0.0.1";

export const CONFIG = {
  API_BASE: onThisMachine ? "http://127.0.0.1:8000" : "https://api.watersportskaki.sg",
  // Where "I'm interested" leads until in-app rooms exist.
  INTEREST_URL: "https://forms.gle/a8mwPQpaSkaex2w37",
  // The form behind the "Never tried" card. The page fills in the sport, the place and the time the visitor picks.
  // Each entry number belongs to one question in the form. See docs/INTEREST_FORM.md.
  LEARNER_FORM: {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSd1ec2MIiWsiZHpd0LbylRj48aB1gGdJahSAXWNE82ykpnQQw/viewform",
    sport: { param: "entry.1617939969" },
    place: { param: "entry.1273714450" },
    when: {
      param: "entry.482057281",
      values: { weekend: "Weekend", weekday: "Weekday", flexible: "Flexible" },
    },
  },
};