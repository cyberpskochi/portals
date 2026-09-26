/* =========================================================================
   admin.js — Users & Access, Audit Logs, Backups & Restore, Settings.
   ========================================================================= */
"use strict";

const ROLE_INFO={
  admin:{label:"Administrator",desc:"Everything: users & Gmail IDs, roster, duty order, settings, audit logs, backups & restore."},
  editor:{label:"Duty Editor",desc:"Daily duty charts, attendance, Friday parade, duty types, cyber tips and exports."},
  viewer:{label:"Viewer",desc:"View duty charts, parade and attendance; export and print. No editing."}
};
function roleTag(r){ return `<span class="role-tag role-${r}">${esc((ROLE_INFO[r]||{}).label||r)}</span>`; }
function shortUA(ua){
  ua=String(ua||""); if(!ua) return "";
  const b=/Edg\//.test(ua)?"Edge":/OPR\//.test(ua)?"Opera":/Chrome\//.test(ua)?"Chrome":/Firefox\//.test(ua)?"Firefox":/Safari\//.test(ua)?"Safari":"Browser";
  const o=/Windows/.test(ua)?"Windows":/Android/.test(ua)?"Android":/iPhone|iPad/.test(ua)?"iOS":/Mac OS/.test(ua)?"macOS":/Linux/.test(ua)?"Linux":"";
  return b+(o?" · "+o:"");
}

/* =======================================================================
   USERS & ACCESS
   ======================================================================= */
