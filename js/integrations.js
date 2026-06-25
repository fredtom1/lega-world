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
    '<div style="font-size:11px;color:#A09AAE;font-weight:600;margin-top:5px;">These become the team\'s squad once approved.</div></div>' +
    '<div><label style="{{ labelStyle }}">Player profile / photo links (optional)</label>' +
    '<textarea value="{{ regPlayerPhotos }}" onInput="{{ onRegPlayerPhotos }}" placeholder="One per line: Player name - photo or profile link" ' +
    'style="{{ inputStyle }};min-height:82px;resize:vertical;line-height:1.6;"></textarea>' +
    '<div style="font-size:11px;color:#A09AAE;font-weight:600;margin-top:5px;">Use this for player photos or existing profile links until full file uploads are connected.</div></div>';

  var template = window.LEGA_APP_TEMPLATE;
  var MOBILE_STYLE = '<style>.lw-mobile-menu{display:none}.lw-mobile-drawer{display:none}@media(max-width:760px){.lw-mobile-menu{display:flex}.lw-public-nav{display:none!important}.lw-mobile-drawer{display:block}}</style>';
  template = MOBILE_STYLE + template;
  template = template.replace('<nav style="', '<nav class="lw-public-nav" style="');
  var headerAnchor = '<header ';
  var MOBILE_MENU =
    '<button class="lw-mobile-menu" onClick="{{ toggleMobileMenu }}" aria-label="Open menu" style="position:fixed;left:12px;top:12px;z-index:80;width:44px;height:44px;border:0;border-radius:999px;background:#2C1545;color:#fff;align-items:center;justify-content:center;font-size:26px;box-shadow:0 10px 28px rgba(44,21,69,.3);">☰</button>' +
    '<sc-if value="{{ mobileMenuOpen }}" hint-placeholder-val="{{ false }}">' +
      '<div class="lw-mobile-drawer" style="position:fixed;inset:0;z-index:79;background:rgba(44,21,69,.55);backdrop-filter:blur(4px);">' +
        '<div style="width:min(82vw,320px);height:100%;background:#fff;padding:72px 18px 24px;box-shadow:20px 0 60px rgba(44,21,69,.25);">' +
          '<button onClick="{{ closeMobileMenu }}" style="position:absolute;left:18px;top:18px;width:42px;height:42px;border-radius:999px;border:1px solid #E2ECEE;background:#fff;color:#48246C;font-size:24px;">×</button>' +
          '<div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#067C7C;margin-bottom:12px;">Lega World</div>' +
          '<sc-for list="{{ navItems }}" as="n" hint-placeholder-count="9"><div onClick="{{ n.go }}" style="padding:13px 10px;border-bottom:1px solid #EEF4F4;font-size:17px;font-weight:800;color:#281F38;">{{ n.label }}</div></sc-for>' +
        '</div>' +
      '</div>' +
    '</sc-if>';
  if (template.indexOf(headerAnchor) >= 0) template = template.replace(headerAnchor, MOBILE_MENU + headerAnchor);
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

  var MATCHES_PAGE =
    '<sc-if value="{{ isMatches }}" hint-placeholder-val="{{ false }}">' +
    '<section style="background:#2C1545;color:#fff;">' +
      '<div style="max-width:1200px;margin:0 auto;padding:36px 22px 34px;">' +
        '<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#90C0E4;">Fixtures & results</div>' +
        '<h2 style="font-size:38px;font-weight:900;margin:8px 0 8px;letter-spacing:-.02em;">Matches archive</h2>' +
        '<p style="margin:0;color:#D7ECF7;font-weight:600;max-width:760px;line-height:1.6;">Filter every recorded fixture, scoreline, awarded result note, and team head-to-head from the Lega archive.</p>' +
      '</div>' +
    '</section>' +
    '<section style="max-width:1200px;margin:0 auto;padding:24px 22px 72px;">' +
      '<div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;padding:18px;box-shadow:0 1px 3px rgba(44,21,69,.08);display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px;">' +
        '<div><label style="{{ labelStyle }}">Competition</label><select value="{{ matchComp }}" onChange="{{ onMatchComp }}" style="{{ inputStyle }}"><option value="">All competitions</option><sc-for list="{{ matchCompOptions }}" as="o" hint-placeholder-count="6"><option value="{{ o.value }}">{{ o.label }}</option></sc-for></select></div>' +
        '<div><label style="{{ labelStyle }}">Season</label><select value="{{ matchSeason }}" onChange="{{ onMatchSeason }}" style="{{ inputStyle }}"><option value="">All seasons</option><sc-for list="{{ matchSeasonOptions }}" as="o" hint-placeholder-count="6"><option value="{{ o.value }}">{{ o.label }}</option></sc-for></select></div>' +
        '<div><label style="{{ labelStyle }}">Gameweek</label><select value="{{ matchGw }}" onChange="{{ onMatchGw }}" style="{{ inputStyle }}"><option value="">All weeks</option><sc-for list="{{ matchGwOptions }}" as="o" hint-placeholder-count="6"><option value="{{ o.value }}">{{ o.label }}</option></sc-for></select></div>' +
        '<div><label style="{{ labelStyle }}">Team</label><select value="{{ matchTeam }}" onChange="{{ onMatchTeam }}" style="{{ inputStyle }}"><option value="">All teams</option><sc-for list="{{ matchTeamOptions }}" as="o" hint-placeholder-count="8"><option value="{{ o.value }}">{{ o.label }}</option></sc-for></select></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:18px;">' +
        '<div style="background:#fff;border:1px solid #E2ECEE;border-radius:16px;padding:16px;"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#5C5470;">Matches shown</div><div style="font-size:30px;font-weight:300;color:#48246C;">{{ matchShown }}</div></div>' +
        '<div style="background:#fff;border:1px solid #E2ECEE;border-radius:16px;padding:16px;"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#5C5470;">Played</div><div style="font-size:30px;font-weight:300;color:#067C7C;">{{ matchPlayed }}</div></div>' +
        '<div style="background:#fff;border:1px solid #E2ECEE;border-radius:16px;padding:16px;"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#5C5470;">Goals</div><div style="font-size:30px;font-weight:300;color:#F0B418;">{{ matchGoals }}</div></div>' +
        '<div style="background:#fff;border:1px solid #E2ECEE;border-radius:16px;padding:16px;"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#5C5470;">Result notes</div><div style="font-size:30px;font-weight:300;color:#C03048;">{{ matchRaw }}</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.35fr .85fr;gap:18px;align-items:start;">' +
        '<div style="background:#fff;border:1px solid #E2ECEE;border-radius:20px;padding:0 20px 20px;box-shadow:0 1px 3px rgba(44,21,69,.08);overflow:hidden;">' +
          '<div style="display:grid;grid-template-columns:1.4fr .9fr .75fr .65fr;gap:12px;padding:16px 0;font-size:12px;font-weight:900;text-transform:uppercase;color:#5C5470;border-bottom:1px solid #E2ECEE;"><div>Match</div><div>Competition</div><div>Season</div><div style="text-align:right;">Status</div></div>' +
          '<sc-for list="{{ matchRows }}" as="m" hint-placeholder-count="10">' +
            '<div style="display:grid;grid-template-columns:1.4fr .9fr .75fr .65fr;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid #EEF4F4;">' +
              '<div><div style="font-size:11px;color:#A09AAE;font-weight:800;margin-bottom:8px;">{{ m.displayDate }}</div><div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;min-width:0;"><span style="display:flex;align-items:center;gap:8px;justify-content:flex-end;min-width:0;"><span style="font-weight:800;color:#281F38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ m.homeLabel }}</span><dc-import name="TeamBadge" team="{{ m.homeBadge }}" size="30" hint-size="30px,30px"></dc-import></span><span style="font-size:18px;font-weight:900;color:#48246C;font-variant-numeric:tabular-nums;min-width:58px;text-align:center;">{{ m.score }}</span><span style="display:flex;align-items:center;gap:8px;min-width:0;"><dc-import name="TeamBadge" team="{{ m.awayBadge }}" size="30" hint-size="30px,30px"></dc-import><span style="font-weight:800;color:#281F38;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ m.awayLabel }}</span></span></div><div style="font-size:11px;color:#5C5470;font-weight:700;margin-top:7px;">{{ m.time }}</div><div style="font-size:11px;color:#C03048;font-weight:700;margin-top:4px;">{{ m.rawLine }}</div></div>' +
              '<div style="font-size:13px;font-weight:800;color:#48246C;">{{ m.competition }}</div>' +
              '<div style="font-size:13px;font-weight:700;color:#5C5470;">{{ m.season }} · {{ m.gameweek }}</div>' +
              '<div style="text-align:right;"><span style="display:inline-block;border-radius:999px;padding:6px 10px;background:{{ m.statusBg }};color:{{ m.statusColor }};font-size:11px;font-weight:900;text-transform:uppercase;">{{ m.status }}</span></div>' +
            '</div>' +
          '</sc-for>' +
          '<sc-if value="{{ matchNoRows }}" hint-placeholder-val="{{ false }}"><div style="padding:32px 0;text-align:center;color:#5C5470;font-weight:700;">No matches match those filters.</div></sc-if>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:16px;">' +
          '<div style="background:#2C1545;color:#fff;border-radius:20px;padding:20px;">' +
            '<div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#F0B418;margin-bottom:14px;">Head-to-head quick pick</div>' +
            '<div style="display:grid;gap:10px;"><select value="{{ matchA }}" onChange="{{ onMatchA }}" style="{{ darkSelectStyle }}"><sc-for list="{{ matchTeamOptions }}" as="o" hint-placeholder-count="8"><option value="{{ o.value }}">{{ o.label }}</option></sc-for></select><select value="{{ matchB }}" onChange="{{ onMatchB }}" style="{{ darkSelectStyle }}"><sc-for list="{{ matchTeamOptions }}" as="o" hint-placeholder-count="8"><option value="{{ o.value }}">{{ o.label }}</option></sc-for></select></div>' +
            '<div style="margin-top:16px;display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;text-align:center;"><div><div style="font-size:32px;font-weight:300;">{{ matchAWins }}</div><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#90C0E4;">{{ matchALabel }} wins</div></div><div><div style="font-size:22px;font-weight:300;color:#CFC0E0;">{{ matchDraws }}</div><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#90C0E4;">Draws</div></div><div><div style="font-size:32px;font-weight:300;">{{ matchBWins }}</div><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#90C0E4;">{{ matchBLabel }} wins</div></div></div>' +
            '<div style="margin-top:12px;font-size:12px;color:#D7ECF7;font-weight:700;text-align:center;">{{ matchH2HPlayed }} meetings · {{ matchAGoals }}-{{ matchBGoals }} goals</div>' +
          '</div>' +
          '<div style="background:#fff;border:1px solid #E2ECEE;border-radius:20px;padding:20px;">' +
            '<div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#067C7C;margin-bottom:12px;">Selected team record</div>' +
            '<div style="font-size:22px;font-weight:900;color:#281F38;">{{ matchRecordTeam }}</div>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;text-align:center;"><div><div style="font-size:24px;font-weight:300;color:#48246C;">{{ matchTeamPlayed }}</div><div style="font-size:10px;font-weight:800;color:#5C5470;">P</div></div><div><div style="font-size:24px;font-weight:300;color:#067C7C;">{{ matchTeamWins }}</div><div style="font-size:10px;font-weight:800;color:#5C5470;">W</div></div><div><div style="font-size:24px;font-weight:300;color:#A09AAE;">{{ matchTeamDraws }}</div><div style="font-size:10px;font-weight:800;color:#5C5470;">D</div></div><div><div style="font-size:24px;font-weight:300;color:#C03048;">{{ matchTeamLosses }}</div><div style="font-size:10px;font-weight:800;color:#5C5470;">L</div></div></div>' +
            '<div style="margin-top:16px;border-top:1px solid #EEF4F4;padding-top:12px;"><div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#5C5470;margin-bottom:8px;">Matches by competition</div><sc-for list="{{ matchCompRecordRows }}" as="r" hint-placeholder-count="4"><div style="display:grid;grid-template-columns:1fr repeat(4,28px);gap:7px;align-items:center;font-size:12px;font-weight:800;color:#281F38;padding:5px 0;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ r.competition }}</span><span>{{ r.p }}</span><span style="color:#067C7C;">{{ r.w }}</span><span style="color:#A09AAE;">{{ r.d }}</span><span style="color:#C03048;">{{ r.l }}</span></div></sc-for></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>' +
    '</sc-if>';
  var newsAnchor = '<sc-if value="{{ isNews }}" hint-placeholder-val="{{ false }}">';
  if (template.indexOf(newsAnchor) >= 0) template = template.replace(newsAnchor, MATCHES_PAGE + '\n' + newsAnchor);

  // provide the bindings for the new field
  var origSignRegVals = proto.signRegVals;
  proto.signRegVals = function () {
    var o = origSignRegVals.call(this);
    o.regPlayers = (this.state.regForm && this.state.regForm.players) || "";
    o.regPlayerPhotos = (this.state.regForm && this.state.regForm.playerPhotos) || "";
    o.onRegPlayers = this.setField("regForm", "players");
    o.onRegPlayerPhotos = this.setField("regForm", "playerPhotos");
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
  function challengePlayerData() {
    return window.LEGA_CHALLENGE_PLAYER_DATA || {};
  }
  function challengeMatchData() {
    return window.LEGA_CHALLENGE_MATCH_DATA || {};
  }
  var PLAYER_ALIASES = {
    "Raphael Ndubuidu": "Raphel Ndubuidu",
    "RAPHAEL NDUBUIDU": "Raphel Ndubuidu"
  };
  function canonPlayer(name) {
    var n = String(name || "").trim();
    return PLAYER_ALIASES[n] || PLAYER_ALIASES[n.toUpperCase()] || n;
  }
  function teamLabel(team) {
    return team === "Fc Eagles" ? "Fly Eagles" : team;
  }
  function manualPlayerExtra(name) {
    name = canonPlayer(name);
    if (name === "Ayo") {
      return {
        teams: { "MFM": 1 },
        deadBallGoals: 3,
        records: [
          { competition: "Manual record", team: "MFM", kind: "deadBallGoals", val: 3, note: "Goalkeeper free-kick record" }
        ]
      };
    }
    if (name === "Origi") {
      return {
        teams: { "WINNERS Team": 1, "Golden Stars": 1 },
        deadBallGoals: 2,
        records: [
          { competition: "Lega League 2020 (corona)", team: "WINNERS Team", kind: "deadBallGoals", val: 2, note: "Most free kicks in one season" }
        ]
      };
    }
    return null;
  }
  function applyManualRecords(app) {
    app.positions.Ayo = "Goalkeeper";
    app.freeKickData.MFM = app.freeKickData.MFM || {};
    app.freeKickData.MFM.Ayo = Math.max(app.freeKickData.MFM.Ayo || 0, 3);
    app.freeKickData["WINNERS Team"] = app.freeKickData["WINNERS Team"] || {};
    app.freeKickData["WINNERS Team"].Origi = Math.max(app.freeKickData["WINNERS Team"].Origi || 0, 2);
  }
  function playerStatExtra(name) {
    name = canonPlayer(name);
    var t = (challengePlayerData().playerTotals || {})[name];
    if (!t) return null;
    var ex = { teams: t.teams || {}, records: [] };
    var extras = t.extras || {};
    Object.keys(extras).forEach(function (key) { ex[key] = extras[key]; });
    (t.records || []).forEach(function (r) {
      if (r.kind !== "goals" && r.kind !== "assists") ex.records.push(r);
    });
    return ex;
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
    name = canonPlayer(name);
    var cd = challengeData();
    return mergeExtra(mergeExtra(mergeExtra((cd.playerExtras || {})[name], (cd.playerCorrections || {})[name]), playerStatExtra(name)), manualPlayerExtra(name));
  }
  function playerExtraKeys() {
    var cd = challengeData();
    var pd = challengePlayerData();
    var keys = {};
    Object.keys(cd.playerExtras || {}).forEach(function (name) { keys[canonPlayer(name)] = 1; });
    Object.keys(cd.playerCorrections || {}).forEach(function (name) { keys[canonPlayer(name)] = 1; });
    Object.keys(pd.playerTotals || {}).forEach(function (name) { keys[canonPlayer(name)] = 1; });
    keys.Ayo = 1;
    keys.Origi = 1;
    return Object.keys(keys);
  }
  function extraLine(ex) {
    if (!ex) return "Challenge Place checked";
    var total = (ex.ownGoals || 0) + (ex.yellowCards || 0) + (ex.redCards || 0) + (ex.deadBallGoals || 0);
    if (total > 0) return "OG " + (ex.ownGoals || 0) + " · YC " + (ex.yellowCards || 0) + " · RC " + (ex.redCards || 0) + " · FK " + (ex.deadBallGoals || 0);
    var teams = Object.keys(ex.teams || {});
    return teams.length ? "Challenge roster: " + teams.join(" / ") : "Challenge Place checked";
  }
  function playerXgEstimate(player, ex) {
    var goals = Number((player && player.goals) || 0);
    var dead = Number((ex && ex.deadBallGoals) || 0);
    var pens = Number((ex && ex.penaltyGoals) || 0);
    return Math.max(0, (goals * 0.78) + (dead * 0.07) + (pens * 0.01)).toFixed(1);
  }
  function addRosterName(rosters, team, name) {
    if (!team || !name) return;
    name = canonPlayer(name);
    rosters[team] = rosters[team] || [];
    if (rosters[team].indexOf(name) < 0) rosters[team].push(name);
  }
  function ensurePlayer(idx, name, team) {
    name = canonPlayer(name);
    if (!idx[name]) idx[name] = {
      name: name, recs: [], goals: 0, assists: 0, seasons: {}, comps: {},
      teams: {}, nSeasons: 0, nComps: 0, nTeams: 1, peak: 0, mainTeam: team
    };
    idx[name].teams[team] = 1;
    if (!idx[name].mainTeam) idx[name].mainTeam = team;
    return idx[name];
  }
  function recordExists(player, rec) {
    var comp = String(rec.competition || "").toLowerCase();
    return (player.recs || []).some(function (r) {
      return String(r.season || "").toLowerCase() === comp && r.team === rec.team && r.kind === rec.kind && Number(r.val || 0) === Number(rec.val || 0);
    });
  }
  function addChallengePlayerStats(app) {
    var totals = challengePlayerData().playerTotals || {};
    Object.keys(totals).forEach(function (rawName) {
      var name = canonPlayer(rawName);
      var t = totals[rawName];
      var teams = Object.keys(t.teams || {});
      var player = ensurePlayer(app.players, name, teams[0] || "Unlisted");
      (t.records || []).forEach(function (rec) {
        if (rec.kind !== "goals" && rec.kind !== "assists") return;
        if (recordExists(player, rec)) return;
        player.recs.push({
          team: rec.team, val: rec.val, season: rec.competition, short: rec.competition,
          league: "Challenge Place", order: 1000, kind: rec.kind
        });
        if (rec.kind === "goals") {
          player.goals = (player.goals || 0) + rec.val;
          player.seasons[rec.competition] = (player.seasons[rec.competition] || 0) + rec.val;
        } else {
          player.assists = (player.assists || 0) + rec.val;
        }
        player.comps["Challenge Place"] = 1;
        player.teams[rec.team] = 1;
      });
    });
  }
  function applyManualPlayerStats(app) {
    var ayo = ensurePlayer(app.players, "Ayo", "MFM");
    var missingAyoGoals = Math.max(0, 3 - Number(ayo.goals || 0));
    if (missingAyoGoals > 0) {
      ayo.recs.push({
        team: "MFM", val: missingAyoGoals, season: "Manual free-kick record", short: "Manual record",
        league: "Challenge Place", order: 1001, kind: "goals"
      });
      ayo.goals = (ayo.goals || 0) + missingAyoGoals;
      ayo.seasons["Manual free-kick record"] = (ayo.seasons["Manual free-kick record"] || 0) + missingAyoGoals;
      ayo.comps["Challenge Place"] = 1;
      ayo.teams.MFM = 1;
    }
  }
  function refreshPlayerMeta(players) {
    Object.values(players).forEach(function (p) {
      p.nSeasons = Object.keys(p.seasons || {}).length;
      p.nComps = Object.keys(p.comps || {}).length;
      p.nTeams = Object.keys(p.teams || {}).length;
      p.peak = Math.max.apply(null, [0].concat(Object.values(p.seasons || {})));
      var tg = {};
      (p.recs || []).forEach(function (r) {
        if (r.kind === "goals") tg[r.team] = (tg[r.team] || 0) + r.val;
      });
      p.mainTeam = Object.keys(tg).sort(function (a, b) { return tg[b] - tg[a]; })[0] || p.mainTeam;
    });
  }

  var origBuildPlayers = proto.buildPlayers;
  proto.buildPlayers = function () {
    applyManualRecords(this);
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
    addChallengePlayerStats(this);
    applyManualPlayerStats(this);
    refreshPlayerMeta(this.players);
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
          { label: "Challenge teams", val: Object.keys(ex.teams || {}).join(" / ") || "Unlisted" },
          { label: "xG estimate", val: playerXgEstimate(this.players[this.state.playerSel] || {}, ex) }
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

  function canonTeam(team) {
    var t = String(team || "").trim();
    if (t === "Fly Eagles") return "Fc Eagles";
    return t;
  }
  function seasonSort(a, b) {
    return String(b).localeCompare(String(a), undefined, { numeric: true });
  }
  function gwSort(a, b) {
    var na = Number(String(a).replace(/\D+/g, "")) || 999;
    var nb = Number(String(b).replace(/\D+/g, "")) || 999;
    return na - nb || String(a).localeCompare(String(b));
  }
  function uniqueOptions(values, sorter) {
    var seen = {};
    return values.filter(function (v) {
      if (!v || seen[v]) return false;
      seen[v] = 1;
      return true;
    }).sort(sorter || function (a, b) { return String(a).localeCompare(String(b)); }).map(function (v) {
      return { value: v, label: teamLabel(v) };
    });
  }
  function currentFixtures() {
    var teams = ["Fc Eagles", "Dynamo FC", "MFM", "Royal FC", "Kings FC", "Future Stars", "Golden Stars"];
    var rounds = roundRobin(teams);
    var rows = [];
    rounds.concat(reverseRounds(rounds)).forEach(function (round, idx) {
      var gw = idx + 1;
      var start = addDays(new Date(2026, 8, 5), (gw - 1) * 7 + (gw > 3 ? 14 : 0) + (gw > 6 ? 14 : 0));
      round.forEach(function (pair, matchIdx) {
        var slot = matchSlot(start, matchIdx);
        rows.push({
          id: "current:2026-27:gw" + gw + ":" + matchIdx,
          competition: "Lega League",
          sourceCompetition: "2026/27 fixtures",
          season: "2026/27",
          gameweek: "GW" + gw,
          date: slot.date,
          time: slot.time,
          home: pair[0],
          away: pair[1],
          hs: null,
          as: null,
          status: "fixture",
          raw: ""
        });
      });
    });
    return rows.concat(legaCupFixtures());
  }
  function roundRobin(sourceTeams) {
    var teams = sourceTeams.slice();
    if (teams.length % 2) teams.push("BYE");
    var rounds = [];
    var n = teams.length;
    for (var r = 0; r < n - 1; r++) {
      var pairs = [];
      for (var i = 0; i < n / 2; i++) {
        var a = teams[i], b = teams[n - 1 - i];
        if (a !== "BYE" && b !== "BYE") pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      teams.splice(1, 0, teams.pop());
    }
    return rounds;
  }
  function reverseRounds(rounds) {
    return rounds.map(function (round) { return round.map(function (p) { return [p[1], p[0]]; }); });
  }
  function addDays(date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }
  function matchSlot(start, idx) {
    var slots = [
      { offset: 0, time: "16:00" },
      { offset: 1, time: "15:00" },
      { offset: 1, time: "15:00" }
    ];
    var slot = slots[idx % slots.length];
    var d = addDays(start, slot.offset);
    return { date: shortDate(d), time: slot.time };
  }
  function shortDate(d) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  }
  function legaCupFixtures() {
    return [
      ["Cup QF", "Sat 26 Sep", "16:00", "Dynamo FC", "Royal FC"],
      ["Cup QF", "Sun 27 Sep", "15:00", "Golden Stars", "Kings FC"],
      ["Cup QF", "Sun 27 Sep", "15:00", "MFM", "Future Stars"],
      ["Cup SF", "Sat 31 Oct", "16:00", "Winner QF1", "Fly Eagles"],
      ["Cup SF", "Sun 1 Nov", "15:00", "Winner QF2", "Winner QF3"],
      ["Cup Final", "Sun 10 Jan", "15:00", "Winner SF1", "Winner SF2"]
    ].map(function (r, idx) {
      return {
        id: "current:lega-cup:2026-27:" + idx,
        competition: "Lega Cup",
        sourceCompetition: "2026/27 fixtures",
        season: "2026/27",
        gameweek: r[0],
        date: r[1],
        time: r[2],
        home: canonTeam(r[3]),
        away: canonTeam(r[4]),
        hs: null,
        as: null,
        status: "fixture",
        raw: ""
      };
    });
  }
  function archiveRows(app) {
    var rows = [];
    (app.archive || []).forEach(function (L) {
      (L.seasons || []).forEach(function (s) {
        if (s.allTime) return;
        var comp = L.name;
        var season = s.name || s.short || "Archive";
        var gw = s.short || "Archive";
        function addPlayed(kind, m, idx) {
          rows.push({
            id: "archive:" + comp + ":" + season + ":" + kind + ":" + idx,
            competition: comp,
            sourceCompetition: season,
            season: season,
            gameweek: kind === "matches" && comp === "Lega League" ? "GW" + (idx + 1) : gw,
            date: s.short || "",
            home: m[0],
            hs: Number(m[1]),
            away: m[2],
            as: Number(m[3]),
            status: "played",
            raw: ""
          });
        }
        (s.matches || []).forEach(function (m, idx) { addPlayed("matches", m, idx); });
        (s.knockout || []).forEach(function (m, idx) { addPlayed("knockout", m, idx); });
        if (s.final) addPlayed("final", s.final, 0);
        (s.fixtures || []).forEach(function (f, idx) {
          rows.push({
            id: "archive:" + comp + ":" + season + ":fixture:" + idx,
            competition: comp,
            sourceCompetition: season,
            season: season,
            gameweek: gw,
            date: s.short || "",
            home: f[0],
            away: f[1],
            hs: null,
            as: null,
            status: "fixture",
            raw: ""
          });
        });
      });
    });
    return rows;
  }
  proto.allMatchRows = function () {
    var cp = (challengeMatchData().matches || []).map(function (m) {
      return Object.assign({}, m, {
        home: canonTeam(m.home),
        away: canonTeam(m.away),
        gameweek: String(m.gameweek || "").replace(/^MW/i, "GW") || "Archive"
      });
    });
    return currentFixtures().concat(archiveRows(this)).concat(cp);
  };
  function numericRows(rows) {
    return rows.filter(function (m) {
      return m.home && m.away && m.hs != null && m.as != null && !isNaN(Number(m.hs)) && !isNaN(Number(m.as));
    });
  }
  function h2hFromRows(rows, a, b) {
    a = canonTeam(a); b = canonTeam(b);
    var out = { aWins: 0, bWins: 0, draws: 0, played: 0, aGoals: 0, bGoals: 0 };
    numericRows(rows).forEach(function (m) {
      var home = canonTeam(m.home), away = canonTeam(m.away);
      if (!((home === a && away === b) || (home === b && away === a))) return;
      var ag = home === a ? Number(m.hs) : Number(m.as);
      var bg = home === a ? Number(m.as) : Number(m.hs);
      out.played += 1;
      out.aGoals += ag;
      out.bGoals += bg;
      if (ag > bg) out.aWins += 1;
      else if (bg > ag) out.bWins += 1;
      else out.draws += 1;
    });
    return out;
  }
  function teamRecord(rows, team) {
    team = canonTeam(team);
    var rec = { p: 0, w: 0, d: 0, l: 0 };
    numericRows(rows).forEach(function (m) {
      var home = canonTeam(m.home), away = canonTeam(m.away);
      if (home !== team && away !== team) return;
      var gf = home === team ? Number(m.hs) : Number(m.as);
      var ga = home === team ? Number(m.as) : Number(m.hs);
      rec.p += 1;
      if (gf > ga) rec.w += 1;
      else if (gf === ga) rec.d += 1;
      else rec.l += 1;
    });
    return rec;
  }
  function teamRecordByCompetition(rows, team) {
    team = canonTeam(team);
    var out = {};
    numericRows(rows).forEach(function (m) {
      var home = canonTeam(m.home), away = canonTeam(m.away);
      if (home !== team && away !== team) return;
      var key = m.competition || "Archive";
      var rec = out[key] || (out[key] = { competition: key, p: 0, w: 0, d: 0, l: 0 });
      var gf = home === team ? Number(m.hs) : Number(m.as);
      var ga = home === team ? Number(m.as) : Number(m.hs);
      rec.p += 1;
      if (gf > ga) rec.w += 1;
      else if (gf === ga) rec.d += 1;
      else rec.l += 1;
    });
    return Object.keys(out).sort().map(function (k) { return out[k]; });
  }
  function displayDateAndTime(m) {
    var date = String(m.date || m.sourceCompetition || "");
    var time = String(m.time || "");
    var parts = date.match(/^(.*?)(\d{1,2}:\d{2})(?:\s*(AM|PM))?(.*)$/i);
    if (!time && parts) {
      date = (parts[1] + (parts[4] || "")).replace(/\s+/g, " ").trim();
      time = parts[2] + (parts[3] ? " " + parts[3].toUpperCase() : "");
    }
    return { date: date || "Date TBC", time: time || "" };
  }
  proto.matchesVals = function () {
    var self = this;
    var all = this.allMatchRows();
    var comps = uniqueOptions(all.map(function (m) { return m.competition; }));
    var seasons = uniqueOptions(all.map(function (m) { return m.season; }), seasonSort);
    var weeks = uniqueOptions(all.map(function (m) { return m.gameweek; }), gwSort);
    var teams = uniqueOptions(all.reduce(function (arr, m) {
      if (m.home) arr.push(m.home);
      if (m.away) arr.push(m.away);
      return arr;
    }, []));
    var comp = this.state.matchComp || "";
    var season = this.state.matchSeason || "";
    var gw = this.state.matchGw || "";
    var team = canonTeam(this.state.matchTeam || "");
    var filtered = all.filter(function (m) {
      if (comp && m.competition !== comp) return false;
      if (season && m.season !== season) return false;
      if (gw && m.gameweek !== gw) return false;
      if (team && canonTeam(m.home) !== team && canonTeam(m.away) !== team) return false;
      return true;
    });
    var played = numericRows(filtered);
    var goals = played.reduce(function (n, m) { return n + Number(m.hs) + Number(m.as); }, 0);
    var rawCount = filtered.filter(function (m) { return !m.home || !m.away || /raw|walkover/i.test(m.status || ""); }).length;
    var teamValues = teams.map(function (o) { return o.value; });
    var defaultA = teamValues.indexOf("Golden Stars") >= 0 ? "Golden Stars" : (teams[0] ? teams[0].value : "Golden Stars");
    var defaultB = teamValues.indexOf("Dynamo FC") >= 0 ? "Dynamo FC" : (teams[1] ? teams[1].value : "Dynamo FC");
    var matchA = canonTeam(this.state.matchA || defaultA);
    var matchB = canonTeam(this.state.matchB || defaultB);
    if (matchA === matchB && teams.length > 1) matchB = teams[1].value === matchA ? teams[0].value : teams[1].value;
    var hh = h2hFromRows(all, matchA, matchB);
    var recTeam = team || matchA || defaultA;
    var rec = teamRecord(all, recTeam);
    var compRecords = teamRecordByCompetition(all, recTeam);
    return {
      matchComp: comp,
      matchSeason: season,
      matchGw: gw,
      matchTeam: team,
      matchA: matchA,
      matchB: matchB,
      matchCompOptions: comps,
      matchSeasonOptions: seasons,
      matchGwOptions: weeks,
      matchTeamOptions: teams,
      matchShown: String(filtered.length),
      matchPlayed: String(played.length),
      matchGoals: String(goals),
      matchRaw: String(rawCount),
      matchRows: filtered.slice(0, 140).map(function (m) {
        var isPlayed = m.hs != null && m.as != null && m.home && m.away;
        var status = isPlayed ? "Played" : (m.status === "fixture" ? "Fixture" : "Recorded");
        var rawOnly = !m.home || !m.away;
        var dt = displayDateAndTime(m);
        return {
          homeLabel: rawOnly ? "Recorded result note" : teamLabel(m.home),
          awayLabel: rawOnly ? "" : teamLabel(m.away),
          homeBadge: rawOnly ? "Lega World" : teamLabel(m.home),
          awayBadge: rawOnly ? "Lega World" : teamLabel(m.away),
          score: isPlayed ? (m.hs + "-" + m.as) : (rawOnly ? "" : "vs"),
          displayDate: dt.date,
          time: dt.time,
          rawLine: rawOnly || /raw|walkover/i.test(m.status || "") ? String(m.raw || "").replace(/walkover/ig, "awarded result") : "",
          competition: m.competition || "Archive",
          season: m.season || "Archive",
          gameweek: m.gameweek || "Archive",
          status: status,
          statusBg: status === "Played" ? "#E6F4F1" : (status === "Fixture" ? "#FFF4D6" : "#FDE8ED"),
          statusColor: status === "Played" ? "#067C7C" : (status === "Fixture" ? "#8A5A00" : "#C03048")
        };
      }),
      matchNoRows: filtered.length === 0,
      onMatchComp: function (e) { self.setState({ matchComp: e.target.value }); },
      onMatchSeason: function (e) { self.setState({ matchSeason: e.target.value }); },
      onMatchGw: function (e) { self.setState({ matchGw: e.target.value }); },
      onMatchTeam: function (e) { self.setState({ matchTeam: e.target.value }); },
      onMatchA: function (e) { self.setState({ matchA: e.target.value }); },
      onMatchB: function (e) { self.setState({ matchB: e.target.value }); },
      matchAWins: String(hh.aWins),
      matchBWins: String(hh.bWins),
      matchDraws: String(hh.draws),
      matchH2HPlayed: String(hh.played),
      matchAGoals: String(hh.aGoals),
      matchBGoals: String(hh.bGoals),
      matchALabel: teamLabel(matchA),
      matchBLabel: teamLabel(matchB),
      matchRecordTeam: teamLabel(recTeam),
      matchTeamPlayed: String(rec.p),
      matchTeamWins: String(rec.w),
      matchTeamDraws: String(rec.d),
      matchTeamLosses: String(rec.l),
      matchCompRecordRows: compRecords,
      darkSelectStyle: "width:100%;font-size:14px;font-weight:800;padding:12px 14px;border:1px solid rgba(255,255,255,.28);border-radius:12px;background:#310039;color:#fff;"
    };
  };
  var origTeamH2H = proto.teamH2H;
  proto.teamH2H = function (a, b) {
    var hh = h2hFromRows(this.allMatchRows ? this.allMatchRows() : [], a, b);
    if (hh.played > 0) {
      return { aWins: hh.aWins, bWins: hh.bWins, draws: hh.draws, played: hh.played, aGoals: hh.aGoals, bGoals: hh.bGoals };
    }
    return origTeamH2H.call(this, a, b);
  };
  var origStatsVals = proto.statsVals;
  proto.statsVals = function () {
    var o = origStatsVals.call(this);
    if (o.sRecCards && !o.sRecCards.some(function (r) { return r.label === "Most awarded-result wins"; })) {
      o.sRecCards = o.sRecCards.concat([
        { big: "Archive", label: "Most awarded-result wins", sub: "Tracked internally from Challenge Place result notes" }
      ]);
    }
    return o;
  };
  var origRenderVals = proto.renderVals;
  proto.renderVals = function () {
    var o = origRenderVals.call(this);
    var v = this.state.view;
    var navDef = [["home", "Home"], ["competitions", "Competitions"], ["matches", "Matches"], ["table", "Table"], ["players", "Players"], ["clubs", "Teams"], ["transfers", "Transfers"], ["stats", "Statistics"], ["news", "News"], ["learning", "Learning"]];
    o.navItems = navDef.map(function (n) {
      var on = v === n[0] || (n[0] === "competitions" && v === "competition");
      return {
        label: n[1],
        go: function () { this.setState({ mobileMenuOpen: false }); this.go(n[0]); }.bind(this),
        style: "cursor:pointer;padding:8px 12px;border-radius:999px;font-weight:" + (on ? 700 : 600) + ";font-size:13px;white-space:nowrap;color:" + (on ? "#fff" : "#5C5470") + ";background:" + (on ? "#48246C" : "transparent") + ";transition:background .2s;"
      };
    }, this);
    o.isMatches = v === "matches";
    o.goMatches = function () { this.go("matches"); }.bind(this);
    o.mobileMenuOpen = !!this.state.mobileMenuOpen;
    o.toggleMobileMenu = function () { this.setState({ mobileMenuOpen: !this.state.mobileMenuOpen }); }.bind(this);
    o.closeMobileMenu = function () { this.setState({ mobileMenuOpen: false }); }.bind(this);
    o.heroFixtures = currentFixtures().filter(function (m) {
      return m.competition === "Lega League" && m.season === "2026/27" && m.gameweek === "GW1";
    }).map(function (m) {
      return { home: teamLabel(m.home), away: teamLabel(m.away), date: m.date, time: m.time };
    });
    return Object.assign(o, this.matchesVals());
  };

  /* ---- 2. route submissions to Supabase ---- */
  function configured() { return !!(window.LEGA_configured && window.LEGA_configured()); }

  proto.submitReg = function () {
    var f = this.state.regForm, self = this;
    if (!f.team || !f.email) { this.setState({ flash: "Add your team name and a contact email." }); return; }
    var players = String(f.players || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var playerPhotos = String(f.playerPhotos || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    function reset(msg) {
      self.setState({ regForm: { team: "", manager: "", state: "Lagos", email: "", squad: "", colours: "", comp: "Lega League", players: "", playerPhotos: "" }, flash: msg });
    }
    if (configured()) {
      var squadNotes = f.squad || "";
      if (playerPhotos.length) squadNotes += (squadNotes ? "\n\n" : "") + "Player profile/photo links:\n" + playerPhotos.join("\n");
      window.LEGA_db.insert("registrations", {
        team: f.team, manager: f.manager, state: f.state, email: f.email,
        colours: f.colours, comp: f.comp, squad: squadNotes, players: players
      }).then(function () { reset("Registration received — the Lega World team will review your squad."); })
        .catch(function (e) { self.setState({ flash: "Could not submit right now: " + e.message }); });
    } else {
      var rec = Object.assign({ status: "Pending review", player_photos: playerPhotos }, f); var pr = [rec].concat(self.state.pendR);
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
