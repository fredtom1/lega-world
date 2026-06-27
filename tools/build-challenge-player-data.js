const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const raw = JSON.parse(fs.readFileSync(path.join(repo, "challenge-place-extract.json"), "utf8"));
const expanded = JSON.parse(fs.readFileSync(path.join(repo, "challenge-place-player-stats-expanded.json"), "utf8")).stats || [];
const original = JSON.parse(fs.readFileSync(path.join(repo, "challenge-place-player-stats.json"), "utf8")).stats || [];
const livePath = path.join(repo, "challenge-place-player-live.json");
const live = fs.existsSync(livePath) ? JSON.parse(fs.readFileSync(livePath, "utf8")) : null;

const sections = [
  "Top scorers", "Goals", "Assists", "Own goals", "Yellow cards", "Red cards",
  "Penalty goals", "Penalties made", "Penalties missed", "Dead ball situation goals",
  "Fouls", "Corner kicks", "Offsides", "Goals conceded"
];
const kindMap = {
  "Top scorers": "goals",
  "Goals": "goals",
  "Assists": "assists",
  "Own goals": "ownGoals",
  "Yellow cards": "yellowCards",
  "Red cards": "redCards",
  "Penalty goals": "penaltyGoals",
  "Penalties made": "penaltyGoals",
  "Penalties missed": "penaltiesMissed",
  "Dead ball situation goals": "deadBallGoals",
  "Fouls": "fouls",
  "Corner kicks": "cornerKicks",
  "Offsides": "offsides",
  "Goals conceded": "goalsConceded"
};
const liveKindMap = {
  goal: "goals",
  assist: "assists",
  ownGoal: "ownGoals",
  yellowCard: "yellowCards",
  redCard: "redCards",
  penalty: "penaltyGoals",
  penaltyGoal: "penaltyGoals",
  penaltyMissed: "penaltiesMissed",
  stillGoal: "deadBallGoals",
  fault: "fouls",
  corner: "cornerKicks",
  offside: "offsides",
  goalConceded: "goalsConceded"
};
const stopWords = new Set([
  ...sections, "Dashboard", "Statistics", "TEAM", "PLAYER", "Filter", "MINIMIZE",
  "SEE ALL", "See all", "Try Challenge Place app", "A complete multiplatform system to make your life easier!",
  "COMMUNITY", "FAQ", "Blog", "Modalities", "RESOURCES", "Privacy policy",
  "Terms of service", "MORE", "Go Premium", "Contact us", "Report a problem. Your feedback help us improve",
  "Challenge yourself. It's free!", "DO LIKE MILLIONS OF USERS AROUND THE WORLD.",
  "CREATE CHALLENGE", "QUICK TRY"
]);

function lines(text) {
  return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function isRank(s) {
  return /^\d+$/.test(s) && Number(s) < 200;
}

function isStop(s) {
  return stopWords.has(s);
}

function canonTeam(team) {
  const t = String(team || "").trim();
  if (/^OBC(?:\s+FC)?$/i.test(t)) return "OBC";
  if (/^(Barnet|Barent)\s+F\.?C?s?$/i.test(t)) return "Barnet FC";
  if (/^(Philadelphia|Philapedia)\s+F\.?C$/i.test(t)) return "Philadelphia FC";
  if (/^PHIF$/i.test(t)) return "Philadelphia FC";
  return t;
}

function parseSection(arr, start) {
  const kind = kindMap[arr[start]];
  const rows = [];
  let i = start + 1;
  while (i < arr.length && !sections.includes(arr[i]) && arr[i] !== "Try Challenge Place app") {
    if (isStop(arr[i])) {
      i++;
      continue;
    }
    if (isRank(arr[i]) && i + 3 < arr.length) i++;
    if (i >= arr.length || isStop(arr[i])) break;
    const name = arr[i++];
    if (i >= arr.length || isStop(arr[i])) break;
    const team = canonTeam(arr[i++]);
    if (i >= arr.length || isStop(arr[i])) break;
    const val = Number(arr[i]);
    if (Number.isFinite(val)) {
      rows.push({ name, team, val });
      i++;
    } else {
      i++;
    }
  }
  return rows.map((r) => ({ ...r, kind }));
}

function parseText(text) {
  const arr = lines(text);
  const out = {};
  for (let i = 0; i < arr.length; i++) {
    if (!sections.includes(arr[i])) continue;
    const parsed = parseSection(arr, i);
    if (parsed.length) {
      const kind = parsed[0].kind;
      out[kind] = (out[kind] || []).concat(parsed.map(({ kind: _kind, ...r }) => r));
    }
  }
  return out;
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach((r) => {
    const sig = [r.name, r.team, r.val].join("|");
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(r);
    }
  });
  return out;
}

function bestRows(expandedRows, originalRows) {
  const e = expandedRows || [];
  const o = originalRows || [];
  return dedupeRows(e.length >= o.length ? e : o);
}