function renderUsers(el){
  el.innerHTML=`
  <div class="grid side">
    <div class="card">
      <div class="card-head"><h2>${ic("userPlus")}Add a user</h2><span class="spacer"></span><div class="seg" id="uType"><button data-t="gmail" class="on">Gmail (Google sign-in)</button><button data-t="user">Username &amp; password</button></div></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="field"><label id="uEmailLbl">Gmail / Google account *</label><input class="input" id="uEmail" placeholder="officer@gmail.com" autocomplete="off" autocapitalize="none"></div>
          <div class="field"><label>Name &amp; rank</label><input class="input" id="uName" placeholder="e.g. SI Ananthu Ramesh"></div>
          <div class="field"><label>Role</label><select class="select" id="uRole"><option value="editor">Duty Editor</option><option value="viewer">Viewer</option><option value="admin">Administrator</option></select></div>
          <div class="field"><label id="uPwLbl">Password (optional)</label><input class="input" id="uPw" type="text" placeholder="Temporary password" autocomplete="off"></div>
          <div class="field full"><button class="btn primary" id="uAdd">${ic("userPlus")}Add user</button></div>
        </div>
        <p class="hint" id="uHint" style="margin:12px 0 0">The officer signs in with “Sign in with Google” using exactly this Gmail ID. If you also give a password, they can sign in with the Gmail ID + password too.</p>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>${ic("shield")}Roles</h2></div>
      <div class="card-body">${Object.entries(ROLE_INFO).map(([k,v])=>`<div style="margin-bottom:10px">${roleTag(k)}<div class="small muted" style="margin-top:3px">${esc(v.desc)}</div></div>`).join("")}</div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>${ic("users")}Authorised users</h2><span class="spacer"></span><label class="check small"><input type="checkbox" id="uShowRem" ${UI.users.showRemoved?"checked":""}> Show removed</label><button class="btn sm" id="uReload">${ic("refresh")}Reload</button></div>
    <div id="uTable">${loadingBlock("Loading users…")}</div>
  </div>`;
  const load=async()=>{
    try{ const r=await api("users.list",{}); drawUsers(r.users); }
    catch(e){ if(isAuthError(e)) return onAuthLost(e); $("#uTable",el).innerHTML=`<div class="empty">${ic("alert")}${esc(e.message)}</div>`; }
  };
  const drawUsers=(users)=>{
    const me=USER().email;
    const list=users.filter(u=>UI.users.showRemoved||u.status!=="Removed");
    $("#uTable",el).innerHTML=`<div class="table-wrap"><table class="data"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th>Last activity</th><th>Added</th><th></th></tr></thead><tbody>
      ${list.map(u=>{
        const locked=u.isOwner||u.email===me;
        return `<tr data-email="${esc(u.email)}" class="${u.status==="Active"?"":"inactive"}">
          <td><div class="row" style="gap:10px;flex-wrap:nowrap"><div class="avatar" style="width:32px;height:32px;font-size:13px">${esc(initials(u.name||u.email))}</div><div><b>${esc(u.name||"—")}</b>${u.isOwner?` <span class="tag gold">Owner</span>`:""}${u.email===me?` <span class="tag blue">You</span>`:""}<div class="small muted mono">${esc(u.email)}</div>
            <div class="row" style="gap:4px;margin-top:3px">${u.email.includes("@")?`<span class="tag blue">Google</span>`:""}${u.hasPassword?`<span class="tag violet">Password</span>`:""}${u.mustChange&&u.hasPassword?`<span class="tag amber">Must change</span>`:""}${u.locked?`<span class="tag red">Locked</span>`:""}</div></div></div></td>
          <td>${locked||u.status==="Removed"?roleTag(u.role):`<select class="select sm" data-role>${Object.keys(ROLE_INFO).map(r=>`<option value="${r}" ${r===u.role?"selected":""}>${ROLE_INFO[r].label}</option>`).join("")}</select>`}</td>
          <td>${u.status==="Removed"?`<span class="tag red">Removed</span>`:locked?`<span class="tag green">Active</span>`:`<label class="check"><input type="checkbox" data-active ${u.status==="Active"?"checked":""}> ${u.status}</label>`}</td>
          <td class="small mono">${esc(u.lastLogin||"—")}</td>
          <td class="small mono">${esc(u.lastActivity||"—")}</td>
          <td class="small">${esc(u.addedOn||"")}<div class="muted">${esc(u.addedBy||"")}</div></td>
          <td><div class="row end" style="gap:2px;flex-wrap:nowrap">${u.status==="Removed"?(locked?"":`<button class="btn sm" data-readd>${ic("restore")}Re-add</button>`):`<button class="icon-only" data-setpw title="${u.hasPassword?"Reset password":"Set password"}">${ic("key")}</button>${locked?"":`<button class="icon-only danger" data-remove title="Remove access">${ic("trash")}</button>`}`}</div></td>
        </tr>`;
      }).join("")||`<tr><td colspan="7"><div class="empty">No users.</div></td></tr>`}</tbody></table></div>`;
    $$("tr[data-email]",el).forEach(tr=>{
      const u=users.find(x=>x.email===tr.dataset.email);
      const save=async(patch,msg)=>{
        try{ const r=await api("users.save",Object.assign({email:u.email,name:u.name,role:u.role,status:u.status==="Removed"?"Active":u.status},patch)); toast(msg,"success"); drawUsers(r.users); }
        catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); load(); }
      };
      const rs=$("[data-role]",tr); if(rs) rs.onchange=()=>save({role:rs.value},`${u.email} is now ${ROLE_INFO[rs.value].label}.`);
      const ac=$("[data-active]",tr); if(ac) ac.onchange=()=>save({status:ac.checked?"Active":"Disabled"},`${u.email} ${ac.checked?"enabled":"disabled"}.`);
      const ra=$("[data-readd]",tr); if(ra) ra.onclick=()=>save({status:"Active"},`${u.email} re-added.`);
      const sp=$("[data-setpw]",tr); if(sp) sp.onclick=()=>setPasswordModal(u,drawUsers);
      const rm=$("[data-remove]",tr); if(rm) rm.onclick=async()=>{
        if(!await confirmBox({title:"Remove access",message:`Remove <b>${esc(u.email)}</b> from the authorised list? They will be signed out within a minute. Their past activity stays in the logs.`,confirmText:"Remove access",danger:true})) return;
        try{ const r=await api("users.remove",{email:u.email}); toast("Access removed for "+u.email,"success"); drawUsers(r.users); }
        catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); }
      };
    });
  };
  let uType="gmail";
  $$("#uType button",el).forEach(b=>b.onclick=()=>{
    uType=b.dataset.t; $$("#uType button",el).forEach(x=>x.classList.toggle("on",x===b));
    $("#uEmailLbl",el).textContent=uType==="gmail"?"Gmail / Google account *":"Username *";
    $("#uEmail",el).placeholder=uType==="gmail"?"officer@gmail.com":"e.g. si.ananthu";
    $("#uPwLbl",el).textContent=uType==="gmail"?"Password (optional)":"Temporary password *";
    $("#uHint",el).textContent=uType==="gmail"?"The officer signs in with “Sign in with Google” using exactly this Gmail ID. If you also give a password, they can sign in with the Gmail ID + password too.":"The officer signs in with this username and the temporary password, and must choose their own password at the first sign-in. Username: 3–32 small letters, numbers, dot, dash or underscore.";
  });
  $("#uAdd",el).onclick=async()=>{
    const email=$("#uEmail",el).value.trim().toLowerCase(), name=$("#uName",el).value.trim(), role=$("#uRole",el).value, password=$("#uPw",el).value;
    if(uType==="gmail"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast("Enter a valid Gmail address.","warn"); return; }
    if(uType==="user"&&!/^[a-z0-9._-]{3,32}$/.test(email)){ toast("Username: 3–32 small letters, numbers, dot, dash or underscore (no spaces).","warn"); return; }
    if(uType==="user"&&!password){ toast("Give a temporary password for a username account.","warn"); return; }
    if(password&&(password.length<8||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))){ toast("Password must be at least 8 characters with letters and numbers.","warn"); return; }
    try{ const r=await api("users.save",{email,name,role,status:"Active",password}); toast(`${email} can now sign in as ${ROLE_INFO[role].label}.`+(password?" Share the temporary password privately.":""),"success"); $("#uEmail",el).value=""; $("#uName",el).value=""; $("#uPw",el).value=""; drawUsers(r.users); }
    catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); }
  };
  $("#uShowRem",el).onchange=e=>{ UI.users.showRemoved=e.target.checked; load(); };
  $("#uReload",el).onclick=load;
  load();
}

