/* =====================================================================
   dc-runtime.js  —  a tiny, dependency-free runtime that renders the
   original Claude Design ".dc" templates + logic.  No React, no Babel,
   no CDN.  It implements just the template language the Lega World
   design uses:

     {{ path }}                         text + attribute interpolation
     <sc-if value="{{ key }}">          conditional block
     <sc-for list="{{ key }}" as="x">   list repetition (nestable)
     <dc-import name="X" prop="{{p}}">  sub-component import
     onClick/onChange/onInput/...        event handlers -> {{ fn }}
     style-hover="..."                   simple hover styling
     SVG elements                        rendered in the SVG namespace

   Components expose a DCLogic subclass whose renderVals() returns the
   flat map of {{ }} bindings (exactly as authored in Claude Design).
   ===================================================================== */
(function (global) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var EVENT_MAP = {
    onclick: "click", onchange: "change", oninput: "input",
    onfocus: "focus", onblur: "blur", onmousedown: "mousedown",
    onkeydown: "keydown", onkeyup: "keyup", onsubmit: "submit",
    onerror: "error"
  };

  /* ---------- DCLogic base class ---------- */
  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
      this._scheduler = null;
    }
    setState(partial) {
      Object.assign(this.state, partial || {});
      if (this._scheduler) this._scheduler();
    }
    renderVals() { return {}; }
    componentWillUnmount() {}
  }

  /* ---------- component registry ---------- */
  var registry = Object.create(null);
  function register(name, templateHTML, Logic, opts) {
    registry[name] = {
      fragment: buildFragment(templateHTML),
      Logic: Logic || PlainLogic,
      stateful: !!(opts && opts.stateful)
    };
  }
  class PlainLogic extends DCLogic { renderVals() { return {}; } }

  /* ---------- template preprocessing ----------
     The browser HTML parser relocates unknown tags inside <select>,
     so we convert the control tags into <template> markers (which are
     legal everywhere, including inside <select>). dc-import stays a
     custom element (only ever used in flow content). */
  function preprocess(html) {
    return html
      .replace(/<sc-if\s+value="\{\{\s*([^}]+?)\s*\}\}"[^>]*>/g,
               function (_m, k) { return '<template data-dc-if="' + esc(k) + '">'; })
      .replace(/<\/sc-if>/g, "</template>")
      .replace(/<sc-for\s+list="\{\{\s*([^}]+?)\s*\}\}"\s+as="([^"]+)"[^>]*>/g,
               function (_m, k, as) { return '<template data-dc-for="' + esc(k) + '" data-dc-as="' + esc(as) + '">'; })
      .replace(/<\/sc-for>/g, "</template>");
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

  function buildFragment(html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = preprocess(html);
    return tpl.content;
  }

  /* ---------- scope + interpolation ---------- */
  function childScope(parent, key, val) {
    var s = Object.create(parent);
    s[key] = val;
    return s;
  }
  function resolve(path, scope) {
    path = String(path).trim();
    var parts = path.split(".");
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i].trim()];
    }
    return cur;
  }
  var INTERP = /\{\{\s*([^}]+?)\s*\}\}/g;
  function interpolate(str, scope) {
    return str.replace(INTERP, function (_m, expr) {
      var v = resolve(expr, scope);
      return v == null ? "" : String(v);
    });
  }
  function wholeExpr(value) {
    var m = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(value.trim());
    return m ? m[1] : null;
  }

  /* ---------- the renderer ---------- */
  // ctx carries per-render-pass component instance counters
  function renderNodes(parentFragOrEl, scope, ns, ctx, out) {
    var nodes = parentFragOrEl.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      renderNode(nodes[i], scope, ns, ctx, out);
    }
  }

  function renderNode(node, scope, ns, ctx, out) {
    if (node.nodeType === 3) { // text
      var t = node.nodeValue;
      out.push(document.createTextNode(t.indexOf("{{") >= 0 ? interpolate(t, scope) : t));
      return;
    }
    if (node.nodeType === 8) return; // comment - drop
    if (node.nodeType !== 1) return;

    var tag = node.tagName.toLowerCase();

    // control-flow markers (converted <template> elements)
    if (tag === "template") {
      // HTML <template> exposes children via .content (a DocumentFragment);
      // inside <svg> the parser makes a foreign <template> with plain
      // childNodes and no .content — so fall back to the element itself.
      var body = node.content || node;
      if (node.hasAttribute("data-dc-if")) {
        var cond = resolve(node.getAttribute("data-dc-if"), scope);
        if (cond) renderNodes(body, scope, ns, ctx, out);
        return;
      }
      if (node.hasAttribute("data-dc-for")) {
        var list = resolve(node.getAttribute("data-dc-for"), scope) || [];
        var as = node.getAttribute("data-dc-as");
        for (var j = 0; j < list.length; j++) {
          renderNodes(body, childScope(scope, as, list[j]), ns, ctx, out);
        }
        return;
      }
      // plain <template> (none expected) -> ignore contents
      return;
    }

    // sub-component import
    if (tag === "dc-import") {
      renderImport(node, scope, ctx, out);
      return;
    }

    // normal element (HTML or SVG)
    var childNs = (tag === "svg") ? SVG_NS : ns;
    var el = childNs ? document.createElementNS(childNs, node.tagName) : document.createElement(tag);

    var deferredValue = null, hoverStyle = null, baseStyle = null;
    var attrs = node.attributes;
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name, raw = attrs[a].value;
      var lname = name.toLowerCase();
      if (lname === "key" || lname.indexOf("hint-") === 0 || lname.indexOf("data-dc-") === 0) continue;

      // event handlers
      if (lname.charAt(0) === "o" && lname.charAt(1) === "n" && EVENT_MAP[lname]) {
        var fnExpr = wholeExpr(raw);
        var fn = fnExpr ? resolve(fnExpr, scope) : null;
        if (typeof fn === "function") bindEvent(el, lname, tag, fn);
        continue;
      }
      if (lname === "style-hover") { hoverStyle = raw; continue; }

      var val = raw.indexOf("{{") >= 0 ? interpolate(raw, scope) : raw;

      if (lname === "value" && (tag === "input" || tag === "textarea" || tag === "select")) {
        deferredValue = val; // apply as property after children
        continue;
      }
      if (lname === "style") baseStyle = val;
      try { el.setAttribute(name, val); } catch (e) {}
    }

    if (hoverStyle != null) attachHover(el, baseStyle || "", hoverStyle);

    // children
    var kids = [];
    renderNodes(node, scope, childNs, ctx, kids);
    for (var c = 0; c < kids.length; c++) el.appendChild(kids[c]);

    if (deferredValue != null) {
      try { el.value = deferredValue; } catch (e2) {}
    }
    out.push(el);
  }

  function bindEvent(el, lname, tag, fn) {
    var type = EVENT_MAP[lname];
    // React-style onChange on text fields fires per keystroke
    if (lname === "onchange" && (tag === "input" || tag === "textarea")) type = "input";
    el.addEventListener(type, fn);
  }

  function attachHover(el, baseStyle, hoverStyle) {
    el.addEventListener("mouseenter", function () {
      el.setAttribute("style", baseStyle + ";" + hoverStyle);
    });
    el.addEventListener("mouseleave", function () {
      el.setAttribute("style", baseStyle);
    });
  }

  /* ---------- dc-import ---------- */
  function renderImport(node, scope, ctx, out) {
    var name = node.getAttribute("name");
    var def = registry[name];
    if (!def) { return; } // unknown component -> render nothing

    // build props from attributes
    var props = {};
    var extraStyle = null, extraClass = null;
    var attrs = node.attributes;
    for (var a = 0; a < attrs.length; a++) {
      var an = attrs[a].name, av = attrs[a].value;
      if (an === "name") continue;
      if (an.toLowerCase().indexOf("hint-") === 0) continue;
      if (an === "style" || an === "class") {
        var sv = av.indexOf("{{") >= 0 ? interpolate(av, scope) : av;
        if (an === "style") extraStyle = sv; else extraClass = sv;
        // still expose as prop in case a component reads it
      }
      var w = wholeExpr(av);
      props[an] = w ? resolve(w, scope) : (av.indexOf("{{") >= 0 ? interpolate(av, scope) : av);
    }

    // instance identity (stateful components persist across re-renders)
    var inst;
    if (def.stateful) {
      ctx.counts[name] = (ctx.counts[name] || 0);
      var key = name + "#" + (ctx.counts[name]++);
      inst = ctx.store.get(key);
      if (!inst) { inst = new def.Logic(props); inst._scheduler = ctx.scheduler; ctx.store.set(key, inst); }
      else { inst.props = props; }
      ctx.seen.add(key);
    } else {
      inst = new def.Logic(props);
    }

    var vals = inst.renderVals ? inst.renderVals() : {};
    var compScope = Object.assign(Object.create(null), props, vals);

    var rendered = [];
    renderNodes(def.fragment, compScope, null, ctx, rendered);

    // apply leftover style/class from the dc-import tag onto the root element
    for (var r = 0; r < rendered.length; r++) {
      var rn = rendered[r];
      if (rn.nodeType === 1) {
        if (extraStyle != null) {
          var cur = rn.getAttribute("style") || "";
          rn.setAttribute("style", cur ? (cur + ";" + extraStyle) : extraStyle);
        }
        if (extraClass != null) rn.setAttribute("class", ((rn.getAttribute("class") || "") + " " + extraClass).trim());
        break;
      }
    }
    for (var o = 0; o < rendered.length; o++) out.push(rendered[o]);
  }

  /* ---------- focus / caret preservation ---------- */
  function focusablePath(host) {
    var el = document.activeElement;
    if (!el || !host.contains(el)) return null;
    var tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return null;
    var path = [], n = el;
    while (n && n !== host) {
      var p = n.parentNode;
      if (!p) break;
      path.unshift(Array.prototype.indexOf.call(p.childNodes, n));
      n = p;
    }
    var sel = null;
    try {
      if (tag === "input" || tag === "textarea")
        sel = [el.selectionStart, el.selectionEnd];
    } catch (e) {}
    return { path: path, sel: sel };
  }
  function restoreFocus(host, info) {
    if (!info) return;
    var n = host;
    for (var i = 0; i < info.path.length; i++) {
      if (!n || !n.childNodes) return;
      n = n.childNodes[info.path[i]];
    }
    if (!n || n.nodeType !== 1) return;
    var tag = n.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return;
    try {
      n.focus();
      if (info.sel && n.setSelectionRange) n.setSelectionRange(info.sel[0], info.sel[1]);
    } catch (e) {}
  }

  /* ---------- mount ---------- */
  function mount(hostSelector, name, props) {
    var host = typeof hostSelector === "string" ? document.querySelector(hostSelector) : hostSelector;
    var def = registry[name];
    if (!def) throw new Error("dc-runtime: component not registered: " + name);
    var root = new def.Logic(props || {});

    var store = new Map();       // key -> stateful sub-instance
    var lastView = { v: undefined };
    var pending = false;

    function doRender() {
      pending = false;
      var focusInfo = focusablePath(host);
      var vals = root.renderVals ? root.renderVals() : {};
      var scope = Object.assign(Object.create(null), root.props, vals);

      var ctx = { counts: {}, store: store, seen: new Set(), scheduler: schedule };
      var out = [];
      renderNodes(def.fragment, scope, null, ctx, out);

      // drop stateful instances that were not rendered this pass
      store.forEach(function (_inst, key) { if (!ctx.seen.has(key)) store.delete(key); });

      host.replaceChildren.apply(host, out);

      // entrance animation only on view change (avoid flicker on every keystroke)
      var main = host.querySelector("main.lw-fade");
      if (main) {
        if (vals.view === lastView.v) main.classList.remove("lw-fade");
        lastView.v = vals.view;
      }

      restoreFocus(host, focusInfo);
    }
    function schedule() {
      if (pending) return;
      pending = true;
      Promise.resolve().then(doRender);
    }

    root._scheduler = schedule;
    doRender();
    return root;
  }

  global.DCLogic = DCLogic;
  global.DC = { register: register, mount: mount, _registry: registry };
})(window);
