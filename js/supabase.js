/* =====================================================================
   supabase.js — thin data layer over Supabase.

   Exposes:
     window.LEGA_supabase()        -> Promise<client | null>
     window.LEGA_loadContent()     -> Promise<content | null>
     window.LEGA_saveContent(k,v)  -> Promise
     window.LEGA_saveAll(obj)      -> Promise   (seed / bulk upsert)

   The Supabase JS client is loaded from a CDN on demand, and only when
   config.js has been filled in. If it is not configured (or the network
   is unavailable) loadContent() resolves to null and the site renders
   from the bundled defaults (window.LEGA_SEED / the app's own data).
   ===================================================================== */
(function () {
  "use strict";
  var CFG = window.LEGA_CONFIG || {};
  var clientPromise = null;

  function configured() { return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY); }

  function getClient() {
    if (!configured()) return Promise.resolve(null);
    if (clientPromise) return clientPromise;
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2.45.4")
      .then(function (m) { return m.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); })
      .catch(function (e) { console.warn("Supabase client failed to load:", e); return null; });
    return clientPromise;
  }

  window.LEGA_configured = configured;
  window.LEGA_supabase = getClient;

  window.LEGA_loadContent = function () {
    return getClient().then(function (sb) {
      if (!sb) return null;
      return sb.from("site_content").select("key,value").then(function (res) {
        if (res.error) { console.warn("loadContent error:", res.error.message); return null; }
        if (!res.data || !res.data.length) return null;
        var remote = {};
        res.data.forEach(function (row) { remote[row.key] = row.value; });
        // merge over the bundled defaults so a partially-populated DB still renders fully
        return Object.assign({}, window.LEGA_SEED || {}, remote);
      });
    }).catch(function (e) { console.warn("loadContent failed:", e); return null; });
  };

  window.LEGA_saveContent = function (key, value) {
    return getClient().then(function (sb) {
      if (!sb) throw new Error("Supabase is not configured (see config.js).");
      return sb.from("site_content")
        .upsert({ key: key, value: value, updated_at: new Date().toISOString() }, { onConflict: "key" })
        .then(function (res) { if (res.error) throw new Error(res.error.message); return res; });
    });
  };

  window.LEGA_saveAll = function (obj) {
    return getClient().then(function (sb) {
      if (!sb) throw new Error("Supabase is not configured (see config.js).");
      var rows = Object.keys(obj).map(function (k) {
        return { key: k, value: obj[k], updated_at: new Date().toISOString() };
      });
      return sb.from("site_content").upsert(rows, { onConflict: "key" })
        .then(function (res) { if (res.error) throw new Error(res.error.message); return res; });
    });
  };
})();