function randomTempPassword(){
  const a="abcdefghjkmnpqrstuvwxyz", A="ABCDEFGHJKLMNPQRSTUVWXYZ", d="23456789";
  const pick=s=>s[Math.floor(Math.random()*s.length)];
  return pick(A)+pick(a)+pick(a)+pick(a)+pick(d)+pick(d)+pick(d)+pick(a)+pick(A);
}
function setPasswordModal(u,after){
  const isGmail=u.email.includes("@");
  openModal({title:(u.hasPassword?"Reset password — ":"Set password — ")+(u.name||u.email),body:`
    <p>Login ID: <b class="mono">${esc(u.email)}</b></p>
    <div class="form-grid">
      <div class="field full"><label>New temporary password</label><div class="row" style="flex-wrap:nowrap"><input class="input mono" id="spPw" style="flex:1" value="${randomTempPassword()}"><button class="btn sm" id="spGen" type="button">${ic("refresh")}New</button></div></div>
      <div class="field full"><label class="check"><input type="checkbox" id="spMust" checked> Officer must choose a new password at next sign-in (recommended)</label></div>
    </div>
    <p class="hint">Give the password to the officer privately. It is stored only as a secure hash — nobody, including the Administrator, can see it later. Resetting also unlocks an account locked by wrong passwords.</p>`,
    onOpen:(el)=>{ $("#spGen",el).onclick=()=>{ $("#spPw",el).value=randomTempPassword(); }; },
    actions:[
      ...(u.hasPassword&&isGmail?[{label:"Remove password login",cls:"danger",onClick:async(close)=>{ try{ const r=await api("users.setPassword",{email:u.email,clear:true}); close(); toast("Password login removed — Google sign-in only.","success"); after(r.users); }catch(e){ toast(e.message,"error"); } return false; }}]:[]),
      {label:"Cancel"},
      {label:"Save password",cls:"primary",icon:"key",onClick:async(close,el)=>{
        const pw=$("#spPw",el).value.trim();
        if(pw.length<8||!/[A-Za-z]/.test(pw)||!/[0-9]/.test(pw)){ toast("Password must be at least 8 characters with letters and numbers.","warn"); return false; }
        try{ const r=await api("users.setPassword",{email:u.email,password:pw,mustChange:$("#spMust",el).checked}); close(); toast("Password saved for "+u.email+".","success"); after(r.users); }
        catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); }
        return false;
      }}
    ]});
}

/* =======================================================================
   AUDIT LOGS
   ======================================================================= */
