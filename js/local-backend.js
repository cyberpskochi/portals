/**
 * local-backend.js — DEMO MODE ONLY.
 *
 * A stand-in for the Google Apps Script backend that keeps everything in
 * this browser's localStorage. It implements the same actions and returns
 * the same shapes as apps-script/*.gs, so every screen can be tried before
 * the real Google Drive backend is deployed. It is not used at all once
 * config.js holds a real API_URL and Client ID.
 */
(function () {
  "use strict";
  var KEY = "cyberps.demo.db.v1";
  var ROLES = { admin: 3, editor: 2, viewer: 1 };
  var HEAD = {
    login: ["Timestamp", "Email", "Name", "Event", "Result", "Session", "Browser", "IP", "Details"],
    activity: ["Timestamp", "Email", "Name", "Role", "Module", "Action", "Record", "Old Value", "New Value", "Result", "Session"],
    error: ["Timestamp", "Email", "Module", "Operation", "Error", "Stack / Details", "Browser", "Status"]
  };
  var OWNER = "demo.admin@gmail.com";

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function stamp(d) { d = d || new Date(); return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function err(msg, code) { var e = new Error(msg); e.code = code; return e; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    var db = null;
    try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; }
    if (!db) {
      db = {
        version: 1, core: {}, records: {}, attendance: {},
        users: [
          { email: OWNER, name: "Demo Administrator", role: "admin", status: "Active", addedBy: "setup()", addedOn: stamp(), lastLogin: "", lastActivity: "", notes: "Owner account (demo)" },
          { email: "demo.editor@gmail.com", name: "Demo Duty Editor", role: "editor", status: "Active", addedBy: OWNER, addedOn: stamp(), lastLogin: "", lastActivity: "", notes: "" },
          { email: "demo.viewer@gmail.com", name: "Demo Viewer", role: "viewer", status: "Active", addedBy: OWNER, addedOn: stamp(), lastLogin: "", lastActivity: "", notes: "" }
        ],
        login: [], activity: [], error: [], backups: [], sessions: {},
        lastModifiedBy: "", lastModifiedAt: "", lastBackupAt: 0
      };
    }
    return db;
  }
  function store(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) {
      // Browser storage full — drop the oldest demo backups and retry once.
      db.backups = db.backups.slice(0, 3);
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e2) { throw err("Browser storage is full (demo mode).", "SERVER_ERROR"); }
    }
  }
  function addLog(db, type, obj) {
    var row = {};
    HEAD[type].forEach(function (h) { row[h] = obj[h] === undefined ? "" : String(obj[h]); });
    row.Timestamp = obj.Timestamp || stamp();
    row._ts = obj._ts || Date.now();
    db[type].push(row);
    if (db[type].length > 3000) db[type] = db[type].slice(-3000);
  }
  function activity(db, ctx, a) {
    addLog(db, "activity", {
      Timestamp: a.time ? stamp(new Date(a.time)) : stamp(), _ts: a.time || Date.now(),
      Email: ctx.email, Name: ctx.name, Role: ctx.role, Module: a.module, Action: a.action, Record: a.record,
      "Old Value": a.oldValue, "New Value": a.newValue, Result: a.result || "SUCCESS", Session: ctx.sid
    });
  }
  function setPath(obj, parts, value) {
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]] || typeof o[parts[i]] !== "object") o[parts[i]] = {};
      o = o[parts[i]];
    }
    var last = parts[parts.length - 1];
    if (value === null || value === undefined) delete o[last]; else o[last] = value;
  }
  function user(db, email) { return db.users.filter(function (u) { return u.email === email; })[0]; }
  function demoHash(p) { return "d$" + btoa(unescape(encodeURIComponent(String(p || "") + "|cyberps"))); }
  function pubUsers(db) { return clone(db.users).map(function (u) { u.isOwner = u.email === OWNER; u.hasPassword = !!u.pw; delete u.pw; return u; }); }
  function makeBackup(db, reason, by) {
    var b = {
      id: "b" + Date.now() + Math.random().toString(36).slice(2, 6),
      name: "backup-" + stamp().replace(/[: ]/g, "-") + ".json",
      created: stamp(), ts: Date.now(), reason: reason, createdBy: by, version: db.version,
      content: JSON.stringify({ core: db.core, records: db.records, attendance: db.attendance, backup: { reason: reason, createdBy: by, version: db.version } })
    };
    b.size = b.content.length;
    db.backups.unshift(b);
    db.backups = db.backups.slice(0, 12);
    db.lastBackupAt = Date.now();
    return b;
  }

  var TOP = { records: "editor", attendance: "editor", paradeOverrides: "editor", paradeMeta: "editor", dutyTypes: "editor", strengthTable: "editor", tips: "editor", tipsVersion: "editor", usedTipIndices: "editor", personnel: "admin", dutyOrder: "admin", settings: "admin", meta: "admin" };

  function handle(action, payload, token, client) {
    var db = load();
    payload = payload || {};
    client = client || {};
    var ctx = null;

    if (action === "auth.login") {
      var email = String(payload.demoEmail || "").toLowerCase();
      var u = user(db, email);
      if (!u || u.status !== "Active") {
        addLog(db, "login", { Email: email, Event: "LOGIN_DENIED", Result: "FAILED", Browser: client.ua, IP: client.ip, Details: !u ? "Gmail ID is not in the authorised list" : "Account is " + u.status });
        store(db);
        throw err("Access denied for " + email + ". Contact the Station Administrator.", "NOT_AUTHORISED");
      }
      var tok = "demo" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      db.sessions[tok] = { email: u.email, name: u.name, role: u.role, sid: tok.slice(0, 10), created: Date.now() };
      u.lastLogin = stamp();
      addLog(db, "login", { Email: u.email, Name: u.name, Event: "LOGIN_SUCCESS", Result: "SUCCESS", Session: tok.slice(0, 10), Browser: client.ua, IP: client.ip, Details: "Role: " + u.role + " (demo mode)" });
      store(db);
      return { session: tok, user: { email: u.email, name: u.name, role: u.role, sid: tok.slice(0, 10), isOwner: u.email === OWNER }, sessionHours: 6 };
    }
    if (action === "ping") return { pong: true };
    if (action === "auth.passwordLogin") {
      var id = String(payload.username || "").trim().toLowerCase();
      var pu = user(db, id);
      if (!pu || !pu.pw || pu.pw !== demoHash(payload.password)) {
        addLog(db, "login", { Email: id, Event: "LOGIN_FAILED", Result: "FAILED", Browser: client.ua, Details: "Password sign-in: " + (!pu ? "unknown username" : "wrong password") });
        store(db); throw err("Wrong username or password.", "AUTH_FAILED");
      }
      if (pu.status !== "Active") { store(db); throw err("This account is " + pu.status + ".", "NOT_AUTHORISED"); }
      var tk = "demo" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      db.sessions[tk] = { email: pu.email, name: pu.name, role: pu.role, sid: tk.slice(0, 10), mustChange: !!pu.mustChange };
      pu.lastLogin = stamp();
      addLog(db, "login", { Email: pu.email, Name: pu.name, Event: "LOGIN_SUCCESS", Result: "SUCCESS", Session: tk.slice(0, 10), Browser: client.ua, Details: "Password sign-in · Role: " + pu.role });
      store(db);
      return { session: tk, user: { email: pu.email, name: pu.name, role: pu.role, sid: tk.slice(0, 10), method: "password", mustChangePassword: !!pu.mustChange } };
    }

    var s = db.sessions[token];
    if (!s) {
      addLog(db, "login", { Email: client.emailHint || "", Event: "SESSION_EXPIRED", Result: "EXPIRED", Session: String(token || "").slice(0, 10), Browser: client.ua, Details: "Session not found" });
      store(db);
      throw err("Your session has expired. Please sign in again.", "AUTH_EXPIRED");
    }
    var cu = user(db, s.email);
    if (!cu || cu.status !== "Active") {
      delete db.sessions[token];
      addLog(db, "login", { Email: s.email, Name: s.name, Event: "FORCED_LOGOUT", Result: "DENIED", Session: s.sid, Details: "Account removed or disabled by administrator" });
      store(db);
      throw err("Your access has been withdrawn by the administrator.", "AUTH_EXPIRED");
    }
    ctx = { email: s.email, name: cu.name || s.name, role: cu.role, sid: s.sid };
    if (s.mustChange && ["auth.changePassword", "auth.logout", "logs.error"].indexOf(action) === -1) throw err("Please set a new password before continuing.", "PASSWORD_CHANGE");
    function need(role) { if (ROLES[ctx.role] < ROLES[role]) throw err("Your role (" + ctx.role + ") does not permit this action. " + role + " role required.", "FORBIDDEN"); }
    function has(role) { return ROLES[ctx.role] >= ROLES[role]; }
    var out;

    switch (action) {
      case "auth.logout":
        delete db.sessions[token];
        addLog(db, "login", { Email: ctx.email, Name: ctx.name, Event: "LOGOUT", Result: "SUCCESS", Session: ctx.sid, Browser: client.ua });
        out = { loggedOut: true }; break;

      case "auth.me": out = { user: ctx }; break;

      case "data.bootstrap":
        out = {
          version: db.version, core: clone(db.core), records: clone(db.records), attendance: clone(db.attendance),
          loadedYears: [], availableYears: [], user: { email: ctx.email, name: ctx.name, role: ctx.role, sid: ctx.sid, isOwner: ctx.email === OWNER },
          lastModifiedBy: db.lastModifiedBy, lastModifiedAt: db.lastModifiedAt, serverTime: stamp()
        };
        break;

      case "data.getYear": out = { year: payload.year, records: {}, version: db.version }; break;

      case "data.poll": out = { version: db.version, lastModifiedBy: db.lastModifiedBy, lastModifiedAt: db.lastModifiedAt }; break;

      case "data.save":
        need("editor");
        var prev = db.version;
        var perms = (db.core.settings && db.core.settings.permissions) || {};
        if ((payload.changes || []).length && Date.now() - db.lastBackupAt > 30 * 60 * 1000) makeBackup(db, "Automatic backup (before save)", "system");
        (payload.changes || []).forEach(function (ch) {
          var parts = String(ch.path).split("/").filter(Boolean);
          var top = parts[0];
          var req = TOP[top];
          if (!req) throw err("Unknown data section: " + top, "BAD_REQUEST");
          if (top === "personnel" && perms.editorsManagePersonnel) req = "editor";
          if (top === "dutyOrder" && perms.editorsReorderDuties) req = "editor";
          if (!has(req)) throw err("Your role (" + ctx.role + ") cannot change \"" + top + "\".", "FORBIDDEN");
          if (top === "records") setPath(db.records, parts.slice(1), ch.value);
          else if (top === "attendance") setPath(db.attendance, parts.slice(1), ch.value);
          else setPath(db.core, parts, ch.value);
        });
        if ((payload.changes || []).length) { db.version++; db.lastModifiedBy = ctx.name; db.lastModifiedAt = stamp(); }
        (payload.audit || []).forEach(function (a) { activity(db, ctx, a); });
        cu.lastActivity = stamp();
        out = { version: db.version, prevVersion: prev, savedAt: stamp() };
        break;

      case "data.replaceAll":
        need("admin");
        makeBackup(db, "Before import: " + (payload.reason || "data import"), ctx.email);
        db.core = payload.data.core || {}; db.records = payload.data.records || {}; db.attendance = payload.data.attendance || {};
        db.version++; db.lastModifiedBy = ctx.name; db.lastModifiedAt = stamp();
        activity(db, ctx, { module: "Backup", action: "Import data", record: payload.reason || "data import", newValue: Object.keys(db.records).length + " daily charts" });
        out = { version: db.version }; break;

      case "data.exportAll":
        need("admin");
        activity(db, ctx, { module: "Backup", action: "Export all data (JSON)", record: "All data" });
        out = { core: db.core, records: db.records, attendance: db.attendance, exportedAt: stamp(), exportedBy: ctx.email, version: db.version };
        break;

      case "users.list": need("admin"); out = { users: pubUsers(db) }; break;

      case "users.setPassword":
        need("admin");
        var su = user(db, String(payload.email).toLowerCase());
        if (!su) throw err("User not found.", "BAD_REQUEST");
        if (payload.clear) { su.pw = ""; su.mustChange = false; activity(db, ctx, { module: "Users", action: "Remove password login", record: su.email }); }
        else { su.pw = demoHash(payload.password); su.mustChange = payload.mustChange !== false; activity(db, ctx, { module: "Users", action: "Set password", record: su.email, newValue: "temporary password" }); }
        out = { users: pubUsers(db) }; break;

      case "auth.changePassword":
        var me = user(db, ctx.email);
        if (me.pw && !s.mustChange && me.pw !== demoHash(payload.oldPassword)) throw err("Current password is wrong.", "BAD_REQUEST");
        me.pw = demoHash(payload.newPassword); me.mustChange = false; s.mustChange = false;
        activity(db, ctx, { module: "Users", action: "Change own password", record: ctx.email, newValue: "(hidden)" });
        out = { changed: true }; break;

      case "users.save":
        need("admin");
        var em = String(payload.email || "").trim().toLowerCase();
        if (!(/@/.test(em) ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) : /^[a-z0-9._-]{3,32}$/.test(em))) throw err("Enter a valid Gmail address or username.", "BAD_REQUEST");
        if ((em === OWNER || em === ctx.email) && (payload.role !== "admin" || payload.status === "Disabled")) throw err("You cannot demote or disable this account.", "BAD_REQUEST");
        var ex = user(db, em);
        if (ex) {
          activity(db, ctx, { module: "Users", action: ex.status === "Removed" ? "Re-add user" : "Update user", record: em, oldValue: ex.role + " / " + ex.status, newValue: payload.role + " / " + (payload.status || "Active") });
          ex.role = payload.role; ex.status = payload.status === "Disabled" ? "Disabled" : "Active"; if (payload.name) ex.name = payload.name;
        } else {
          db.users.push({ email: em, name: payload.name || "", role: payload.role || "viewer", status: payload.status === "Disabled" ? "Disabled" : "Active", addedBy: ctx.email, addedOn: stamp(), lastLogin: "", lastActivity: "", notes: payload.notes || "", pw: payload.password ? demoHash(payload.password) : "", mustChange: !!payload.password });
          activity(db, ctx, { module: "Users", action: "Add user", record: em, newValue: (payload.role || "viewer") + " / Active" });
        }
        out = { users: pubUsers(db) }; break;

      case "users.remove":
        need("admin");
        var re = user(db, String(payload.email).toLowerCase());
        if (!re) throw err("User not found.", "BAD_REQUEST");
        if (re.email === OWNER || re.email === ctx.email) throw err("This account cannot be removed.", "BAD_REQUEST");
        activity(db, ctx, { module: "Users", action: "Remove user", record: re.email, oldValue: re.role + " / " + re.status, newValue: "Removed" });
        re.status = "Removed";
        out = { users: pubUsers(db) }; break;

      case "logs.query":
        need("admin");
        var list = (db[payload.type] || db.activity).slice().reverse();
        var from = payload.from ? new Date(payload.from + "T00:00:00").getTime() : null;
        var to = payload.to ? new Date(payload.to + "T23:59:59").getTime() : null;
        var fe = String(payload.email || "").toLowerCase(), ft = String(payload.text || "").toLowerCase(), fr = String(payload.result || "").toUpperCase();
        list = list.filter(function (r) {
          if (from && r._ts < from) return false;
          if (to && r._ts > to) return false;
          if (fe && String(r.Email).toLowerCase().indexOf(fe) === -1) return false;
          if (fr && String(r.Result || r.Status).toUpperCase() !== fr) return false;
          if (ft && JSON.stringify(r).toLowerCase().indexOf(ft) === -1) return false;
          return true;
        });
        var ps = payload.pageSize || 50, pg = payload.page || 1;
        out = { headers: HEAD[payload.type] || HEAD.activity, rows: payload.all ? list : list.slice((pg - 1) * ps, pg * ps), total: list.length, page: pg, pageSize: ps };
        break;

      case "logs.recent":
        out = { rows: db.activity.slice(-(payload.limit || 8)).reverse().map(function (r) { return { time: r.Timestamp, name: r.Name || r.Email, module: r.Module, action: r.Action, record: r.Record, result: r.Result }; }) };
        break;

      case "logs.error":
        (payload.entries || []).forEach(function (x) { addLog(db, "error", { Email: ctx.email, Module: x.module, Operation: x.operation, Error: x.error, "Stack / Details": x.stack, Browser: client.ua, Status: x.status || "FAILED" }); });
        out = { logged: (payload.entries || []).length }; break;

      case "logs.activity":
        (payload.entries || []).forEach(function (a) { activity(db, ctx, a); });
        out = { logged: (payload.entries || []).length }; break;

      case "backup.list": need("admin"); out = { backups: db.backups.map(function (b) { var c = clone(b); delete c.content; return c; }), total: db.backups.length, version: db.version }; break;
      case "backup.create":
        need("admin");
        var nb = makeBackup(db, payload.reason || "Manual backup", ctx.email);
        activity(db, ctx, { module: "Backup", action: "Create backup", record: nb.name, newValue: nb.reason });
        out = { backups: db.backups.map(function (b) { var c = clone(b); delete c.content; return c; }), total: db.backups.length }; break;
      case "backup.get":
        need("admin");
        var gb = db.backups.filter(function (b) { return b.id === payload.id; })[0];
        if (!gb) throw err("Backup not found", "BAD_REQUEST");
        activity(db, ctx, { module: "Backup", action: "Download backup", record: gb.name });
        out = { name: gb.name, content: gb.content }; break;
      case "backup.restore":
        need("admin");
        var rb = db.backups.filter(function (b) { return b.id === payload.id; })[0];
        if (!rb) throw err("Backup not found", "BAD_REQUEST");
        var safety = makeBackup(db, "Before restore of " + rb.name, ctx.email);
        var data = JSON.parse(rb.content);
        db.core = data.core || {}; db.records = data.records || {}; db.attendance = data.attendance || {};
        db.version++; db.lastModifiedBy = ctx.name; db.lastModifiedAt = stamp();
        activity(db, ctx, { module: "Backup", action: "Restore backup", record: rb.name, oldValue: "Safety copy: " + safety.name, newValue: "Restored to " + rb.name });
        out = { version: db.version, safetyBackup: safety.name }; break;

      case "reports.save":
        activity(db, ctx, { module: "Reports", action: "Saved report to Drive (demo — not uploaded)", record: payload.type + " / " + payload.fileName });
        out = { id: null, url: null, name: payload.fileName, demo: true }; break;

      default: throw err("Unknown action: " + action, "BAD_REQUEST");
    }
    store(db);
    return out;
  }

  window.LocalBackend = {
    OWNER: OWNER,
    users: function () { return load().users.filter(function (u) { return u.status !== "Removed"; }); },
    call: function (action, payload, token, client) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(handle(action, payload, token, client)); } catch (e) { reject(e); }
        }, 120 + Math.random() * 180);
      });
    },
    reset: function () { localStorage.removeItem(KEY); }
  };
})();
