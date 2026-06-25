const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const raw = JSON.parse(fs.readFileSync(path.join(repo, "challenge-place-extract.json"), "utf8"));

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function acronymMap(comp) {
  const map = {
    GST: "Golden Stars",
    GSF: "Golden Stars",
    FUT: "Future Stars",
    DYN: "Dynamo FC",
    MFM: "MFM",
    FC: "Fc Eagles",
    NOV: "Nova fc",
    NOVF: "Nova fc",
    WNT: "WINNERS Team",
    PHIF: "Philadelphia Fc",
    ALL: "All Stars",
    BAR: "Barnet FC",
    GROS: "Growing stars",
    STAR: "Starlight",
    OBC: "OBC"
  };
  (comp.competitors || []).forEach((team) => {
    if (team.acronym) map[String(team.acronym).toUpperCase()] = team.name;
    const name = String(team.name || "");
    if (/Fc Eagles/i.test(name)) map.FC = name;
    if (/Golden Stars/i.test(name)) map.GST = name;
    if (/Dynamo/i.test(name)) map.DYN = name;
    if (/Future/i.test(name)) map.FUT = name;
    if (/MFM/i.test(name)) map.MFM = name;
    if (/WINNERS/i.test(name)) map.WNT = name;
    if (/Nova/i.test(name)) { map.NOV = name; map.NOVF = name; }
    if (/Philadelphia/i.test(name)) map.PHIF = name;
    if (/All Stars/i.test(name)) map.ALL = name;
    if (/Barnet/i.test(name)) map.BAR = name;
    if (/Growing/i.test(name)) map.GROS = name;
    if (/Starlight/i.test(name)) map.STAR = name;
    if (/OBC/i.test(name)) map.OBC = name;
  });
  return map;
}

function teamName(code, map) {
  const rawName = map[String(code || "").toUpperCase()] || code;
  const cleaned = String(rawName || "")
    .replace(/\s+FC\s+No players$/i, "")
    .replace(/\s+No players$/i, "")
    .trim();
  if (/^OBC(?:\s+FC)?$/i.test(cleaned)) return "OBC";
  return cleaned;
}

function seasonFromName(name) {
  const m = String(name || "").match(/(20\d{2})(?:\D+(20\d{2}))?/);
  if (!m) return "Archive";
  return m[2] ? `${m[1]}/${m[2].slice(2)}` : m[1];
}

function parseMatchText(text, map) {
  const src = String(text || "").trim();
  let m = src.match(/^(.*?)\s+(\d+)\s+([A-Z][A-Z0-9]{1,5})\s+(\d+)\s+([A-Z][A-Z0-9]{1,5})$/);
  if (m) {
    return { date: m[1].trim(), home: teamName(m[3], map), away: teamName(m[5], map), hs: Number(m[2]), as: Number(m[4]), status: "played" };
  }
  m = src.match(/^(.*?)\s+([A-Z][A-Z0-9]{1,5})\s+([A-Z][A-Z0-9]{1,5})$/);
  if (m && !/\d+\s+--\s+\d+/.test(src)) {
    return { date: m[1].trim(), home: teamName(m[2], map), away: teamName(m[3], map), hs: null, as: null, status: "fixture" };
  }
  m = src.match(/^No date\s+([A-Z][A-Z0-9]{1,5})\s+([A-Z][A-Z0-9]{1,5})$/);
  if (m) {
    return { date: "No date", home: teamName(m[1], map), away: teamName(m[2], map), hs: null, as: null, status: "fixture" };
  }
  return { date: "", home: "", away: "", hs: null, as: null, status: /Win|Loss|--/.test(src) ? "walkover/raw" : "raw" };
}

function build() {
  const matches = [];
  raw.competitions.forEach((comp) => {
    const map = acronymMap(comp);
    (comp.matches || []).forEach((m, idx) => {
      const parsed = parseMatchText(m.text, map);
      matches.push({
        id: `${comp.href || comp.name}:${idx}`,
        competition: comp.category || comp.name,
        sourceCompetition: comp.name,
        season: seasonFromName(comp.name),
        gameweek: `GW${Math.floor(idx / 10) + 1}`,
        href: m.href,
        raw: m.text,
        ...parsed
      });
    });
  });
  return {
    extractedAt: new Date().toISOString(),
    competitions: uniq(matches.map((m) => m.competition)).sort(),
    seasons: uniq(matches.map((m) => m.season)).sort(),
    teams: uniq(matches.flatMap((m) => [m.home, m.away])).sort(),
    matches
  };
}

if (require.main === module) {
  const data = build();
  const js = "/* Generated from Challenge Place match extraction. */\n(function(){\n  window.LEGA_CHALLENGE_MATCH_DATA = "
    + JSON.stringify(data, null, 2) + ";\n})();\n";
  fs.writeFileSync(path.join(repo, "js", "challenge-place-match-data.js"), js);
  console.log(JSON.stringify({
    matches: data.matches.length,
    parsed: data.matches.filter((m) => m.home && m.away).length,
    played: data.matches.filter((m) => m.status === "played").length,
    fixtures: data.matches.filter((m) => m.status === "fixture").length,
    raw: data.matches.filter((m) => !m.home || !m.away).length
  }, null, 2));
}