const LOG_TYPES={
  login:{label:"Login log",icon:"key",results:["SUCCESS","FAILED","EXPIRED","DENIED"]},
  activity:{label:"Activity log",icon:"activity",results:["SUCCESS"]},
  error:{label:"Error log",icon:"alert",results:["FAILED","RECOVERED"]}
};
function renderLogs(el){
  const L=UI.logs;
  el.innerHTML=`<div class="card">
    <div class="tabs" id="lgTabs">${Object.entries(LOG_TYPES).map(([k,v])=>`<button data-t="${k}" class="${L.type===k?"on":""}">${ic(v.icon)}${v.label}</button>`).join("")}</div>
    <div class="filters">
      <div class="field"><label>From</label><input type="date" class="input sm" id="lgFrom" value="${L.from}"></div>
      <div class="field"><label>To</label><input type="date" class="input sm" id="lgTo" value="${L.to}"></div>
      <div class="field"><label>User e-mail</label><input class="input sm" id="lgEmail" value="${esc(L.email)}" placeholder="any"></div>
      <div class="field"><label>Result</label><select class="select sm" id="lgRes"><option value="">Any</option>${LOG_TYPES[L.type].results.map(r=>`<option ${L.result===r?"selected":""}>${r}</option>`).join("")}</select></div>
      <div class="field"><label>Contains text</label><input class="input sm" id="lgText" value="${esc(L.text)}" placeholder="officer, duty, date…"></div>
      <div class="row"><button class="btn sm primary" id="lgGo">${ic("search")}Search</button><button class="btn sm" id="lgXls" title="Export all matching rows">${ic("download")}Excel</button></div>
    </div>
    <div id="lgTable">${loadingBlock("Loading log…")}</div>
  </div>
  <p class="hint">${ic("lock")} Logs are append-only: they are written by the server into the station's Google Sheet and cannot be edited or deleted from this application.</p>`;
  const read=()=>{ L.from=$("#lgFrom",el).value; L.to=$("#lgTo",el).value; L.email=$("#lgEmail",el).value.trim(); L.result=$("#lgRes",el).value; L.text=$("#lgText",el).value.trim(); };
  $$("#lgTabs button",el).forEach(b=>b.onclick=()=>{ L.type=b.dataset.t; L.page=1; L.result=""; renderLogs(el); });
  $("#lgGo",el).onclick=()=>{ read(); L.page=1; load(); };
  $$("#lgText,#lgEmail",el).forEach(i=>i.onkeydown=e=>{ if(e.key==="Enter"){ read(); L.page=1; load(); } });
  $("#lgXls",el).onclick=async()=>{
    read();
    try{ const r=await api("logs.query",{type:L.type,from:L.from,to:L.to,email:L.email,text:L.text,result:L.result,all:true}); if(!r.rows.length){ toast("Nothing to export.","info"); return; } exportLogsXlsx(L.type,r.rows.map(x=>{ const c=Object.assign({},x); delete c._ts; return c; })); }
    catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); }
  };
  const load=async()=>{
    const box=$("#lgTable",el); box.innerHTML=loadingBlock("Loading log…");
    try{
      const r=await api("logs.query",{type:L.type,from:L.from,to:L.to,email:L.email,text:L.text,result:L.result,page:L.page,pageSize:50});
      box.innerHTML=logTable(L.type,r.rows)+`<div class="pager"><span>${r.total} matching entr${r.total===1?"y":"ies"}${r.windowLimited?" (newest "+r.scanned+" rows searched)":""}</span>
        <button class="btn sm" id="lgPrev" ${L.page<=1?"disabled":""}>${ic("chevL")}</button><span class="mono">${L.page} / ${Math.max(1,Math.ceil(r.total/r.pageSize))}</span><button class="btn sm" id="lgNext" ${L.page*r.pageSize>=r.total?"disabled":""}>${ic("chevR")}</button></div>`;
      $("#lgPrev",box).onclick=()=>{ L.page--; load(); };
      $("#lgNext",box).onclick=()=>{ L.page++; load(); };
      $$("[data-more]",box).forEach(b=>b.onclick=()=>openModal({title:"Log entry",wide:true,body:`<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:12px;margin:0">${esc(JSON.stringify(r.rows[+b.dataset.more],(k,v)=>k==="_ts"?undefined:v,2))}</pre>`,actions:[{label:"Close"}]}));
    }catch(e){ if(isAuthError(e)) return onAuthLost(e); box.innerHTML=`<div class="empty">${ic("alert")}${esc(e.message)}</div>`; }
  };
  load();
}
function logTable(type,rows){
  if(!rows.length) return `<div class="empty">${ic("logs")}No log entries match these filters.</div>`;
  const res=v=>`<span class="res ${esc(String(v).toUpperCase())}">${esc(v)}</span>`;
  let head, body;
  if(type==="login"){
    head=["Time","User","Event","Result","IP","Browser","Details",""];
    body=rows.map((r,i)=>`<tr><td class="mono small">${esc(r.Timestamp)}</td><td><b>${esc(r.Name||"")}</b><div class="small muted">${esc(r.Email)}</div></td><td><span class="tag ${/SUCCESS/.test(r.Event)?"green":/LOGOUT/.test(r.Event)?"grey":"red"}">${esc(r.Event)}</span></td><td>${res(r.Result)}</td><td class="mono small">${esc(r.IP)}</td><td class="small">${esc(shortUA(r.Browser))}</td><td class="logcell">${esc(r.Details)}</td><td><button class="icon-only" data-more="${i}">${ic("eye")}</button></td></tr>`);
  }else if(type==="activity"){
    head=["Time","User","Module","Action","Record","Old value","New value",""];
    body=rows.map((r,i)=>`<tr><td class="mono small">${esc(r.Timestamp)}</td><td><b>${esc(r.Name||r.Email)}</b><div class="small">${r.Role?roleTag(r.Role):""}</div></td><td><span class="tag blue">${esc(r.Module)}</span></td><td><b>${esc(r.Action)}</b></td><td class="logcell">${esc(r.Record)}</td><td class="logcell" style="color:var(--red)">${esc(r["Old Value"])}</td><td class="logcell" style="color:var(--green)">${esc(r["New Value"])}</td><td><button class="icon-only" data-more="${i}">${ic("eye")}</button></td></tr>`);
  }else{
    head=["Time","User","Module","Operation","Error","Browser","Status",""];
    body=rows.map((r,i)=>`<tr><td class="mono small">${esc(r.Timestamp)}</td><td class="small">${esc(r.Email)}</td><td><span class="tag amber">${esc(r.Module)}</span></td><td>${esc(r.Operation)}</td><td class="logcell" style="color:var(--red)">${esc(r.Error)}</td><td class="small">${esc(shortUA(r.Browser))}</td><td>${res(r.Status)}</td><td><button class="icon-only" data-more="${i}">${ic("eye")}</button></td></tr>`);
  }
  return `<div class="table-wrap"><table class="data"><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${body.join("")}</tbody></table></div>`;
}

