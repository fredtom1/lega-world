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

  // Generic table helpers + image upload (Phase 1: submissions + news photos)
  window.LEGA_db = {
    list: function (table, orderCol, asc) {
      return getClient().then(function (sb) {
        if (!sb) return [];
        var q = sb.from(table).select("*");
        if (orderCol) q = q.order(orderCol, { ascending: !!asc });
        return q.then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; });
      });
    },
    insert: function (table, row) {
      return getClient().then(function (sb) {
        if (!sb) throw new Error("Supabase is not configured.");
        return sb.from(table).insert(row).then(function (r) { if (r.error) throw new Error(r.error.message); return r; });
      });
    },
    update: function (table, id, patch) {
      return getClient().then(function (sb) {
        if (!sb) throw new Error("Supabase is not configured.");
        return sb.from(table).update(patch).eq("id", id).then(function (r) { if (r.error) throw new Error(r.error.message); return r; });
      });
    },
    remove: function (table, id) {
      return getClient().then(function (sb) {
        if (!sb) throw new Error("Supabase is not configured.");
        return sb.from(table).delete().eq("id", id).then(function (r) { if (r.error) throw new Error(r.error.message); return r; });
      });
    },
    uploadImage: function (file) {
      return getClient().then(function (sb) {
        if (!sb) throw new Error("Supabase is not configured.");
        var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        var path = "news/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
        return sb.storage.from("media").upload(path, file, { cacheControl: "3600", upsert: false }).then(function (r) {
          if (r.error) throw new Error(r.error.message);
          return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
        });
      });
    }
  };

  /* ============== Phase 2: auth roles, squads, transfer RPCs ============== */
  function rpc(name, args) {
    return getClient().then(function (sb) {
      if (!sb) throw new Error("Supabase is not configured.");
      return sb.rpc(name, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; });
    });
  }
  function groupSquads(rows) {
    var o = {};
    (rows || []).forEach(function (r) { (o[r.team] = o[r.team] || []).push(r.name); });
    Object.keys(o).forEach(function (k) { o[k].sort(); });
    return o;
  }

  // squads come from team_players (the per-team, row-secured table)
  window.LEGA_loadSquads = function () {
    return getClient().then(function (sb) {
      if (!sb) return null;
      return sb.from("team_players").select("team,name").then(function (r) {
        if (r.error || !r.data || !r.data.length) return null;
        return groupSquads(r.data);
      });
    }).catch(function () { return null; });
  };

  window.LEGA_auth = {
    signUp: function (email, pw) { return getClient().then(function (sb) { return sb.auth.signUp({ email: email, password: pw }); }); },
    signIn: function (email, pw) { return getClient().then(function (sb) { return sb.auth.signInWithPassword({ email: email, password: pw }); }); },
    signOut: function () { return getClient().then(function (sb) { return sb.auth.signOut(); }); },
    session: function () { return getClient().then(function (sb) { return sb ? sb.auth.getSession().then(function (s) { return s.data.session; }) : null; }); },
    user: function () { return getClient().then(function (sb) { return sb ? sb.auth.getUser().then(function (u) { return u.data.user; }) : null; }); }
  };
  window.LEGA_isAdmin = function () { return rpc("is_admin").catch(function () { return false; }); };

  window.LEGA_profile = {
    upsert: function (role, fullName) { return rpc("upsert_my_profile", { p_role: role || "visitor", p_full_name: fullName || null }); }
  };

  window.LEGA_coach = {
    myRow: function () {
      return getClient().then(function (sb) {
        if (!sb) return null;
        return sb.auth.getUser().then(function (u) {
          var uid = u.data.user && u.data.user.id; if (!uid) return null;
          return sb.from("coaches").select("*").eq("user_id", uid).maybeSingle().then(function (r) { return r.data || null; });
        });
      });
    },
    requestTeam: function (team, email) {
      return getClient().then(function (sb) {
        return sb.auth.getUser().then(function (u) {
          var uid = u.data.user && u.data.user.id; if (!uid) throw new Error("Not signed in.");
          return sb.from("coaches").upsert({ user_id: uid, team: team, email: email, status: "pending" }, { onConflict: "user_id" })
            .then(function (r) { if (r.error) throw new Error(r.error.message); return r; });
        });
      });
    },
    // admin: list all coaches / set a coach's team + status
    listAll: function () { return getClient().then(function (sb) { return sb.from("coaches").select("*").order("created_at", { ascending: false }).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; }); }); },
    setStatus: function (userId, team, status) {
      return getClient().then(function (sb) {
        return sb.from("coaches").update({ team: team, status: status }).eq("user_id", userId)
          .then(function (r) { if (r.error) throw new Error(r.error.message); return r; });
      });
    }
  };

  window.LEGA_squads = {
    listAll: function () { return getClient().then(function (sb) { return sb.from("team_players").select("id,team,name").order("name").then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; }); }); },
    list: function (team) { return getClient().then(function (sb) { return sb.from("team_players").select("id,team,name").eq("team", team).order("name").then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; }); }); },
    add: function (team, name) { return getClient().then(function (sb) { return sb.from("team_players").insert({ team: team, name: name }).then(function (r) { if (r.error) throw new Error(r.error.message); return r; }); }); },
    remove: function (id) { return getClient().then(function (sb) { return sb.from("team_players").delete().eq("id", id).then(function (r) { if (r.error) throw new Error(r.error.message); return r; }); }); },
    replaceTeam: function (team, names) {
      return getClient().then(function (sb) {
        return sb.from("team_players").delete().eq("team", team).then(function (d) {
          if (d.error) throw new Error(d.error.message);
          var rows = (names || []).filter(Boolean).map(function (n) { return { team: team, name: n }; });
          if (!rows.length) return { data: [] };
          return sb.from("team_players").insert(rows).then(function (r) { if (r.error) throw new Error(r.error.message); return r; });
        });
      });
    }
  };

  window.LEGA_transfers = {
    request: function (player, from, to, type) { return rpc("request_transfer", { p_player: player, p_from: from, p_to: to, p_type: type || "Permanent" }); },
    requestContract: function (player, from, to, type, fee, playerEmail, seasons) {
      return rpc("request_transfer_contract", {
        p_player: player,
        p_from: from,
        p_to: to,
        p_type: type || "Permanent",
        p_fee: Number(fee || 0),
        p_player_email: playerEmail,
        p_seasons: Number(seasons || 1)
      });
    },
    accept: function (id) { return rpc("accept_transfer", { p_request: id }); },
    reject: function (id) { return rpc("reject_transfer", { p_request: id }); },
    all: function () { return getClient().then(function (sb) { return sb.from("transfer_requests").select("*").order("created_at", { ascending: false }).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; }); }); },
    log: function () { return getClient().then(function (sb) { return sb.from("transfers_log").select("*").order("created_at", { ascending: false }).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; }); }); }
  };

  window.LEGA_contracts = {
    mine: function () {
      return getClient().then(function (sb) {
        return sb.from("player_contracts").select("*").order("created_at", { ascending: false })
          .then(function (r) { if (r.error) throw new Error(r.error.message); return r.data || []; });
      });
    },
    accept: function (id, seasons) { return rpc("accept_player_contract", { p_contract: id, p_seasons: Number(seasons || 1) }); },
    reject: function (id) { return rpc("reject_player_contract", { p_contract: id }); }
  };
})();