function addStatRow(out, kind, row) {
  out[kind] = out[kind] || [];
  out[kind].push(row);
}

function sortRows(rows) {
  return (rows || []).slice().sort((a, b) => {
    return Number(b.val || 0) - Number(a.val || 0)
      || String(a.name || "").localeCompare(String(b.name || ""))
      || String(a.team || "").localeCompare(String(b.team || ""));
  });
}

function rowsFromLiveCompetition(comp) {
  const out = {};
  const isAggregate = comp.href === "/c/lega-league-2";
  (comp.players || []).forEach((player) => {
    Object.keys(player.stats || {}).forEach((sourceKey) => {
      const kind = liveKindMap[sourceKey];
      if (!kind) return;
      if (isAggregate && kind !== "goals") return;
      const val = Number(player.stats[sourceKey] || 0);
      if (!Number.isFinite(val) || val <= 0) return;
      const row = { name: player.name, team: canonTeam(player.team), val };
      if (isAggregate) row.aggregate = "legaLeagueAllTime";
      addStatRow(out, kind, row);
    });
  });
  Object.keys(out).forEach((kind) => {
    out[kind] = sortRows(dedupeRows(out[kind]));
  });
  return out;
}

function applyLiveRows(byComp) {
  ((live && live.competitions) || []).forEach((comp) => {
    const liveRows = rowsFromLiveCompetition(comp);
    if (!Object.keys(liveRows).length) return;
    byComp[comp.name] = byComp[comp.name] || {};
    Object.keys(liveRows).forEach((kind) => {
      byComp[comp.name][kind] = liveRows[kind];
    });
  });
}

function mergeCorrectionRows(byComp, corrections) {
  Object.keys(corrections).forEach((comp) => {
    byComp[comp] = byComp[comp] || {};
    Object.keys(corrections[comp]).forEach((kind) => {
      byComp[comp][kind] = byComp[comp][kind] || [];
      corrections[comp][kind].forEach(([name, team, val]) => {
        const cleanTeam = canonTeam(team);
        const existing = byComp[comp][kind].find((row) => row.name === name && canonTeam(row.team) === cleanTeam);
        if (existing) existing.val = Math.max(Number(existing.val || 0), val);
        else byComp[comp][kind].push({ name, team: cleanTeam, val });
      });
      byComp[comp][kind] = sortRows(dedupeRows(byComp[comp][kind]));
    });
  });
}