/* =======================================================================
   BACKUPS & RESTORE
   ======================================================================= */
function renderBackups(el){
  const legacy=lsGet("cyberps-kochi-duty-state-v3");
  el.innerHTML=`
  <div class="grid cols-3">
    <div class="card"><div class="card-body">
      <h3 style="font-size:17px;color:var(--navy)">${ic("database")} Backup now</h3>
      <p class="hint">A full copy of all duty charts, roster, attendance and settings is written to <b>Drive ▸ CyberPS_Duty_App ▸ Backups</b>. Automatic backups are also taken every ${DEMO?"30":"30"} minutes of activity and every night.</p>
      <button class="btn primary" id="bkNow">${ic("database")}Create backup</button>
    </div></div>
    <div class="card"><div class="card-body">
      <h3 style="font-size:17px;color:var(--navy)">${ic("download")} Export all data</h3>
      <p class="hint">Download everything as one JSON file — useful for an offline archive or to move the data to another Drive.</p>
      <button class="btn" id="bkExport">${ic("download")}Export JSON</button>
    </div></div>
    <div class="card"><div class="card-body">
      <h3 style="font-size:17px;color:var(--navy)">${ic("upload")} Import / migrate</h3>
      <p class="hint">Load an exported JSON file, or the <span class="mono">cyberps-kochi-duty-state-v3.json</span> file saved by the old single-page duty chart. A safety backup is taken first.</p>
      <div class="row"><label class="btn">${ic("upload")}Choose file<input type="file" id="bkFile" accept=".json,application/json" hidden></label>
      ${legacy?`<button class="btn gold" id="bkLegacy">${ic("upload")}Import from this browser</button>`:""}</div>
    </div></div>
  </div>
  <div class="card">
    <div class="card-head"><h2>${ic("restore")}Version history</h2><span class="sub">Restore puts the whole system back to that moment (a safety copy of the current data is taken first, so a restore can itself be undone).</span><span class="spacer"></span><button class="btn sm" id="bkReload">${ic("refresh")}Reload</button></div>
    <div id="bkTable">${loadingBlock("Loading backups…")}</div>
  </div>`;
  const load=async()=>{
    try{
      const r=await api("backup.list",{});
      $("#bkTable",el).innerHTML=r.backups.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Created</th><th>Reason</th><th>By</th><th class="num">Data version</th><th class="num">Size</th><th></th></tr></thead><tbody>
        ${r.backups.map(b=>`<tr data-id="${esc(b.id)}"><td class="mono small">${esc(b.created)}</td><td><b>${esc(b.reason||b.name)}</b><div class="small muted mono">${esc(b.name)}</div></td><td class="small">${esc(b.createdBy)}</td><td class="num">${esc(b.version)}</td><td class="num">${(b.size/1024).toFixed(0)} KB</td>
          <td><div class="row end"><button class="btn sm" data-dl>${ic("download")}Download</button><button class="btn sm danger" data-restore>${ic("restore")}Restore</button></div></td></tr>`).join("")}
      </tbody></table></div>`:`<div class="empty">${ic("database")}No backups yet — create the first one above.</div>`;
      $$("tr[data-id]",el).forEach(tr=>{
        const b=r.backups.find(x=>x.id===tr.dataset.id);
        $("[data-dl]",tr).onclick=async()=>{ try{ const g=await api("backup.get",{id:b.id}); downloadBlob(new Blob([g.content],{type:"application/json"}),g.name); }catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); } };
        $("[data-restore]",tr).onclick=async()=>{
          if(Sync.dirty.size){ toast("Please wait until all changes are saved.","warn"); return; }
          if(!await confirmBox({title:"Restore backup",message:`Restore all data to <b>${esc(b.created)}</b> (${esc(b.reason)})?<br><br>Every officer will see the restored duty charts. The current data is saved as a safety backup first.`,confirmText:"Restore",danger:true,requireText:"RESTORE"})) return;
          try{ const x=await api("backup.restore",{id:b.id}); toast("Restored. Safety copy: "+x.safetyBackup,"success",7000); await refreshFromServer(true); load(); }
          catch(e){ if(isAuthError(e)) return onAuthLost(e); toast("Restore failed: "+e.message,"error"); reportError("Backup","Restore",e); }
        };
      });
    }catch(e){ if(isAuthError(e)) return onAuthLost(e); $("#bkTable",el).innerHTML=`<div class="empty">${ic("alert")}${esc(e.message)}</div>`; }
  };
  $("#bkReload",el).onclick=load;
  $("#bkNow",el).onclick=async()=>{
    const reason=await promptBox({title:"Create backup",label:"Reason / label",value:"Manual backup",confirmText:"Create backup"});
    if(reason===null) return;
    await flush();
    try{ await api("backup.create",{reason:reason||"Manual backup"}); toast("Backup created in Google Drive.","success"); load(); }
    catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); }
  };
  $("#bkExport",el).onclick=async()=>{
    try{ const d=await api("data.exportAll",{}); downloadBlob(new Blob([JSON.stringify(d,null,1)],{type:"application/json"}),`CyberPS_Duty_Data_${dateKey(new Date())}.json`); toast("Export downloaded.","success"); }
    catch(e){ if(isAuthError(e)) return onAuthLost(e); toast(e.message,"error"); }
  };
  $("#bkFile",el).onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{ try{ importData(JSON.parse(rd.result),f.name); }catch(err){ toast("That file is not valid JSON.","error"); } };
    rd.readAsText(f); e.target.value="";
  };
  const lb=$("#bkLegacy",el); if(lb) lb.onclick=()=>{ try{ importData(JSON.parse(legacy),"old duty chart (this browser)"); }catch(e){ toast("Old data in this browser could not be read.","error"); } };
  load();
}

function convertImport(obj){
  if(obj&&obj.core&&typeof obj.core==="object") return {core:obj.core,records:obj.records||{},attendance:obj.attendance||{}};
  if(obj&&obj.personnel&&(obj.records||obj.strengthTable)){
    const tmp=clone(obj); tmp.meta=Object.assign({},tmp.meta||{},{rosterOrdered:false,importedFrom:"legacy single-page duty chart"});
    (tmp.personnel||[]).forEach(p=>{ if(!p.status) p.status="active"; });
    migrateState(tmp);
    const core={}; CORE_KEYS.forEach(k=>{ if(tmp[k]!==undefined) core[k]=tmp[k]; });
    return {core,records:tmp.records||{},attendance:{}};
  }
  throw new Error("This file does not contain duty chart data.");
}
async function importData(obj,label){
  let data;
  try{ data=convertImport(obj); }catch(e){ toast(e.message,"error"); return; }
  const nRec=Object.keys(data.records).length, nPer=(data.core.personnel||[]).length;
  if(!await confirmBox({title:"Import data",message:`Import <b>${esc(label)}</b>: ${nPer} officers and ${nRec} daily duty charts.<br><br>This <b>replaces all current data</b> for every user. A safety backup is taken first.`,confirmText:"Import",danger:true,requireText:"IMPORT"})) return;
  try{ await api("data.replaceAll",{data,reason:label}); toast("Import complete.","success"); LOADED_YEARS=new Set(); await refreshFromServer(true); navigate("dashboard"); }
  catch(e){ if(isAuthError(e)) return onAuthLost(e); toast("Import failed: "+e.message,"error"); reportError("Backup","Import",e); }
}

/* =======================================================================
   SETTINGS
   ======================================================================= */
function renderSettings(el){
  const s=settings();
  const offs=allOffLabels();
  el.innerHTML=`
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><h2>${ic("settings")}Station &amp; reports</h2></div>
      <div class="card-body"><div class="form-grid">
        <div class="field full"><label>Station name (report sub-title)</label><input class="input" id="stName" value="${esc(s.stationName)}"></div>
        <div class="field"><label>City</label><input class="input" id="stCity" value="${esc(s.stationCity)}"></div>
        <div class="field"><label>Short name in report title</label><input class="input" id="stShort" value="${esc(s.reportShort)}"></div>
        <div class="field"><label>Duty Editors can edit a chart until (hour, same day)</label><input type="number" min="0" max="24" class="input" id="stLock" value="${esc(s.editLockHour??12)}"><span class="hint">12 = noon. Earlier dates and later changes: Administrator only.</span></div>
        <div class="field"><label>Expected strength (officers)</label><input type="number" min="0" class="input" id="stExp" value="${esc(s.expectedStrength)}"></div>
        <div class="field full"><label class="check"><input type="checkbox" id="stSenior" ${s.seniorDutiesFirst!==false?"checked":""}> Show duties of ACP / IP officers at the top of the Duty Detailing</label></div>
        <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" id="stDrive" ${s.saveReportsToDrive?"checked":""}> Save a copy of every exported PDF / Excel in Drive ▸ Reports</label></div>
      </div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>${ic("shield")}Permissions</h2></div>
      <div class="card-body">
        <label class="check" style="margin-bottom:10px"><input type="checkbox" id="pmPers" ${s.permissions.editorsManagePersonnel?"checked":""}> Duty Editors may add / edit / reorder / transfer officers</label><br>
        <label class="check"><input type="checkbox" id="pmOrder" ${s.permissions.editorsReorderDuties?"checked":""}> Duty Editors may change the duty priority order</label>
        <p class="hint" style="margin-top:14px">Gmail IDs and roles are managed under <a href="#/users">Users &amp; Access</a>. These rules are also enforced by the server.</p>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>${ic("calendar")}Attendance codes</h2><span class="sub">How each duty-chart entry appears in the attendance register</span></div>
    <div class="card-body">
      <div class="row" style="margin-bottom:14px"><div class="field"><label>Present / on any duty</label><input class="input mono" id="acPresent" value="${esc(s.presentCode||"P")}" maxlength="6" style="width:110px"></div></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Off duty / Leave / Rest type</th><th>Default code</th><th>Code used</th></tr></thead><tbody>
        ${offs.map(l=>`<tr><td><b>${esc(l)}</b></td><td class="mono">${esc(defaultCodeFor(l))}</td><td><input class="input sm mono ac" data-l="${esc(l)}" value="${esc(codeForOffLabel(l))}" maxlength="6" style="width:110px"></td></tr>`).join("")}
      </tbody></table></div>
    </div>
  </div>
  <div class="row end" style="margin-bottom:18px"><button class="btn primary" id="stSave">${ic("check")}Save settings</button></div>
  <div class="card">
    <div class="card-head"><h2>${ic("info")}System information</h2></div>
    <div class="card-body"><table class="data"><tbody>
      <tr><td>Storage</td><td>${DEMO?`<span class="tag amber">Demo mode — this browser only</span>`:`<span class="tag green">Google Drive (Apps Script backend)</span>`}</td></tr>
      ${DEMO?"":`<tr><td>Backend URL</td><td class="mono small wrap">${esc(CFG.API_URL.replace(/(macros\/s\/.{6}).+(.{6}\/exec)/,"$1…$2"))}</td></tr>`}
      <tr><td>Data version</td><td class="mono">${esc(S.version)}</td></tr>
      <tr><td>Last change</td><td>${esc(SERVER_INFO.lastModifiedAt||"—")} ${SERVER_INFO.lastModifiedBy?"by "+esc(SERVER_INFO.lastModifiedBy):""}</td></tr>
      <tr><td>Signed in as</td><td>${esc(USER().name)} · <span class="mono">${esc(USER().email)}</span> · ${roleTag(USER().role)} · session <span class="mono">${esc(USER().sid||"")}</span></td></tr>
      <tr><td>Application</td><td>Duty Management System v${APP_VERSION}</td></tr>
    </tbody></table>
    ${DEMO?`<div class="row" style="margin-top:14px"><button class="btn danger" id="demoReset">${ic("trash")}Reset demo data</button></div>`:""}</div>
  </div>`;
  $("#stSave",el).onclick=()=>{
    const ns=clone(s);
    ns.stationName=$("#stName",el).value.trim()||DEFAULT_SETTINGS.stationName;
    ns.stationCity=$("#stCity",el).value.trim()||DEFAULT_SETTINGS.stationCity;
    ns.reportShort=$("#stShort",el).value.trim()||DEFAULT_SETTINGS.reportShort;
    ns.expectedStrength=Math.max(0,parseInt($("#stExp",el).value||"0",10)||0);
    ns.saveReportsToDrive=$("#stDrive",el).checked;
    ns.seniorDutiesFirst=$("#stSenior",el).checked;
    ns.editLockHour=Math.min(24,Math.max(0,parseInt($("#stLock",el).value||"12",10)||0));
    ns.permissions={editorsManagePersonnel:$("#pmPers",el).checked,editorsReorderDuties:$("#pmOrder",el).checked};
    ns.presentCode=($("#acPresent",el).value.trim()||"P").toUpperCase();
    ns.attendanceCodes={};
    $$(".ac",el).forEach(i=>{ const v=i.value.trim().toUpperCase(); if(v&&v!==defaultCodeFor(i.dataset.l)) ns.attendanceCodes[i.dataset.l]=v; });
    const olds=[],news=[];
    const flat=(o,p="")=>Object.entries(o).reduce((a,[k,v])=>Object.assign(a,v&&typeof v==="object"?flat(v,p+k+"."):{[p+k]:v}),{});
    const fo=flat(s), fn=flat(ns);
    new Set(Object.keys(fo).concat(Object.keys(fn))).forEach(k=>{ if(String(fo[k]??"")!==String(fn[k]??"")){ olds.push(`${k}: ${fo[k]??""}`); news.push(`${k}: ${fn[k]??""}`); } });
    if(!olds.length){ toast("No changes to save.","info"); return; }
    S.settings=ns; markDirty("settings");
    audit("Settings","Change settings",`${olds.length} setting(s)`,olds.join("; "),news.join("; "));
    toast("Settings saved.","success"); renderShellUser(); renderSettings(el);
  };
  const dr=$("#demoReset",el); if(dr) dr.onclick=async()=>{ if(!await confirmBox({title:"Reset demo",message:"Erase all demo data in this browser?",confirmText:"Reset",danger:true})) return; window.LocalBackend.reset(); lsDel(LS_CACHE); clearSession(); location.reload(); };
}
