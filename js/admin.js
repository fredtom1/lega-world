/* =====================================================================
   admin.js — Lega World content editor.

   A password-protected (Supabase Auth) editor for the same data the
   public site reads. Friendly forms for the common collections, a
   guided Seasons & Results editor for match/stat updates, and an
   "Advanced (JSON)" tab so every section is editable. Saving upserts
   the section's JSON to the `site_content` table; changes go live for
   everyone with no redeploy.
   ===================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("admin");
  var sb = null;
  var model = {};            // key -> current value
  var current = "rosters";
  var ui = {};               // transient per-section ui state

  /* ---------- tiny DOM helpers ---------- */
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
  function clone(x) { return JSON.parse(JSON.stringify(x == null ? null : x)); }
  function toast(msg, bad) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.style.background = bad ? "#C0392B" : "#067C7C";
    t.classList.add("show"); clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function field(label, inputEl) { return el("div", null, [el("label", { class: "fl" }, [label]), inputEl]); }
  function input(val, oninput, opts) {
    opts = opts || {};
    var n = el(opts.tag || "input", { class: "f", type: opts.type || "text", placeholder: opts.ph || "" });
    if (opts.tag !== "textarea") n.value = val == null ? "" : val; else n.value = val == null ? "" : val;
    n.addEventListener("input", function () { oninput(opts.number ? num(n.value) : n.value); });
    return n;
  }
  function num(v) { if (v === "" || v == null) return ""; var f = parseFloat(v); return isNaN(f) ? v : f; }
  function btn(label, onclick, variant) { return el("button", { class: "pill " + (variant || "teal") + " sm", onclick: onclick }, [label]); }

  /* ---------- boot ---------- */
  init();
  async function init() {
    if (!window.LEGA_configured || !window.LEGA_configured()) { renderNeedsConfig(); return; }
    try { sb = await window.LEGA_supabase(); } catch (e) { sb = null; }
    if (!sb) { renderNeedsConfig(); return; }
    var s = await sb.auth.getSession();
    if (s && s.data && s.data.session) showApp(); else showLogin();
  }

  function renderNeedsConfig() {
    root.innerHTML = "";
    root.appendChild(header(false));
    root.appendChild(el("div", { class: "wrap" }, [
      el("div", { class: "card", style: "margin-top:24px" }, [
        el("h2", null, ["Supabase isn't configured yet"]),
        el("p", { class: "sub" }, ["The admin editor needs a free Supabase database. The public website still works without it (it uses the built-in default data)."]),
        el("ol", { class: "muted", style: "line-height:1.9" }, [
          el("li", { html: "Create a free project at <a href='https://supabase.com' target='_blank'>supabase.com</a>." }),
          el("li", { html: "Open <b>SQL Editor</b> and run the contents of <code>supabase-setup.sql</code>." }),
          el("li", { html: "<b>Authentication → Users → Add user</b>: create your admin email + password." }),
          el("li", { html: "Paste your Project URL + anon key into <code>config.js</code>." }),
          el("li", { html: "Reload this page, sign in, and click <b>Seed from defaults</b>." })
        ])
      ])
    ]));
  }

  function header(showSignOut) {
    var bar = el("div", { class: "bar" }, [
      el("span", { class: "brand" }, [
        el("img", { src: "assets/logo/lega-world-logo-reverse.svg", alt: "" }),
        el("span", null, [el("span", { class: "a" }, ["LEGA"]), el("span", { class: "b" }, ["WORLD"])]),
        el("span", { style: "font-weight:600;color:#90C0E4;font-size:13px;margin-left:6px" }, ["Admin"])
      ]),
      el("span", { class: "spacer" }),
      el("a", { class: "pill ghost sm", href: "index.html", target: "_blank" }, ["View site ↗"])
    ]);
    if (showSignOut) {
      bar.appendChild(el("button", { class: "pill gold sm", onclick: seedDefaults }, ["Seed from defaults"]));
      bar.appendChild(el("button", { class: "pill ghost sm", onclick: signOut }, ["Sign out"]));
    }
    return el("header", null, [el("div", { class: "wrap" }, [bar])]);
  }

  /* ---------- auth ---------- */
  function showLogin() {
    root.innerHTML = "";
    root.appendChild(header(false));
    var email = el("input", { class: "f", type: "email", placeholder: "you@club.com" });
    var pass = el("input", { class: "f", type: "password", placeholder: "••••••••" });
    var err = el("div", { class: "err" });
    function submit() {
      err.textContent = "";
      sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value }).then(function (r) {
        if (r.error) err.textContent = r.error.message; else showApp();
      });
    }
    pass.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    root.appendChild(el("div", { class: "wrap" }, [
      el("div", { class: "login card" }, [
        el("h2", null, ["Sign in"]),
        el("p", { class: "sub" }, ["Editor access for Lega World content."]),
        field("Email", email),
        el("div", { style: "height:12px" }),
        field("Password", pass),
        err,
        el("div", { style: "height:8px" }),
        el("button", { class: "pill teal", style: "width:100%;justify-content:center", onclick: submit }, ["Sign in"])
      ])
    ]));
  }
  function signOut() { sb.auth.signOut().then(function () { showLogin(); }); }

  /* ---------- app ---------- */
  var SECTIONS = [
    ["rosters", "Teams & Squads"],
    ["archive", "Seasons & Results"],
    ["transfersHistory", "Transfers"],
    ["news", "News"],
    ["bestPlayerByYear", "Best Player"],
    ["ticker", "Ticker"],
    ["competitions", "Competitions"],
    ["clubs2026", "Home Teams"],
    ["learnTracks", "Learning"],
    ["grayCupYellow", "Yellow Cards"],
    ["__advanced", "Advanced (JSON)"]
  ];

  async function showApp() {
    root.innerHTML = "";
    root.appendChild(header(true));
    await loadAll();
    var body = el("main", null, [el("div", { class: "wrap", id: "sectionBody" })]);
    var tabs = el("nav", { class: "tabs" }, [el("div", { class: "wrap" },
      SECTIONS.map(function (s) {
        return el("button", { class: current === s[0] ? "active" : "", onclick: function () { current = s[0]; ui = {}; paint(); markTabs(); } }, [s[1]]);
      })
    )]);
    root.appendChild(tabs); root.appendChild(body);
    function markTabs() {
      var bs = tabs.querySelectorAll("button");
      SECTIONS.forEach(function (s, i) { bs[i].className = current === s[0] ? "active" : ""; });
    }
    window.__paint = paint;
    paint();
  }

  async function loadAll() {
    model = {};
    try {
      var r = await sb.from("site_content").select("key,value");
      if (r.data) r.data.forEach(function (row) { model[row.key] = row.value; });
    } catch (e) {}
    Object.keys(window.LEGA_SEED || {}).forEach(function (k) {
      if (model[k] == null) model[k] = clone(window.LEGA_SEED[k]);
    });
  }

  function paint() {
    var body = document.getElementById("sectionBody");
    body.innerHTML = "";
    var fn = ({
      rosters: rostersEditor, archive: archiveEditor, transfersHistory: rowsSection,
      news: rowsSection, bestPlayerByYear: rowsSection, ticker: tickerEditor,
      competitions: rowsSection, clubs2026: rowsSection, learnTracks: rowsSection,
      grayCupYellow: mapNumEditor, __advanced: advancedEditor
    })[current];
    body.appendChild(fn());
  }

  function saveBtnRow(key, extra) {
    var r = el("div", { class: "row", style: "margin-top:14px" }, [
      el("button", { class: "pill teal", onclick: function () { saveKey(key); } }, ["Save changes"]),
      el("span", { class: "muted" }, ["Saves “" + key + "” live to everyone."])
    ]);
    if (extra) extra.forEach(function (e) { r.insertBefore(e, r.children[1]); });
    return r;
  }
  async function saveKey(key) {
    try { await window.LEGA_saveContent(key, model[key]); toast("Saved ✓"); }
    catch (e) { toast("Error: " + e.message, true); }
  }
  async function seedDefaults() {
    if (!confirm("Load the built-in default content into the database? This overwrites all current sections with the defaults.")) return;
    try { await window.LEGA_saveAll(window.LEGA_SEED); toast("Seeded defaults ✓"); await loadAll(); paint(); }
    catch (e) { toast("Error: " + e.message, true); }
  }

  /* ---------- generic editors ---------- */
  var ROW_SCHEMA = {
    transfersHistory: { title: "Transfers", sub: "Confirmed & inferred moves shown on the Transfers page.",
      fields: [["player", "Player"], ["from", "From club"], ["to", "To club"], ["date", "Date"], ["type", "Type"], ["conf", "Confidence"]], label: function (r) { return r.player || "New transfer"; },
      blank: { player: "", from: "", to: "", date: "", type: "Permanent", conf: "Confirmed" } },
    news: { title: "News & Features", sub: "Cards shown on the home page and News page.",
      fields: [["cat", "Category"], ["title", "Headline"], ["bg", "Background colour (hex)"], ["img", "Image path"]], label: function (r) { return r.title || "New story"; },
      blank: { cat: "Match Report", title: "", bg: "#48246C", img: "assets/brand-logos/Lega_League_Primary_Logo.png" } },
    bestPlayerByYear: { title: "Best Player of the Year", sub: "Roll of honour shown under Statistics → Records.",
      fields: [["year", "Year", "number"], ["name", "Player"], ["team", "Team"]], label: function (r) { return (r.year || "") + " — " + (r.name || ""); },
      blank: { year: new Date().getFullYear(), name: "", team: "" } },
    competitions: { title: "Competitions", sub: "The competition cards and detail pages. archIdx links a competition to its archive index.",
      fields: [["name", "Name"], ["key", "Key (url id)"], ["color", "Colour (hex)"], ["logo", "Logo file"], ["archIdx", "Archive index", "number"], ["tagline", "Tagline"], ["how", "How it works", "textarea"], ["blurb", "Blurb", "textarea"]], label: function (r) { return r.name || "New competition"; },
      blank: { name: "", key: "", color: "#48246C", logo: "Lega_League_Primary_Logo.png", archIdx: null, tagline: "", how: "", blurb: "" } },
    clubs2026: { title: "Home page teams", sub: "The “2026 Teams” rail and squad grid on the home page.",
      fields: [["label", "Label"], ["badge", "Badge team name"], ["key", "Key"]], label: function (r) { return r.label || "New team"; },
      blank: { key: "", label: "", badge: "" } },
    learnTracks: { title: "Learning Hub tracks", sub: "Cards in the Learning section.",
      fields: [["title", "Title"], ["desc", "Description", "textarea"]], label: function (r) { return r.title || "New track"; },
      blank: { title: "", desc: "" } }
  };

  function rowsSection() {
    var key = current, sc = ROW_SCHEMA[key], arr = model[key] || (model[key] = []);
    var card = el("div", { class: "card" }, [el("h2", null, [sc.title]), el("p", { class: "sub" }, [sc.sub])]);
    var list = el("div");
    function redraw() {
      list.innerHTML = "";
      arr.forEach(function (r, i) {
        var item = el("div", { class: "item" }, [
          el("div", { class: "hd" }, [
            el("span", { class: "t" }, [sc.label(r)]),
            el("button", { class: "x", onclick: function () { arr.splice(i, 1); redraw(); } }, ["Remove"])
          ]),
          el("div", { class: "cols" }, sc.fields.map(function (f) {
            var opts = { number: f[2] === "number", tag: f[2] === "textarea" ? "textarea" : "input" };
            return field(f[1], input(r[f[0]], function (v) { r[f[0]] = v; }, opts));
          }))
        ]);
        list.appendChild(item);
      });
    }
    redraw();
    card.appendChild(list);
    card.appendChild(el("div", { class: "row" }, [btn("+ Add", function () { arr.push(clone(sc.blank)); redraw(); }, "gold")]));
    card.appendChild(saveBtnRow(key));
    return card;
  }

  function tickerEditor() {
    var arr = model.ticker || (model.ticker = []);
    var card = el("div", { class: "card" }, [el("h2", null, ["News ticker"]), el("p", { class: "sub" }, ["The scrolling “Latest” headlines at the top of every page."])]);
    var list = el("div");
    function redraw() {
      list.innerHTML = "";
      arr.forEach(function (s, i) {
        list.appendChild(el("div", { class: "row", style: "margin-bottom:8px" }, [
          input(s, function (v) { arr[i] = v; }, {}),
          el("button", { class: "x", onclick: function () { arr.splice(i, 1); redraw(); } }, ["✕"])
        ]));
      });
    }
    redraw();
    card.appendChild(list);
    card.appendChild(el("div", { class: "row" }, [btn("+ Add headline", function () { arr.push(""); redraw(); }, "gold")]));
    card.appendChild(saveBtnRow("ticker"));
    return card;
  }

  function mapNumEditor() {
    var obj = model.grayCupYellow || (model.grayCupYellow = {});
    var card = el("div", { class: "card" }, [el("h2", null, ["Yellow cards (Gray Cup)"]), el("p", { class: "sub" }, ["Team → yellow-card totals, shown under Statistics."])]);
    var list = el("div");
    function redraw() {
      list.innerHTML = "";
      Object.keys(obj).forEach(function (team) { list.appendChild(teamNumRow(team)); });
    }
    function teamNumRow(team) {
      var row = el("div", { class: "row", style: "margin-bottom:8px" });
      var tname = el("input", { class: "f", value: team, style: "flex:2;min-width:150px" });
      var tval = el("input", { class: "f", type: "number", value: obj[team], style: "width:110px" });
      tname.addEventListener("change", function () {
        var nv = tname.value.trim(); if (!nv || nv === team) return;
        obj[nv] = obj[team]; delete obj[team]; redraw();
      });
      tval.addEventListener("input", function () { obj[team] = num(tval.value); });
      row.appendChild(tname); row.appendChild(tval);
      row.appendChild(el("button", { class: "x", onclick: function () { delete obj[team]; redraw(); } }, ["✕"]));
      return row;
    }
    redraw();
    card.appendChild(list);
    card.appendChild(el("div", { class: "row" }, [btn("+ Add team", function () { obj["New team"] = 0; redraw(); }, "gold")]));
    card.appendChild(saveBtnRow("grayCupYellow"));
    return card;
  }

  /* ---------- rosters (teams & squads) ---------- */
  function rostersEditor() {
    var ros = model.rosters || (model.rosters = {});
    var teams = Object.keys(ros);
    if (!ui.team || teams.indexOf(ui.team) < 0) ui.team = teams[0];
    var card = el("div", { class: "card" }, [
      el("h2", null, ["Teams & squads"]),
      el("p", { class: "sub" }, ["Add or edit a team's player list. Player goals/assists/profiles update automatically from the seasons you record under “Seasons & Results”."])
    ]);
    var sel = el("select", { class: "f", style: "max-width:320px" }, teams.map(function (t) { return el("option", { value: t }, [t]); }));
    sel.value = ui.team;
    sel.addEventListener("change", function () { ui.team = sel.value; paint(); });
    var addTeam = el("input", { class: "f", placeholder: "New team name", style: "max-width:220px" });
    card.appendChild(el("div", { class: "row", style: "margin-bottom:14px" }, [
      field("Team", sel),
      btn("+ Add team", function () {
        var nm = addTeam.value.trim(); if (!nm) return;
        if (!ros[nm]) ros[nm] = [];
        ui.team = nm; paint();
      }, "gold"),
      addTeam,
      el("button", { class: "x", onclick: function () {
        if (!ui.team) return;
        if (confirm("Delete team “" + ui.team + "” and its squad?")) { delete ros[ui.team]; ui.team = null; paint(); }
      } }, ["Delete team"])
    ]));

    if (ui.team) {
      var players = ros[ui.team];
      var grid = el("div", { class: "grid", style: "grid-template-columns:repeat(auto-fill,minmax(220px,1fr))" });
      function redraw() {
        grid.innerHTML = "";
        players.forEach(function (p, i) {
          grid.appendChild(el("div", { class: "row" }, [
            input(p, function (v) { players[i] = v; }, { ph: "Player name" }),
            el("button", { class: "x", onclick: function () { players.splice(i, 1); redraw(); } }, ["✕"])
          ]));
        });
      }
      redraw();
      card.appendChild(el("div", { class: "row", style: "justify-content:space-between" }, [
        el("span", { class: "muted" }, [players.length + " players"]),
        btn("+ Add player", function () { players.push(""); redraw(); }, "gold")
      ]));
      card.appendChild(el("div", { style: "height:8px" }));
      card.appendChild(grid);
    }
    card.appendChild(saveBtnRow("rosters"));
    return card;
  }

  /* ---------- archive: seasons & results ---------- */
  function archiveEditor() {
    var arch = model.archive || (model.archive = []);
    if (ui.ci == null || ui.ci >= arch.length) ui.ci = 0;
    var comp = arch[ui.ci];
    var card = el("div", { class: "card" }, [
      el("h2", null, ["Seasons & results"]),
      el("p", { class: "sub" }, ["Record standings, match results and top scorers/assists. Player stats and league tables on the site are built from this."])
    ]);

    var compSel = el("select", { class: "f", style: "max-width:280px" }, arch.map(function (c, i) { return el("option", { value: i }, [c.name]); }));
    compSel.value = String(ui.ci);
    compSel.addEventListener("change", function () { ui.ci = +compSel.value; ui.si = 0; paint(); });
    card.appendChild(el("div", { class: "row", style: "margin-bottom:12px" }, [field("Competition", compSel)]));

    if (!comp) return card;
    var seasons = comp.seasons || (comp.seasons = []);
    if (ui.si == null || ui.si >= seasons.length) ui.si = 0;

    var seasonSel = el("select", { class: "f", style: "max-width:280px" }, seasons.map(function (s, i) { return el("option", { value: i }, [s.name || s.short || ("Season " + (i + 1))]); }));
    seasonSel.value = String(ui.si);
    seasonSel.addEventListener("change", function () { ui.si = +seasonSel.value; paint(); });
    card.appendChild(el("div", { class: "row", style: "margin-bottom:14px" }, [
      field("Season", seasonSel),
      btn("+ Add season", function () {
        seasons.push({ name: comp.name + " — new season", short: "NEW", year: new Date().getFullYear(), order: (seasons.length + 1) * 10, status: "In progress", format: "" });
        ui.si = seasons.length - 1; paint();
      }, "gold"),
      el("button", { class: "x", onclick: function () {
        if (seasons.length && confirm("Delete this season?")) { seasons.splice(ui.si, 1); ui.si = 0; paint(); }
      } }, ["Delete season"])
    ]));

    var s = seasons[ui.si];
    if (!s) { card.appendChild(saveBtnRow("archive")); return card; }

    // meta fields
    var metaDefs = [["name", "Name"], ["short", "Short label"], ["year", "Year", "number"], ["order", "Sort order", "number"], ["status", "Status"], ["format", "Format"], ["champion", "Champion (team)"]];
    card.appendChild(el("div", { class: "item" }, [
      el("div", { class: "hd" }, [el("span", { class: "t" }, ["Season details"])]),
      el("div", { class: "cols" }, metaDefs.map(function (f) {
        return field(f[1], input(s[f[0]], function (v) { s[f[0]] = v; }, { number: f[2] === "number" }));
      }))
    ]));

    // sub-lists
    card.appendChild(arrayListEditor(s, "table", "Standings table", [["Team"], ["Pts", "n"], ["W", "n"], ["T", "n"], ["L", "n"], ["GF", "n"], ["GA", "n"]]));
    card.appendChild(arrayListEditor(s, "matches", "Match results", [["Home"], ["HS", "n"], ["Away"], ["AS", "n"]]));
    card.appendChild(arrayListEditor(s, "knockout", "Knockout results", [["Home"], ["HS", "n"], ["Away"], ["AS", "n"]]));
    card.appendChild(arrayListEditor(s, "topScorers", "Top scorers", [["Player"], ["Team"], ["Goals", "n"]]));
    card.appendChild(arrayListEditor(s, "topAssists", "Top assists", [["Player"], ["Team"], ["Assists", "n"]]));
    card.appendChild(arrayListEditor(s, "fixtures", "Fixtures (draw)", [["Home"], ["Away"]]));
    card.appendChild(stringListEditor(s, "registered", "Registered teams"));
    card.appendChild(finalEditor(s));

    card.appendChild(el("p", { class: "muted", style: "margin-top:10px" }, ["Divisions, groups and all-time tables: edit via the Advanced (JSON) tab."]));
    card.appendChild(saveBtnRow("archive"));
    return card;
  }

  // editor for a season key holding an array of arrays (rows)
  function arrayListEditor(season, key, title, cols) {
    var has = Array.isArray(season[key]);
    var wrap = el("div", { class: "item" });
    var hd = el("div", { class: "hd" }, [el("span", { class: "t" }, [title])]);
    wrap.appendChild(hd);
    if (!has) {
      hd.appendChild(btn("+ Add " + title.toLowerCase(), function () { season[key] = []; if (window.__paint) window.__paint(); }, "gold"));
      return wrap;
    }
    var arr = season[key];
    hd.appendChild(el("button", { class: "x", onclick: function () { delete season[key]; if (window.__paint) window.__paint(); } }, ["Remove section"]));
    var list = el("div");
    function redraw() {
      list.innerHTML = "";
      // header labels
      list.appendChild(el("div", { class: "row", style: "font-size:11px;font-weight:700;color:#A09AAE;text-transform:uppercase;letter-spacing:.04em" },
        cols.map(function (c) { return el("span", { style: c[1] === "n" ? "width:70px" : "flex:1;min-width:90px" }, [c[0]]); }).concat([el("span", { style: "width:34px" })])));
      arr.forEach(function (rowv, ri) {
        var r = el("div", { class: "row", style: "margin-bottom:6px" });
        cols.forEach(function (c, ci) {
          var i = ci;
          var inp = el("input", { class: "f", type: c[1] === "n" ? "number" : "text", style: c[1] === "n" ? "width:70px" : "flex:1;min-width:90px" });
          inp.value = rowv[i] == null ? "" : rowv[i];
          inp.addEventListener("input", function () { rowv[i] = c[1] === "n" ? num(inp.value) : inp.value; });
          r.appendChild(inp);
        });
        r.appendChild(el("button", { class: "x", onclick: function () { arr.splice(ri, 1); redraw(); } }, ["✕"]));
        list.appendChild(r);
      });
    }
    redraw();
    wrap.appendChild(list);
    wrap.appendChild(btn("+ Add row", function () { arr.push(cols.map(function () { return ""; })); redraw(); }, "gold"));
    return wrap;
  }

  function stringListEditor(season, key, title) {
    var has = Array.isArray(season[key]);
    var wrap = el("div", { class: "item" });
    var hd = el("div", { class: "hd" }, [el("span", { class: "t" }, [title])]);
    wrap.appendChild(hd);
    if (!has) { hd.appendChild(btn("+ Add " + title.toLowerCase(), function () { season[key] = []; if (window.__paint) window.__paint(); }, "gold")); return wrap; }
    var arr = season[key];
    hd.appendChild(el("button", { class: "x", onclick: function () { delete season[key]; if (window.__paint) window.__paint(); } }, ["Remove section"]));
    var list = el("div");
    function redraw() {
      list.innerHTML = "";
      arr.forEach(function (v, i) {
        list.appendChild(el("div", { class: "row", style: "margin-bottom:6px" }, [
          input(v, function (nv) { arr[i] = nv; }, { ph: "Team name" }),
          el("button", { class: "x", onclick: function () { arr.splice(i, 1); redraw(); } }, ["✕"])
        ]));
      });
    }
    redraw(); wrap.appendChild(list);
    wrap.appendChild(btn("+ Add team", function () { arr.push(""); redraw(); }, "gold"));
    return wrap;
  }

  function finalEditor(season) {
    var wrap = el("div", { class: "item" });
    var hd = el("div", { class: "hd" }, [el("span", { class: "t" }, ["The Final"])]);
    wrap.appendChild(hd);
    if (!Array.isArray(season.final)) { hd.appendChild(btn("+ Add final", function () { season.final = ["", "", "", ""]; if (window.__paint) window.__paint(); }, "gold")); return wrap; }
    hd.appendChild(el("button", { class: "x", onclick: function () { delete season.final; if (window.__paint) window.__paint(); } }, ["Remove"]));
    var f = season.final, cols = [["Home"], ["HS", "n"], ["Away"], ["AS", "n"]];
    var r = el("div", { class: "row" });
    cols.forEach(function (c, i) {
      var inp = el("input", { class: "f", type: c[1] === "n" ? "number" : "text", style: c[1] === "n" ? "width:70px" : "flex:1;min-width:90px" });
      inp.value = f[i] == null ? "" : f[i];
      inp.addEventListener("input", function () { f[i] = c[1] === "n" ? num(inp.value) : inp.value; });
      r.appendChild(el("div", null, [el("label", { class: "fl" }, [c[0]]), inp]));
    });
    wrap.appendChild(r);
    return wrap;
  }

  /* ---------- advanced raw JSON ---------- */
  function advancedEditor() {
    var keys = Object.keys(window.LEGA_SEED || {});
    if (!ui.akey) ui.akey = keys[0];
    var card = el("div", { class: "card" }, [
      el("h2", null, ["Advanced — raw JSON"]),
      el("p", { class: "sub" }, ["Directly edit any section's JSON. Useful for divisions/groups, positions, red cards, free-kicks, assist overrides and all-time tables. Be careful — invalid JSON won't save."])
    ]);
    var sel = el("select", { class: "f", style: "max-width:280px" }, keys.map(function (k) { return el("option", { value: k }, [k]); }));
    sel.value = ui.akey;
    var ta = el("textarea", { class: "f", style: "min-height:380px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px" });
    function load() { ta.value = JSON.stringify(model[ui.akey], null, 2); }
    sel.addEventListener("change", function () { ui.akey = sel.value; load(); });
    load();
    card.appendChild(el("div", { class: "row", style: "margin-bottom:12px" }, [field("Section", sel)]));
    card.appendChild(ta);
    card.appendChild(el("div", { class: "row", style: "margin-top:12px" }, [
      el("button", { class: "pill teal", onclick: function () {
        var parsed; try { parsed = JSON.parse(ta.value); } catch (e) { toast("Invalid JSON: " + e.message, true); return; }
        model[ui.akey] = parsed;
        saveKey(ui.akey);
      } }, ["Validate & save"]),
      el("span", { class: "muted" }, ["Section: " + ui.akey])
    ]));
    return card;
  }
})();
