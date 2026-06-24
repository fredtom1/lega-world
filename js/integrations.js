/* =====================================================================
   integrations.js — Phase 1 public-site behaviour layered on top of the
   generated app (without modifying the design):

   1. Adds a "Players (one per line)" field to the Register form.
   2. Routes the Register and Transfer submissions to Supabase
      (registrations / transfer_requests) so the league office can see
      and approve them. Falls back to the original local behaviour when
      Supabase is not configured.
   3. Makes News cards open a readable article (photo + headline + body).

   Loaded after app.js and before mount, so it re-registers the App with
   the patched template.
   ===================================================================== */
(function () {
  "use strict";
  if (!window.DC || !window.LEGA_AppComponent || !window.LEGA_APP_TEMPLATE) return;

  var Component = window.LEGA_AppComponent;
  var proto = Component.prototype;

  /* ---- 1. inject the Players field into the Register form ---- */
  var PLAYERS_FIELD =
    '<div><label style="{{ labelStyle }}">Players (one per line)</label>' +
    '<textarea value="{{ regPlayers }}" onInput="{{ onRegPlayers }}" placeholder="One player name per line" ' +
    'style="{{ inputStyle }};min-height:104px;resize:vertical;line-height:1.6;"></textarea>' +
    '<div style="font-size:11px;color:#A09AAE;font-weight:600;margin-top:5px;">These become the team\'s squad once approved.</div></div>';

  var template = window.LEGA_APP_TEMPLATE;
  var anchor = '<span onClick="{{ submitReg }}"';
  if (template.indexOf(anchor) >= 0) template = template.replace(anchor, PLAYERS_FIELD + anchor);

  // Premier League-style public player directory: search, club filter, dense rows.
  var PLAYER_DIRECTORY =
    '<sc-if value="{{ playerNoSel }}" hint-placeholder-val="{{ true }}">' +
    '<div style="background:#2C1545;color:#fff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(44,21,69,.18);margin:18px 0 0;">' +
      '<div style="height:12px;background:linear-gradient(90deg,#48246C,#009C9C,#2BD6D6);"></div>' +
      '<div style="padding:22px 24px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:250px;position:relative;"><span style="position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:22px;color:#A09AAE;">⌕</span><input value="{{ playerSearch }}" onInput="{{ onPlayerSearch }}" placeholder="Search players" style="width:100%;font-size:16px;font-weight:600;padding:15px 16px 15px 48px;border:1px solid rgba(255,255,255,.36);border-radius:14px;background:#2C0630;color:#fff;" /></div>' +
        '<select value="{{ playerClubFilter }}" onChange="{{ onPlayerClubFilter }}" style="min-width:190px;font-size:15px;font-weight:700;padding:14px 16px;border:1px solid rgba(255,255,255,.36);border-radius:14px;background:#2C0630;color:#fff;"><option value="">All clubs</option><sc-for list="{{ playerClubOptions }}" as="club" hint-placeholder-count="6"><option value="{{ club }}">{{ club }}</option></sc-for></select>' +
        '<div style="font-size:13px;font-weight:700;color:#D7ECF7;">{{ playerShowingCount }} players shown</div>' +
      '</div>' +
      '<div style="padding:0 24px 24px;overflow-x:auto;">' +
        '<div style="min-width:760px;background:#310039;border-radius:18px;padding:0 24px;">' +
          '<div style="display:grid;grid-template-columns:2.1fr 1.5fr 1fr .7fr .7fr .7fr;gap:18px;align-items:center;padding:18px 0;color:#fff;font-size:13px;font-weight:800;">' +
            '<div>Player</div><div>Club</div><div>Position</div><div style="text-align:center;">Goals</div><div style="text-align:center;">Assists</div><div style="text-align:right;">Profile</div>' +
          '</div>' +
          '<sc-for list="{{ playerDirectory }}" as="row" hint-placeholder-count="8">' +
            '<div onClick="{{ row.pick }}" role="button" tabindex="0" style="display:grid;grid-template-columns:2.1fr 1.5fr 1fr .7fr .7fr .7fr;gap:18px;align-items:center;padding:16px 0;border-top:1px solid rgba(255,255,255,.13);cursor:pointer;">' +
              '<div style="display:flex;align-items:center;gap:14px;min-width:0;"><span style="width:58px;height:58px;border-radius:14px;background:linear-gradient(135deg,#F0B418,#009C9C);display:flex;align-items:center;justify-content:center;flex:none;font-weight:900;color:#fff;font-size:18px;">{{ row.initial }}</span><div style="min-width:0;"><div style="font-size:17px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ row.name }}</div><div style="font-size:12px;color:#D7ECF7;font-weight:600;margin-top:3px;">{{ row.extraLine }}</div></div></div>' +
              '<div style="display:flex;align-items:center;gap:10px;min-width:0;"><dc-import name="TeamBadge" team="{{ row.team }}" size="30" hint-size="30px,30px"></dc-import><span style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ row.team }}</span></div>' +
              '<div style="font-size:14px;font-weight:700;color:#fff;">{{ row.position }}</div>' +
              '<div style="text-align:center;font-size:15px;font-weight:800;color:#F0B418;">{{ row.goals }}</div>' +
              '<div style="text-align:center;font-size:15px;font-weight:800;color:#90C0E4;">{{ row.assists }}</div>' +
              '<div style="text-align:right;font-size:13px;font-weight:800;color:#fff;">View ›</div>' +
            '</div>' +
          '</sc-for>' +
          '<sc-if value="{{ playerRowsEmpty }}" hint-placeholder-val="{{ false }}"><div style="border-top:1px solid rgba(255,255,255,.13);padding:28px 0;color:#D7ECF7;font-weight:600;text-align:center;">No players match that search.</div></sc-if>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</sc-if>';
  var playersStart = '<sc-if value="{{ playerNoSel }}" hint-placeholder-val="{{ true }}">';
  var playersNext = '\n\n    <sc-if value="{{ playerHasSel }}" hint-placeholder-val="{{ false }}">';
  var playersStartAt = template.indexOf(playersStart);
  var playersNextAt = playersStartAt >= 0 ? template.indexOf(playersNext, playersStartAt) : -1;
  if (playersStartAt >= 0 && playersNextAt > playersStartAt) {
    template = template.slice(0, playersStartAt) + PLAYER_DIRECTORY + template.slice(playersNextAt);
  }

  // discreet portal login link in the footer (not in the public nav)
  var FOOT = '<div style="color:#90C0E4;font-size:13px;font-weight:500;">Ekiti &middot; Lagos &middot; Anambra, Nigeria &middot; Founded 2013</div>';
  var PORTAL_LINK = '<a href="login.html" style="color:#fff;font-size:12px;font-weight:700;text-decoration:none;background:#009C9C;padding:7px 14px;border-radius:999px;">Portal login</a>';
  if (template.indexOf(FOOT) >= 0) template = template.replace(FOOT, '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:14px;">' + PORTAL_LINK + FOOT + '</div>');

  // provide the bindings for the new field
  var origSignRegVals = proto.signRegVals;
  proto.signRegVals = function () {
    var o = origSignRegVals.call(this);
    o.regPlayers = (this.state.regForm && this.state.regForm.players) || "";
    o.onRegPlayers = this.setField("regForm", "players");
    return o;
  };

  var origPlayersVals = proto.playersVals;
  proto.playersVals = function () {
    var o = origPlayersVals.call(this);
    var search = String(this.state.playerSearch || "").trim().toLowerCase();
    var club = this.state.playerClubFilter || "";
    var clubs = Object.keys(this.rosters || {}).filter(function (t) { return ((this.rosters[t] || []).length > 0); }, this).sort();
    var self = this;
    var rows = (this.playerNames || []).map(function (n) {
      var p = self.players[n] || {};
      var team = p.mainTeam || (self.playerClubs && self.playerClubs(n)[0]) || "Unlisted";
      var ex = playerExtra(n);
      var aliases = ex && ex.aliases ? " " + ex.aliases.join(" ") : "";
      return {
        name: n,
        team: team,
        position: self.positions[n] || "Unlisted",
        goals: p.goals || 0,
        assists: p.assists || 0,
        searchText: n + " " + team + " " + (self.positions[n] || "Unlisted") + aliases,
        initial: (n[0] || "?").toUpperCase(),
        pick: function () { self.setState({ playerSel: n }); }
      };
    }).filter(function (r) {
      if (club && r.team !== club) return false;
      if (!search) return true;
      return (r.searchText || "").toLowerCase().indexOf(search) >= 0;
    });
    o.playerSearch = this.state.playerSearch || "";
    o.playerClubFilter = club;
    o.playerClubOptions = clubs;
    o.playerDirectory = rows.slice(0, 120);
    o.playerRowsEmpty = rows.length === 0;
    o.playerShowingCount = String(rows.length);
    o.onPlayerSearch = function (e) { self.setState({ playerSearch: e.target.value }); };
    o.onPlayerClubFilter = function (e) { self.setState({ playerClubFilter: e.target.value }); };
    return o;
  };

  function challengeData() {
    return window.LEGA_CHALLENGE_DATA || {};
  }
  function mergeExtra(base, patch) {
    if (!base && !patch) return null;
    var out = { teams: {}, records: [] };
    [base || {}, patch || {}].forEach(function (src) {
      Object.keys(src.teams || {}).forEach(function (team) { out.teams[team] = 1; });
      ["ownGoals", "yellowCards", "redCards", "penaltyGoals", "penaltiesMissed", "deadBallGoals", "fouls", "cornerKicks", "offsides"].forEach(function (key) {
        out[key] = Math.max(out[key] || 0, src[key] || 0);
      });
      (src.records || []).forEach(function (r) {
        var sig = [r.competition, r.team, r.kind, r.val].join("|");
        out._seen = out._seen || {};
        if (!out._seen[sig]) {
          out._seen[sig] = 1;
          out.records.push(r);
        }
      });
      if (src.aliases) out.aliases = (out.aliases || []).concat(src.aliases);
    });
    delete out._seen;
    return out;
  }
  function playerExtra(name) {
    var cd = challengeData();
    return mergeExtra((cd.playerExtras || {})[name], (cd.playerCorrections || {})[name]);
  }
  function playerExtraKeys() {
    var cd = challengeData();
    var keys = {};
    Object.keys(cd.playerExtras || {}).forEach(function (name) { keys[name] = 1; });
    Object.keys(cd.playerCorrections || {}).forEach(function (name) { keys[name] = 1; });
    return Object.keys(keys);
  }
  function extraLine(ex) {
    if (!ex) return "Challenge Place checked";
    var total = (ex.ownGoals || 0) + (ex.yellowCards || 0) + (ex.redCards || 0) + (ex.deadBallGoals || 0);
    if (total > 0) return "OG " + (ex.ownGoals || 0) + " · YC " + (ex.yellowCards || 0) + " · RC " + (ex.redCards || 0) + " · FK " + (ex.deadBallGoals || 0);
    var teams = Object.keys(ex.teams || {});
    return teams.length ? "Challenge roster: " + teams.join(" / ") : "Challenge Place checked";
  }
  function addRosterName(rosters, team, name) {
    if (!team || !name) return;
    rosters[team] = rosters[team] || [];
    if (rosters[team].indexOf(name) < 0) rosters[team].push(name);
  }
  function ensurePlayer(idx, name, team) {
    if (!idx[name]) idx[name] = {
      name: name, recs: [], goals: 0, assists: 0, seasons: {}, comps: {},
      teams: {}, nSeasons: 0, nComps: 0, nTeams: 1, peak: 0, mainTeam: team
    };
    idx[name].teams[team] = 1;
    if (!idx[name].mainTeam) idx[name].mainTeam = team;
    return idx[name];
  }

  var origBuildPlayers = proto.buildPlayers;
  proto.buildPlayers = function () {
    var cd = challengeData();
    var rosters = cd.rosters || {};
    Object.keys(rosters).forEach(function (team) {
      (rosters[team] || []).forEach(function (name) { addRosterName(this.rosters, team, name); }, this);
    }, this);
    origBuildPlayers.call(this);
    playerExtraKeys().forEach(function (name) {
      var ex = playerExtra(name) || {};
      var teams = Object.keys(ex.teams || {});
      var team = teams[0] || "Unlisted";
      ensurePlayer(this.players, name, team);
    }, this);
    Object.values(this.players).forEach(function (p) {
      p.nTeams = Object.keys(p.teams || {}).length;
    });
    this.playerNames = Object.keys(this.players).sort(function (a, b) {
      return (this.players[b].goals || 0) - (this.players[a].goals || 0) || a.localeCompare(b);
    }.bind(this));
  };

  var origPlayerClubs = proto.playerClubs;
  proto.playerClubs = function (name) {
    var clubs = origPlayerClubs.call(this, name);
    var ex = playerExtra(name);
    if (ex && ex.teams) {
      Object.keys(ex.teams).forEach(function (team) {
        if (clubs.indexOf(team) < 0) clubs.push(team);
      });
    }
    return clubs;
  };

  var origPlayersValsExtra = proto.playersVals;
  proto.playersVals = function () {
    var o = origPlayersValsExtra.call(this);
    if (o.playerDirectory) {
      o.playerDirectory = o.playerDirectory.map(function (row) {
        var ex = playerExtra(row.name);
        row.extraLine = ex
          ? "OG " + (ex.ownGoals || 0) + " · YC " + (ex.yellowCards || 0) + " · RC " + (ex.redCards || 0) + " · FK " + (ex.deadBallGoals || 0)
          : "Challenge Place checked";
        return row;
      });
    }
    if (this.state.playerSel && o.pBioRows) {
      var ex = playerExtra(this.state.playerSel);
      if (ex) {
        o.pBioRows = o.pBioRows.concat([
          { label: "Own goals", val: ex.ownGoals || 0 },
          { label: "Yellow cards", val: ex.yellowCards || 0 },
          { label: "Red cards", val: ex.redCards || 0 },
          { label: "Dead-ball goals", val: ex.deadBallGoals || 0 }
        ]);
        o.pChallengeRows = (ex.records || []).map(function (r) {
          var labels = {
            ownGoals: "Own goal", yellowCards: "Yellow card", redCards: "Red card",
            deadBallGoals: "Dead-ball goal", penaltyGoals: "Penalty goal",
            penaltiesMissed: "Penalty missed", fouls: "Foul", cornerKicks: "Corner",
            offsides: "Offside"
          };
          return { label: labels[r.kind] || r.kind, val: r.val, team: r.team, comp: r.competition };
        });
      }
    }
    return o;
  };

  var origPlayersValsChallengeFix = proto.playersVals;
  proto.playersVals = function () {
    var o = origPlayersValsChallengeFix.call(this);
    if (o.playerDirectory) {
      o.playerDirectory = o.playerDirectory.map(function (row) {
        row.extraLine = extraLine(playerExtra(row.name));
        return row;
      });
    }
    if (this.state.playerSel && o.pBioRows) {
      var ex = playerExtra(this.state.playerSel);
      var hasTeams = o.pBioRows.some(function (row) { return row.label === "Challenge teams"; });
      if (ex && !hasTeams) {
        o.pBioRows = o.pBioRows.concat([
          { label: "Challenge teams", val: Object.keys(ex.teams || {}).join(" / ") || "Unlisted" }
        ]);
      }
    }
    if (o.pChallengeRows) {
      o.pChallengeRows = o.pChallengeRows.map(function (row) {
        if (row.label === "registered") row.label = "Roster listed";
        if (row.label === "goals") row.label = "Goal";
        return row;
      });
    }
    return o;
  };

  /* ---- 2. route submissions to Supabase ---- */
  function configured() { return !!(window.LEGA_configured && window.LEGA_configured()); }

  proto.submitReg = function () {
    var f = this.state.regForm, self = this;
    if (!f.team || !f.email) { this.setState({ flash: "Add your team name and a contact email." }); return; }
    var players = String(f.players || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    function reset(msg) {
      self.setState({ regForm: { team: "", manager: "", state: "Lagos", email: "", squad: "", colours: "", comp: "Lega League", players: "" }, flash: msg });
    }
    if (configured()) {
      window.LEGA_db.insert("registrations", {
        team: f.team, manager: f.manager, state: f.state, email: f.email,
        colours: f.colours, comp: f.comp, squad: f.squad, players: players
      }).then(function () { reset("Registration received — the Lega World team will review your squad."); })
        .catch(function (e) { self.setState({ flash: "Could not submit right now: " + e.message }); });
    } else {
      var rec = Object.assign({ status: "Pending review" }, f); var pr = [rec].concat(self.state.pendR);
      self.save("pendR", pr); self.setState({ pendR: pr }); reset("Registration received. The Lega World team will be in touch.");
    }
  };

  proto.submitTransfer = function () {
    this.setState({ flash: "Transfer requests now happen inside the Coach / Team Owner portal so the selling club and player can approve the move." });
    if (typeof window !== "undefined") setTimeout(function () { window.location.href = "coach.html"; }, 900);
  };

  // re-register the App with the patched template
  window.DC.register("App", template, Component);

  // Route the old public Sign in CTA to the role/category portal.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.textContent && t.textContent.trim() === "Sign in") {
      var inHeader = t.closest && t.closest("header");
      if (inHeader) { e.preventDefault(); e.stopPropagation(); window.location.href = "login.html"; }
    }
  }, true);

  /* ---- 3. News article reader ---- */
  function newsList() {
    return (window.LEGA_CONTENT && window.LEGA_CONTENT.news) || (window.LEGA_SEED && window.LEGA_SEED.news) || [];
  }
  function isPhoto(src) { return src && /^https?:|\/storage\/|supabase/.test(src) && src.indexOf("assets/") < 0; }

  function openArticle(item) {
    closeArticle();
    var ov = document.createElement("div");
    ov.id = "lw-article";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:1000;background:rgba(44,21,69,.55);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto;");
    ov.addEventListener("click", function (e) { if (e.target === ov) closeArticle(); });
    var hasBody = item.body && String(item.body).trim();
    var imgStyle = isPhoto(item.img)
      ? "width:100%;height:300px;object-fit:cover;display:block;"
      : "width:100%;height:200px;object-fit:contain;display:block;padding:28px;background:" + (item.bg || "#48246C") + ";";
    var card = document.createElement("div");
    card.setAttribute("style", "background:#fff;border-radius:22px;overflow:hidden;max-width:680px;width:100%;box-shadow:0 30px 80px rgba(44,21,69,.45);font-family:'Montserrat',system-ui,sans-serif;");
    card.innerHTML =
      '<div style="position:relative;">' +
        (item.img ? '<img src="' + escAttr(item.img) + '" alt="" style="' + imgStyle + '" />' : '') +
        '<span data-close="1" style="position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;">&times;</span>' +
      '</div>' +
      '<div style="padding:24px 26px 30px;">' +
        '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#067C7C;">' + escHtml(item.cat || "News") + '</span>' +
        '<h2 style="margin:8px 0 14px;font-size:26px;line-height:1.2;letter-spacing:-.01em;color:#281F38;">' + escHtml(item.title || "") + '</h2>' +
        (hasBody
          ? '<div style="white-space:pre-line;font-size:16px;line-height:1.75;color:#3A3350;font-weight:500;">' + escHtml(item.body) + '</div>'
          : '<div style="color:#A09AAE;font-weight:500;font-size:15px;">Full report coming soon.</div>') +
      '</div>';
    ov.appendChild(card);
    card.addEventListener("click", function (e) { if (e.target.getAttribute && e.target.getAttribute("data-close")) closeArticle(); });
    document.body.appendChild(ov);
    document.addEventListener("keydown", escClose);
  }
  function closeArticle() { var n = document.getElementById("lw-article"); if (n) n.remove(); document.removeEventListener("keydown", escClose); }
  function escClose(e) { if (e.key === "Escape") closeArticle(); }
  function escHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function escAttr(s) { return String(s).replace(/"/g, "&quot;"); }

  document.addEventListener("click", function (e) {
    var list = newsList(); if (!list.length) return;
    if (document.getElementById("lw-article")) return;
    var node = e.target;
    // Walk up to the nearest element that wraps exactly ONE <h3> (a single
    // news card). If we reach a container with several <h3>s, the click was
    // not on a card — bail (prevents matching an unrelated headline).
    for (var i = 0; i < 8 && node && node !== document.body; i++) {
      if (node.querySelectorAll) {
        var h3s = node.querySelectorAll("h3");
        if (h3s.length === 1) {
          var t = h3s[0].textContent.trim();
          for (var j = 0; j < list.length; j++) {
            if (String(list[j].title || "").trim() === t) { e.preventDefault(); openArticle(list[j]); return; }
          }
        } else if (h3s.length > 1) {
          return;
        }
      }
      node = node.parentNode;
    }
  }, false);
})();