function build() {
  const byComp = {};
  raw.competitions.forEach((comp) => {
    const e = expanded.find((s) => s.name === comp.name);
    const o = original.find((s) => s.name === comp.name);
    const pe = e && /Top scorers/.test(e.text || "") ? parseText(e.text) : {};
    const po = o && /Top scorers/.test(o.text || "") ? parseText(o.text) : {};
    const merged = {};
    new Set([...Object.keys(pe), ...Object.keys(po)]).forEach((kind) => {
      merged[kind] = bestRows(pe[kind], po[kind]);
    });
    byComp[comp.name] = merged;
  });

  // Pages where Challenge Place resisted expansion in automation but visible screenshots / live capture confirmed rows.
  const fixes = {
    "Lega League ⚽": {
      goals: [
        ["Raphel Ndubuidu", "WINNERS Team", 9]
      ]
    },
    "Lega League 2022 A": {
      goals: [
        ["Tope", "Future Stars", 12], ["Pope", "MFM", 10], ["Ajoo", "Dynamo FC", 9],
        ["Okoye", "Dynamo FC", 8], ["Praise", "Golden Stars", 5], ["Ricky", "Dynamo FC", 5],
        ["Zamani", "Golden Stars", 5], ["Iyanu", "Dynamo FC", 4], ["Daniel", "Fc Eagles", 3],
        ["Eniola", "Dynamo FC", 3], ["Raphel Ndubuidu", "Fc Eagles", 3], ["Ruby", "Fc Eagles", 3],
        ["Segun", "Fc Eagles", 3], ["Tommy", "Fc Eagles", 3], ["Abraham", "MFM", 2],
        ["Bolu", "Future Stars", 2], ["Emmanuel", "Fc Eagles", 2], ["Gbenga", "Future Stars", 2],
        ["Honour", "MFM", 2], ["Marvellous", "MFM", 2], ["Penzzy", "Golden Stars", 2],
        ["Progress", "Fc Eagles", 2], ["Samuel", "Golden Stars", 2], ["Aje Messi", "Fc Eagles", 1],
        ["Ayomide", "Golden Stars", 1], ["Blessing", "Golden Stars", 1], ["Dotun", "Dynamo FC", 1],
        ["Emmanuel", "Golden Stars", 1], ["Emmy", "MFM", 1], ["Hargbo", "Golden Stars", 1],
        ["James", "Golden Stars", 1], ["John", "MFM", 1], ["Lekan", "Future Stars", 1],
        ["Ojo", "Fc Eagles", 1], ["Ope", "Future Stars", 1], ["Origi", "Golden Stars", 1],
        ["Paul", "Future Stars", 1], ["Sanmi", "MFM", 1], ["Sodiq", "Fc Eagles", 1],
        ["Sogzy", "MFM", 1], ["Taiwo", "Golden Stars", 1], ["Tope", "Fc Eagles", 1],
        ["Xy", "Dynamo FC", 1]
      ],
      assists: [
        ["Ricky", "Dynamo FC", 8], ["Okoye", "Dynamo FC", 5], ["Aje Messi", "Fc Eagles", 4],
        ["Ajoo", "Dynamo FC", 4], ["Hameed", "Future Stars", 3], ["Iyanu", "Dynamo FC", 3],
        ["Zamani", "Golden Stars", 3], ["Abraham", "MFM", 2], ["Ojo", "Fc Eagles", 2],
        ["Praise", "Golden Stars", 2], ["Saka", "Golden Stars", 2], ["Samuel", "Golden Stars", 2],
        ["Ay show", "MFM", 1], ["Ayomide", "Golden Stars", 1], ["Blessing", "Golden Stars", 1],
        ["Bolu", "Future Stars", 1], ["Daniel", "Fc Eagles", 1], ["J.T", "Dynamo FC", 1],
        ["James", "Golden Stars", 1], ["Lekan", "MFM", 1], ["Progress", "Fc Eagles", 1],
        ["Ruby", "Fc Eagles", 1], ["Samad", "Fc Eagles", 1], ["Sanmi", "MFM", 1],
        ["Sunkanmi", "Golden Stars", 1], ["Tommy", "Fc Eagles", 1], ["Tope", "Future Stars", 1]
      ],
      yellowCards: [["Raphel Ndubuidu", "Fc Eagles", 1], ["Zamani", "Golden Stars", 1]],
      redCards: [["Aje Messi", "Fc Eagles", 1], ["Raphel Ndubuidu", "Fc Eagles", 1]]
    }
  };

  Object.keys(fixes).forEach((comp) => {
    byComp[comp] = byComp[comp] || {};
    Object.keys(fixes[comp]).forEach((kind) => {
      byComp[comp][kind] = fixes[comp][kind].map(([name, team, val]) => ({ name, team, val }));
    });
  });

  applyLiveRows(byComp);

  const verifiedCorrections = {
    "Lega League 2020 (corona)": {
      goals: [
        ["Origi", "Philadelphia FC", 11],
        ["Ay show", "Philadelphia FC", 11]
      ],
      deadBallGoals: [
        ["Origi", "Philadelphia FC", 6],
        ["Tommy", "Nova fc", 4]
      ]
    }
  };

  Object.keys(verifiedCorrections).forEach((comp) => {
    byComp[comp] = byComp[comp] || {};
    Object.keys(verifiedCorrections[comp]).forEach((kind) => {
      byComp[comp][kind] = byComp[comp][kind] || [];
      verifiedCorrections[comp][kind].forEach(([name, team, val]) => {
        const cleanTeam = canonTeam(team);
        const existing = byComp[comp][kind].find((row) => row.name === name && canonTeam(row.team) === cleanTeam);
        if (existing) existing.val = Math.max(Number(existing.val || 0), val);
        else byComp[comp][kind].push({ name, team: cleanTeam, val });
      });
    });
  });

  const playerTotals = {};
  Object.keys(byComp).forEach((competition) => {
    const stat = byComp[competition];
    Object.keys(stat).forEach((kind) => {
      stat[kind].forEach((row) => {
        if (row.aggregate) return;
        const name = row.name;
        playerTotals[name] = playerTotals[name] || { teams: {}, goals: 0, assists: 0, extras: {}, records: [] };
        playerTotals[name].teams[row.team] = 1;
        if (kind === "goals") playerTotals[name].goals += row.val;
        else if (kind === "assists") playerTotals[name].assists += row.val;
        else playerTotals[name].extras[kind] = (playerTotals[name].extras[kind] || 0) + row.val;
        const rec = { competition, team: row.team, kind, val: row.val };
        playerTotals[name].records.push(rec);
      });
    });
  });

  return { extractedAt: (live && live.extractedAt) || new Date().toISOString(), byCompetition: byComp, playerTotals };
}

if (require.main === module) {
  const data = build();
  const js = "/* Generated from Challenge Place player statistics. */\n(function(){\n  window.LEGA_CHALLENGE_PLAYER_DATA = "
    + JSON.stringify(data, null, 2) + ";\n})();\n";
  fs.writeFileSync(path.join(repo, "js", "challenge-place-player-data.js"), js);
  console.log(JSON.stringify({
    competitions: Object.keys(data.byCompetition).length,
    players: Object.keys(data.playerTotals).length,
    raphel: data.playerTotals["Raphel Ndubuidu"],
    martins: data.playerTotals.Martins,
    zamani: data.playerTotals.Zamani
  }, null, 2));
}
