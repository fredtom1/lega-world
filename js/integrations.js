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

  // discreet "Coach / owner login" link in the footer (not in the public nav)
  var FOOT = '<div style="color:#90C0E4;font-size:13px;font-weight:500;">Ekiti &middot; Lagos &middot; Anambra, Nigeria &middot; Founded 2013</div>';
  var COACH_LINK = '<a href="coach.html" style="color:#fff;font-size:12px;font-weight:700;text-decoration:none;background:#009C9C;padding:7px 14px;border-radius:999px;">Coach / owner login</a>';
  if (template.indexOf(FOOT) >= 0) template = template.replace(FOOT, '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:14px;">' + COACH_LINK + FOOT + '</div>');

  // provide the bindings for the new field
  var origSignRegVals = proto.signRegVals;
  proto.signRegVals = function () {
    var o = origSignRegVals.call(this);
    o.regPlayers = (this.state.regForm && this.state.regForm.players) || "";
    o.onRegPlayers = this.setField("regForm", "players");
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
    var f = this.state.txForm, self = this;
    if (!f.player || !f.from || !f.to) { this.setState({ flash: "Add the player and both clubs to submit." }); return; }
    function reset(msg) { self.setState({ txForm: { player: "", from: "", to: "", type: "Permanent", date: "" }, flash: msg }); }
    if (configured()) {
      window.LEGA_db.insert("transfer_requests", {
        player: f.player, from_team: f.from, to_team: f.to, type: f.type, window_date: f.date || "TBC"
      }).then(function () { reset("Submitted to the Transfer Policy Department for review."); })
        .catch(function (e) { self.setState({ flash: "Could not submit right now: " + e.message }); });
    } else {
      var rec = { player: f.player, from: f.from, to: f.to, type: f.type, date: f.date || "TBC", status: "Pending review" };
      var pt = [rec].concat(self.state.pendT); self.save("pendT", pt); self.setState({ pendT: pt });
      reset("Submitted to the Transfer Policy Department for review.");
    }
  };

  // re-register the App with the patched template
  window.DC.register("App", template, Component);

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
