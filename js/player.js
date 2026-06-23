(function () {
  "use strict";
  var root = document.getElementById("player");

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
  function toast(msg, bad) {
    var t = document.getElementById("toast"); t.textContent = msg; t.style.background = bad ? "#C0392B" : "#067C7C";
    t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }
  function header(extra) {
    var bar = el("div", { class: "bar" }, [
      el("span", { class: "brand" }, [el("img", { src: "assets/logo/lega-world-logo-reverse.svg", alt: "" }),
        el("span", null, [el("span", { class: "a" }, ["LEGA"]), el("span", { class: "b" }, ["WORLD"])]),
        el("span", { style: "font-weight:600;color:#90C0E4;font-size:13px;margin-left:6px" }, ["Player"])]),
      el("span", { class: "spacer" }),
      el("a", { class: "pill ghost sm", href: "index.html" }, ["View site"])
    ]);
    (extra || []).forEach(function (e) { bar.appendChild(e); });
    return el("header", null, [el("div", { class: "wrap" }, [bar])]);
  }
  function shell(extra, body) { root.innerHTML = ""; root.appendChild(header(extra)); root.appendChild(el("main", null, [el("div", { class: "wrap" }, [body])])); }
  function signOutBtn() { return el("button", { class: "pill ghost sm", onclick: function () { window.LEGA_auth.signOut().then(showAuth); } }, ["Sign out"]); }

  init();
  async function init() {
    if (!window.LEGA_configured || !window.LEGA_configured()) {
      shell([], el("div", { class: "card", style: "margin-top:24px" }, [el("h2", null, ["Player portal not configured"]), el("p", { class: "sub" }, ["Ask the league office to connect Supabase."])]));
      return;
    }
    var session = await window.LEGA_auth.session();
    if (session) showContracts(); else showAuth();
  }

  function showAuth() {
    var mode = { v: "in" };
    var email = el("input", { class: "f", type: "email", placeholder: "player@email.com" });
    var pass = el("input", { class: "f", type: "password", placeholder: "••••••••" });
    var msg = el("div", { class: "err" });
    var cta = el("button", { class: "pill teal", style: "width:100%;justify-content:center" });
    var seg = el("div", { class: "seg" }, [
      el("button", { class: "active", onclick: function () { setMode("in"); } }, ["Sign in"]),
      el("button", { onclick: function () { setMode("up"); } }, ["Create account"])
    ]);
    function setMode(m) { mode.v = m; seg.children[0].className = m === "in" ? "active" : ""; seg.children[1].className = m === "up" ? "active" : ""; cta.textContent = m === "in" ? "Sign in" : "Create account"; msg.textContent = ""; }
    setMode("in");
    cta.addEventListener("click", function () {
      var e = email.value.trim(), p = pass.value; msg.textContent = "";
      if (!e || !p) { msg.textContent = "Enter your email and password."; return; }
      var op = mode.v === "in" ? window.LEGA_auth.signIn(e, p) : window.LEGA_auth.signUp(e, p);
      op.then(function (r) {
        if (r.error) { msg.textContent = r.error.message; return; }
        if (mode.v === "up" && !(r.data && r.data.session)) { msg.className = "ok"; msg.textContent = "Account created. Confirm your email, then sign in."; setMode("in"); return; }
        if (window.LEGA_profile) window.LEGA_profile.upsert("player").catch(function(){});
        showContracts();
      });
    });
    shell([], el("div", { class: "login card" }, [
      el("h2", null, ["Player contracts"]),
      el("p", { class: "sub" }, ["Sign in with the email the buying team used. Your contract offer appears here."]),
      seg, el("label", { class: "fl" }, ["Email"]), email, el("div", { style: "height:12px" }),
      el("label", { class: "fl" }, ["Password"]), pass, msg, el("div", { style: "height:8px" }), cta
    ]));
  }

  async function showContracts() {
    shell([signOutBtn()], el("div", { class: "card", style: "margin-top:24px" }, [el("h2", null, ["Loading contracts…"])]));
    try {
      var rows = await window.LEGA_contracts.mine();
      var card = el("div", { class: "card", style: "margin-top:24px" }, [
        el("h2", null, ["Your contract offers"]),
        el("p", { class: "sub" }, ["When a selling club agrees to a transfer, your contract appears here. Choose the seasons and accept or reject."])
      ]);
      if (!rows.length) card.appendChild(el("div", { class: "muted" }, ["No contract offers yet."]));
      rows.forEach(function (r) {
        var seasons = el("input", { class: "f", type: "number", min: "1", value: r.seasons_offered || 1, style: "max-width:120px" });
        card.appendChild(el("div", { class: "item" }, [
          el("div", { class: "hd" }, [el("span", { style: "font-weight:800" }, [r.player]), el("span", { class: "badge", style: "background:" + (r.status === "accepted" ? "#1FA05A" : r.status === "rejected" ? "#C0392B" : "#E8A91C") }, [r.status])]),
          el("div", { class: "muted", style: "margin:8px 0 12px" }, [r.from_team + " → " + r.to_team + " · " + (r.type || "Permanent") + " · fee " + (r.fee || 0)]),
          el("div", { class: "row" }, [
            el("div", null, [el("label", { class: "fl" }, ["Seasons"]), seasons]),
            el("button", { class: "pill teal sm", disabled: r.status !== "sent" ? "disabled" : null, onclick: function () {
              window.LEGA_contracts.accept(r.id, parseInt(seasons.value || "1", 10)).then(function () { toast("Contract accepted"); showContracts(); }).catch(function (e) { toast(e.message, true); });
            } }, ["Accept"]),
            el("button", { class: "pill ghost sm", disabled: r.status !== "sent" ? "disabled" : null, onclick: function () {
              window.LEGA_contracts.reject(r.id).then(function () { toast("Contract rejected"); showContracts(); }).catch(function (e) { toast(e.message, true); });
            } }, ["Reject"])
          ])
        ]));
      });
      shell([signOutBtn()], card);
    } catch (e) {
      shell([signOutBtn()], el("div", { class: "card", style: "margin-top:24px" }, [el("h2", null, ["Could not load contracts"]), el("p", { class: "sub" }, [e.message])]));
    }
  }
})();
