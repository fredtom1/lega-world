/* =====================================================================
   coach.js — Lega World coach / team-owner portal.

   Sign up / sign in (Supabase Auth) -> request a team -> (admin approves)
   -> manage your own squad (team_players, row-secured) and run transfers
   (request a player; accept/reject incoming offers via SECURITY DEFINER
   RPCs). A coach can only ever touch their own team — enforced by the
   database, not the UI.
   ===================================================================== */
(function () {
  "use strict";
  var root = document.getElementById("coach");
  var TEAM = null;          // active coach's team
  var tab = "team";

  /* ---- helpers ---- */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function field(label, inputEl) { return el("div", null, [el("label", { class: "fl" }, [label]), inputEl]); }
  function btn(label, onclick, variant) { return el("button", { class: "pill " + (variant || "teal") + " sm", onclick: onclick }, [label]); }
  function toast(msg, bad) {
    var t = document.getElementById("toast"); t.textContent = msg; t.style.background = bad ? "#C0392B" : "#067C7C";
    t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }
  function header(extra) {
    var bar = el("div", { class: "bar" }, [
      el("span", { class: "brand" }, [el("img", { src: "assets/logo/lega-world-logo-reverse.svg", alt: "" }),
        el("span", null, [el("span", { class: "a" }, ["LEGA"]), el("span", { class: "b" }, ["WORLD"])]),
        el("span", { style: "font-weight:600;color:#90C0E4;font-size:13px;margin-left:6px" }, ["Coach"])]),
      el("span", { class: "spacer" }),
      el("a", { class: "pill ghost sm", href: "index.html", target: "_blank" }, ["View site ↗"])
    ]);
    (extra || []).forEach(function (e) { bar.appendChild(e); });
    return el("header", null, [el("div", { class: "wrap" }, [bar])]);
  }
  function shell(headerExtra, body) { root.innerHTML = ""; root.appendChild(header(headerExtra)); root.appendChild(el("main", null, [el("div", { class: "wrap" }, [body])])); }

  /* ---- known teams / players (live team_players, else seed) ---- */
  function rosterSource() {
    return window.LEGA_squads.listAll().then(function (rows) {
      if (rows && rows.length) {
        var teams = {}, players = [];
        rows.forEach(function (r) { teams[r.team] = 1; players.push({ name: r.name, team: r.team }); });
        return { teams: Object.keys(teams).sort(), players: players };
      }
      var ros = (window.LEGA_SEED && window.LEGA_SEED.rosters) || {};
      var ts = Object.keys(ros).sort(), ps = [];
      ts.forEach(function (t) { (ros[t] || []).forEach(function (n) { ps.push({ name: n, team: t }); }); });
      return { teams: ts, players: ps };
    }).catch(function () { return { teams: [], players: [] }; });
  }

  /* ---- boot ---- */
  init();
  async function init() {
    if (!window.LEGA_configured || !window.LEGA_configured()) { shell([], needsConfig()); return; }
    var session = await window.LEGA_auth.session();
    if (session) routeSignedIn(); else showAuth();
  }
  function needsConfig() {
    return el("div", { class: "card", style: "margin-top:24px" }, [
      el("h2", null, ["Not available yet"]),
      el("p", { class: "sub" }, ["The coach portal needs the site's Supabase connection (config.js) — ask the league office."])
    ]);
  }

  /* ---- auth ---- */
  function showAuth() {
    var mode = { v: "in" };
    var email = el("input", { class: "f", type: "email", placeholder: "you@club.com" });
    var pass = el("input", { class: "f", type: "password", placeholder: "••••••••" });
    var msg = el("div", { class: "err" });
    var cta = el("button", { class: "pill teal", style: "width:100%;justify-content:center" });
    var seg = el("div", { class: "seg" }, [
      el("button", { class: "active", onclick: function () { setMode("in"); } }, ["Sign in"]),
      el("button", { onclick: function () { setMode("up"); } }, ["Create account"])
    ]);
    function setMode(m) { mode.v = m; seg.children[0].className = m === "in" ? "active" : ""; seg.children[1].className = m === "up" ? "active" : ""; cta.textContent = m === "in" ? "Sign in" : "Create account"; msg.className = "err"; msg.textContent = ""; }
    setMode("in");
    cta.addEventListener("click", function () {
      msg.className = "err"; msg.textContent = "";
      var e = email.value.trim(), p = pass.value;
      if (!e || !p) { msg.textContent = "Enter your email and password."; return; }
      if (mode.v === "in") {
        window.LEGA_auth.signIn(e, p).then(function (r) { if (r.error) msg.textContent = r.error.message; else routeSignedIn(); });
      } else {
        window.LEGA_auth.signUp(e, p).then(function (r) {
          if (r.error) { msg.textContent = r.error.message; return; }
          if (r.data && r.data.session) routeSignedIn();
          else { msg.className = "ok"; msg.textContent = "Account created. Check your email to confirm, then sign in."; setMode("in"); }
        });
      }
    });
    pass.addEventListener("keydown", function (ev) { if (ev.key === "Enter") cta.click(); });
    shell([], el("div", { class: "login card" }, [
      el("h2", null, ["Coach / team owner"]),
      el("p", { class: "sub" }, ["Sign in to manage your squad and transfers. New here? Create an account and request your team."]),
      seg, field("Email", email), el("div", { style: "height:10px" }), field("Password", pass), msg, el("div", { style: "height:6px" }), cta
    ]));
  }
  function signOut() { window.LEGA_auth.signOut().then(showAuth); }

  /* ---- route after sign-in: needs a coach row + active status ---- */
  async function routeSignedIn() {
    var row = null;
    try { row = await window.LEGA_coach.myRow(); } catch (e) {}
    if (!row) { showRequestTeam(); return; }
    if (row.status === "active") { TEAM = row.team; if (window.LEGA_profile) window.LEGA_profile.upsert("coach").catch(function(){}); showPortal(); return; }
    if (row.status === "rejected") { shell([signOutBtn()], statusCard("Access declined", "The league office didn't approve this account for " + (row.team || "a team") + ". Contact them if you think this is a mistake.")); return; }
    shell([signOutBtn()], statusCard("Awaiting approval", "Your request to manage " + (row.team || "your team") + " is pending. The league office will activate your access shortly. Refresh this page after they approve."));
  }
  function signOutBtn() { return el("button", { class: "pill ghost sm", onclick: signOut }, ["Sign out"]); }
  function statusCard(title, body) { return el("div", { class: "card", style: "margin-top:24px;max-width:560px" }, [el("h2", null, [title]), el("p", { class: "sub", style: "margin:0" }, [body])]); }

  async function showRequestTeam() {
    var src = await rosterSource();
    var user = await window.LEGA_auth.user();
    var sel = el("select", { class: "f" }, [el("option", { value: "" }, ["— choose your team —"])].concat(src.teams.map(function (t) { return el("option", { value: t }, [t]); })));
    var other = el("input", { class: "f", placeholder: "…or type a new team name" });
    var msg = el("div", { class: "err" });
    shell([signOutBtn()], el("div", { class: "card", style: "margin-top:24px;max-width:560px" }, [
      el("h2", null, ["Request your team"]),
      el("p", { class: "sub" }, ["Pick the club you manage. The league office confirms it before you get access."]),
      field("Team", sel), el("div", { style: "height:10px" }), field("Or new team", other), msg, el("div", { style: "height:8px" }),
      el("button", { class: "pill teal", onclick: function () {
        var team = (other.value.trim() || sel.value).trim();
        if (!team) { msg.textContent = "Pick or type your team."; return; }
        window.LEGA_coach.requestTeam(team, user && user.email).then(function () { routeSignedIn(); })
          .catch(function (e) { msg.textContent = e.message; });
      } }, ["Request access"])
    ]));
  }

  /* ---- the portal (active coach) ---- */
  function showPortal() {
    var body = el("div", { id: "portalBody" });
    var seg = el("div", { class: "seg" }, [
      el("button", { class: tab === "team" ? "active" : "", onclick: function () { tab = "team"; mark(); paint(); } }, ["My Team"]),
      el("button", { class: tab === "tx" ? "active" : "", onclick: function () { tab = "tx"; mark(); paint(); } }, ["Transfers"])
    ]);
    function mark() { seg.children[0].className = tab === "team" ? "active" : ""; seg.children[1].className = tab === "tx" ? "active" : ""; }
    shell([el("span", { style: "color:#90C0E4;font-weight:700;font-size:13px" }, [TEAM]), signOutBtn()],
      el("div", null, [seg, body]));
    function paint() { body.innerHTML = ""; body.appendChild(tab === "team" ? myTeamCard() : transfersCard()); }
    window.__paint = paint; paint();
  }

  function myTeamCard() {
    var card = el("div", { class: "card" }, [el("h2", null, ["Your squad"]), el("p", { class: "sub" }, ["Add or remove your players. Changes are live immediately. You can only edit " + TEAM + "."])]);
    var listWrap = el("div");
    var addIn = el("input", { class: "f", placeholder: "New player name", style: "flex:1;min-width:180px" });
    card.appendChild(el("div", { class: "row", style: "margin-bottom:14px" }, [addIn, btn("+ Add player", function () {
      var nm = addIn.value.trim(); if (!nm) return;
      window.LEGA_squads.add(TEAM, nm).then(function () { toast("Added"); addIn.value = ""; load(); }).catch(function (e) { toast(e.message, true); });
    }, "gold")]));
    card.appendChild(listWrap);
    function load() {
      listWrap.innerHTML = ""; listWrap.appendChild(el("div", { class: "muted" }, ["Loading…"]));
      window.LEGA_squads.list(TEAM).then(function (rows) {
        listWrap.innerHTML = "";
        if (!rows.length) { listWrap.appendChild(el("div", { class: "muted" }, ["No players yet — add your squad above."])); return; }
        listWrap.appendChild(el("div", { class: "muted", style: "margin-bottom:8px" }, [rows.length + " players"]));
        var grid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px" });
        rows.forEach(function (p) {
          grid.appendChild(el("div", { class: "row", style: "justify-content:space-between;background:#FBFCFD;border:1px solid #EEF4F4;border-radius:10px;padding:8px 12px" }, [
            el("span", { style: "font-weight:600;font-size:14px" }, [p.name]),
            el("button", { class: "x", onclick: function () { window.LEGA_squads.remove(p.id).then(function () { load(); }).catch(function (e) { toast(e.message, true); }); } }, ["✕"])
          ]));
        });
        listWrap.appendChild(grid);
      }).catch(function (e) { listWrap.innerHTML = ""; listWrap.appendChild(el("div", { class: "muted" }, ["Couldn't load: " + e.message])); });
    }
    load();
    return card;
  }

  function transfersCard() {
    var box = el("div");
    // --- make an offer ---
    var offer = el("div", { class: "card" }, [el("h2", null, ["Make an offer"]), el("p", { class: "sub" }, ["Request a player from another club. Their coach must accept before the move happens."])]);
    var playerSel = el("select", { class: "f", style: "flex:2;min-width:200px" }, [el("option", { value: "" }, ["Loading players…"])]);
    var typeSel = el("select", { class: "f", style: "width:150px" }, ["Permanent", "Loan", "Free transfer"].map(function (t) { return el("option", { value: t }, [t]); }));
    var feeIn = el("input", { class: "f", type: "number", min: "0", placeholder: "0", style: "width:140px" });
    var seasonsIn = el("input", { class: "f", type: "number", min: "1", value: "1", style: "width:110px" });
    var emailIn = el("input", { class: "f", type: "email", placeholder: "player@email.com", style: "min-width:220px;flex:1" });
    var offerMsg = el("div", { class: "muted" });
    rosterSource().then(function (src) {
      var others = src.players.filter(function (p) { return p.team !== TEAM; });
      var byTeam = {}; others.forEach(function (p) { (byTeam[p.team] = byTeam[p.team] || []).push(p); });
      playerSel.innerHTML = "";
      playerSel.appendChild(el("option", { value: "" }, ["— choose a player —"]));
      Object.keys(byTeam).sort().forEach(function (t) {
        var og = el("optgroup", { label: t });
        byTeam[t].forEach(function (p) { og.appendChild(el("option", { value: p.name + "|||" + p.team }, [p.name + " (" + t + ")"])); });
        playerSel.appendChild(og);
      });
    });
    offer.appendChild(el("div", { class: "row", style: "align-items:flex-end" }, [
      el("div", { style: "flex:2;min-width:200px" }, [el("label", { class: "fl" }, ["Player"]), playerSel]),
      el("div", null, [el("label", { class: "fl" }, ["Type"]), typeSel]),
      el("div", null, [el("label", { class: "fl" }, ["Fee"]), feeIn]),
      el("div", null, [el("label", { class: "fl" }, ["Seasons"]), seasonsIn]),
      el("div", { style: "flex:1;min-width:220px" }, [el("label", { class: "fl" }, ["Player email"]), emailIn]),
      btn("Submit offer", function () {
        if (!playerSel.value) { offerMsg.textContent = "Choose a player."; return; }
        if (!emailIn.value.trim()) { offerMsg.textContent = "Add the player's email so the contract can be sent."; return; }
        var parts = playerSel.value.split("|||"), player = parts[0], from = parts[1];
        offerMsg.textContent = "Submitting…";
        var submit = window.LEGA_transfers.requestContract || window.LEGA_transfers.request;
        submit(player, from, TEAM, typeSel.value, feeIn.value, emailIn.value.trim(), seasonsIn.value).then(function () {
          offerMsg.textContent = ""; toast("Offer sent to " + from); if (window.__paint) window.__paint();
        }).catch(function (e) { offerMsg.textContent = e.message; });
      }, "gold")
    ]));
    offer.appendChild(offerMsg);
    box.appendChild(offer);

    // --- incoming + outgoing ---
    var incoming = el("div", { class: "card" }, [el("h2", null, ["Incoming offers"]), el("p", { class: "sub" }, ["Other clubs bidding for your players. Accept to complete the transfer."]), el("div", { id: "incWrap" }, [el("div", { class: "muted" }, ["Loading…"])])]);
    var outgoing = el("div", { class: "card" }, [el("h2", null, ["Your offers"]), el("p", { class: "sub" }, ["Players you've bid for."]), el("div", { id: "outWrap" }, [el("div", { class: "muted" }, ["Loading…"])])]);
    box.appendChild(incoming); box.appendChild(outgoing);

    window.LEGA_transfers.all().then(function (rows) {
      var inc = rows.filter(function (r) { return r.from_team === TEAM && (r.status === "requested" || r.status === "pending"); });
      var out = rows.filter(function (r) { return r.to_team === TEAM; });
      var iw = incoming.querySelector("#incWrap"); iw.innerHTML = "";
      if (!inc.length) iw.appendChild(el("div", { class: "muted" }, ["No incoming offers."]));
      inc.forEach(function (r) {
        iw.appendChild(el("div", { class: "item" }, [
          el("div", { class: "hd" }, [el("span", { style: "font-weight:700" }, [r.player]), el("span", { class: "badge", style: "background:#E8A91C" }, [r.status])]),
          el("div", { class: "muted", style: "margin:6px 0 10px" }, [TEAM + "  →  " + r.to_team + "   ·   " + (r.type || "Permanent") + "   ·   fee " + (r.fee || 0)]),
          el("div", { class: "row" }, [
            btn("Agree terms", function () { window.LEGA_transfers.accept(r.id).then(function () { toast("Seller agreement sent to player"); if (window.__paint) window.__paint(); }).catch(function (e) { toast(e.message, true); }); }, "teal"),
            el("button", { class: "x", onclick: function () { window.LEGA_transfers.reject(r.id).then(function () { toast("Rejected"); if (window.__paint) window.__paint(); }).catch(function (e) { toast(e.message, true); }); } }, ["Reject"])
          ])
        ]));
      });
      var ow = outgoing.querySelector("#outWrap"); ow.innerHTML = "";
      if (!out.length) ow.appendChild(el("div", { class: "muted" }, ["No offers yet."]));
      out.forEach(function (r) {
        var col = r.status === "applied" ? "#1FA05A" : r.status === "rejected" ? "#C0392B" : "#E8A91C";
        ow.appendChild(el("div", { class: "item" }, [el("div", { class: "hd" }, [
          el("span", { style: "font-weight:700" }, [r.player + "  ", el("span", { class: "muted" }, ["from " + r.from_team])]),
          el("span", { class: "badge", style: "background:" + col }, [r.status])
        ])]));
      });
    }).catch(function (e) {
      incoming.querySelector("#incWrap").textContent = "Couldn't load: " + e.message;
      outgoing.querySelector("#outWrap").textContent = "";
    });

    return box;
  }
})();
