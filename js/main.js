/* =========================================================================
   main.js — sign-in, application shell, navigation, polling and start-up.
   ========================================================================= */
"use strict";

const PAGES={
  dashboard:{title:"Dashboard",icon:"dashboard",group:"Operations",render:renderDashboard},
  duty:{title:"Duty Chart",icon:"clipboard",group:"Operations",render:renderDuty},
  parade:{title:"Friday Parade",icon:"flag",group:"Operations",render:renderParade},
  attendance:{title:"Attendance",icon:"calendar",group:"Operations",render:renderAttendance},
  personnel:{title:"Personnel",icon:"users",group:"Management",render:renderPersonnel},
  setup:{title:"Duty Setup",icon:"list",group:"Management",render:renderSetup},
  users:{title:"Users & Access",icon:"shield",group:"Administration",render:renderUsers,admin:true},
  logs:{title:"Audit Logs",icon:"logs",group:"Administration",render:renderLogs,admin:true},
  backups:{title:"Backups & Restore",icon:"database",group:"Administration",render:renderBackups,admin:true},
  settings:{title:"Settings",icon:"settings",group:"Administration",render:renderSettings,admin:true}
};

/* ------------------------------------------------------------ sign-in */
function showLogin(message){
  $("#appShell").hidden=true;
  $("#loginScreen").hidden=false;
  const err=$("#loginError");
  if(message){ err.textContent=message; err.hidden=false; } else err.hidden=true;
  if(DEMO) renderDemoLogin(); else initGSI();
  wirePasswordLogin();
}
function wirePasswordLogin(){
  const f=$("#pwLogin"); if(!f||f.dataset.wired) return;
  f.dataset.wired="1";
  $("#pwEye").onclick=()=>{ const i=$("#pwPass"); i.type=i.type==="password"?"text":"password"; };
  f.onsubmit=e=>{
    e.preventDefault();
    const u=$("#pwUser").value.trim(), pw=$("#pwPass").value;
    if(!u||!pw){ loginError("Enter your username and password."); return; }
    doLogin({username:u,password:pw},"auth.passwordLogin");
  };
}
function loginBusy(msg){
  const pb=$("#pwGo"); if(pb){ pb.disabled=!!msg; }
  $("#loginLoading").hidden=!msg;
  if(msg) $("#loginLoading").innerHTML=`<span class="spinner"></span> ${esc(msg)}`;
  $("#gsiButton").style.display=msg?"none":"flex";
  $("#demoLogin").style.opacity=msg?".4":"1";
}
function loginError(msg){ const e=$("#loginError"); e.textContent=msg; e.hidden=false; loginBusy(null); }

function renderDemoLogin(){
  loginBusy(null);
  $("#gsiButton").hidden=true;
  const box=$("#demoLogin"); box.hidden=false;
  const users=window.LocalBackend.users();
  box.innerHTML=`<span class="demo-badge">DEMO MODE</span>
    <p>Google Drive is not connected yet (see <span class="mono">js/config.js</span>). Choose an account to try the system — data stays in this browser.</p>
    <div class="demo-roles">${users.map(u=>`<button class="demo-role" data-email="${esc(u.email)}"><span class="av">${esc(initials(u.name))}</span><span><b>${esc(u.name)}</b><small>${esc(u.email)} · ${esc((ROLE_INFO[u.role]||{}).label||u.role)}</small></span></button>`).join("")}</div>
    <div class="demo-other"><input id="demoEmail" placeholder="Try another Gmail ID…"><button id="demoGo">Sign in</button></div>`;
  $$(".demo-role",box).forEach(b=>b.onclick=()=>doLogin({demoEmail:b.dataset.email}));
  $("#demoGo",box).onclick=()=>{ const v=$("#demoEmail",box).value.trim(); if(v) doLogin({demoEmail:v}); };
}

let gsiReady=false;
function initGSI(){
  $("#demoLogin").hidden=true;
  $("#gsiButton").hidden=false;
  const render=()=>{
    try{
      if(!gsiReady){
        google.accounts.id.initialize({client_id:CFG.GOOGLE_CLIENT_ID,callback:resp=>doLogin({idToken:resp.credential}),auto_select:false,cancel_on_tap_outside:true,itp_support:true,ux_mode:"popup"});
        gsiReady=true;
      }
      loginBusy(null);
      $("#gsiButton").innerHTML="";
      google.accounts.id.renderButton($("#gsiButton"),{theme:"filled_blue",size:"large",shape:"pill",text:"signin_with",logo_alignment:"left",width:300});
    }catch(e){ loginError("Google Sign-In could not start: "+e.message); reportError("Login","Initialise Google Sign-In",e); }
  };
  if(window.google&&google.accounts&&google.accounts.id){ render(); return; }
  loginBusy("Preparing secure sign-in…");
  if(!document.getElementById("gsiScript")){
    const s=document.createElement("script");
    s.src="https://accounts.google.com/gsi/client"; s.async=true; s.defer=true; s.id="gsiScript";
    s.onload=render;
    s.onerror=()=>loginError("Could not load Google Sign-In. Check the internet connection and reload the page.");
    document.head.appendChild(s);
  }else setTimeout(initGSI,400);
}

async function fetchPublicIp(){
  if(CLIENT_IP||!CFG.CAPTURE_PUBLIC_IP) return;
  try{
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),3000);
    const r=await fetch("https://api.ipify.org?format=json",{signal:ctrl.signal,cache:"no-store"});
    clearTimeout(t); const j=await r.json(); CLIENT_IP=j.ip||"";
  }catch(e){ CLIENT_IP=""; }
}

async function doLogin(creds,action){
  action=action||"auth.login";
  loginBusy(action==="auth.passwordLogin"?"Checking username and password…":"Verifying your Google account…");
  $("#loginError").hidden=true;
  await fetchPublicIp();
  try{
    const r=await api(action,creds);
    saveSession({token:r.session,user:r.user});
    const pp=$("#pwPass"); if(pp) pp.value="";
    if(r.user&&r.user.mustChangePassword){
      loginBusy(null);
      const ok=await changePasswordDialog({forced:true,oldHint:creds.password||""});
      if(!ok){ clearSession(); showLogin("Password not changed — please sign in again."); return; }
      SESSION.user.mustChangePassword=false; saveSession(SESSION);
    }
    enterApp();
  }catch(e){
    loginError(e.code==="NETWORK"?"Cannot reach the server. Check the internet connection and try again.":e.message);
    if(DEMO) renderDemoLogin();
    loginBusy(null);
  }
}

let authModalOpen=false;
function onAuthLost(e){
  if(authModalOpen) return;
  authModalOpen=true;
  saveCache();
  openModal({title:"Session expired",dismissable:false,body:`<p>${esc(e&&e.message||"Please sign in again.")}</p><p class="hint">Any unsaved changes are kept on this device and will be sent to Google Drive after you sign in again.</p>`,
    actions:[{label:"Sign in again",cls:"primary",icon:"key",onClick:(close)=>{ close(); authModalOpen=false; stopTimers(); if(SESSION){ SESSION.token=null; } showLogin(); }}]});
}

/* Change (or, when forced, set a new) password for the signed-in user. */
function changePasswordDialog({forced=false,oldHint=""}={}){
  return new Promise(resolve=>{
    let done=false;
    const m=openModal({
      title:forced?"Set your new password":"Change password",
      dismissable:!forced,
      body:`${forced?`<p>Your password was set by the Administrator. Please choose your own password to continue.</p>`:`<p class="hint">If you sign in only with Google and have no password yet, leave “Current password” blank to create one.</p>`}
        <div class="form-grid">
          <div class="field full"${forced?' hidden':''}><label>Current password</label><input class="input" type="password" id="cpOld" autocomplete="current-password" value="${esc(oldHint)}"></div>
          <div class="field"><label>New password</label><input class="input" type="password" id="cpNew" autocomplete="new-password"></div>
          <div class="field"><label>Confirm new password</label><input class="input" type="password" id="cpNew2" autocomplete="new-password"></div>
        </div>
        <p class="hint" style="margin-top:10px">At least 8 characters, with letters and numbers. Do not share your password.</p>`,
      actions:[
        ...(forced?[{label:"Sign out",onClick:c=>{ done=true; c(); resolve(false); }}]:[{label:"Cancel",onClick:c=>{ done=true; c(); resolve(false); }}]),
        {label:"Save password",cls:"primary",icon:"key",onClick:async(close,el)=>{
          const o=$("#cpOld",el).value, n=$("#cpNew",el).value, n2=$("#cpNew2",el).value;
          if(n.length<8||!/[A-Za-z]/.test(n)||!/[0-9]/.test(n)){ toast("Password must be at least 8 characters with letters and numbers.","warn"); return false; }
          if(n!==n2){ toast("The two new passwords do not match.","warn"); return false; }
          try{ await api("auth.changePassword",{oldPassword:o,newPassword:n}); done=true; close(); toast("Password saved.","success"); resolve(true); }
          catch(e){ toast(e.message,"error"); }
          return false;
        }}
      ]
    });
    const obs=new MutationObserver(()=>{ if(!document.body.contains(m.el)){ obs.disconnect(); if(!done) resolve(false); } });
    obs.observe($("#modalRoot"),{childList:true});
  });
}

async function logout(){
  const pending=Sync.dirty.size+Sync.audit.length;
  if(pending){ await flush(); }
  if(Sync.dirty.size&&!await confirmBox({title:"Unsaved changes",message:`${Sync.dirty.size} change(s) could not be sent to Google Drive yet. Signing out now will discard them from this device.`,confirmText:"Sign out anyway",danger:true})) return;
  try{ await api("auth.logout",{}); }catch(e){}
  stopTimers();
  clearSession(); lsDel(LS_CACHE);
  Sync.dirty.clear(); Sync.audit=[]; Sync.activity=[];
  S=null; LOADED_YEARS=new Set();
  try{ if(window.google&&google.accounts&&google.accounts.id) google.accounts.id.disableAutoSelect(); }catch(e){}
  showLogin();
}

/* ------------------------------------------------------------ shell */
function renderNav(){
  const nav=$("#nav"); let group="", h="";
  Object.entries(PAGES).forEach(([k,p])=>{
    if(p.admin&&!canAdmin()) return;
    if(p.group!==group){ group=p.group; h+=`<div class="nav-group">${esc(group)}</div>`; }
    h+=`<a href="#/${k}" data-page="${k}" class="${UI.page===k?"active":""}">${ic(p.icon)}<span>${esc(p.title)}</span></a>`;
  });
  nav.innerHTML=h;
  $$("a",nav).forEach(a=>a.onclick=()=>$("#appShell").classList.remove("nav-open"));
}
function renderShellUser(){
  const u=USER();
  const av=u.picture?`<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">`:esc(initials(u.name||u.email));
  $("#sideUser").innerHTML=`<div class="avatar">${av}</div><div class="who"><b>${esc(u.name||u.email)}</b><span>${esc(u.email)}</span></div><button id="pwBtn" title="Change password">${ic("key")}</button><button id="logoutBtn" title="Sign out">${ic("logout")}</button>`;
  $("#userChip").innerHTML=`<div class="avatar">${av}</div><div class="meta"><b>${esc(u.name||u.email)}</b>${roleTag(u.role)}</div>`;
  $("#logoutBtn").onclick=logout;
  $("#pwBtn").onclick=()=>changePasswordDialog();
  $("#crumb").textContent=`${settings().stationName} · ${settings().stationCity}`;
}
function renderBanner(){
  const b=$("#banner"); if(!b) return;
  let h="";
  if(DEMO) h+=`<div class="banner demo">${ic("info")}<span class="grow"><b>Demo mode.</b> Data is saved only in this browser. Put your Google Client ID and Apps Script URL in <span class="mono">js/config.js</span> to store everything in Google Drive.</span></div>`;
  if(Sync.status==="offline"&&!DEMO) h+=`<div class="banner offline">${ic("cloudOff")}<span class="grow"><b>Offline — changes are stored on this device.</b> ${Sync.dirty.size} change(s) waiting to be saved to Google Drive. ${esc(Sync.lastError||"")}</span><button class="btn sm" id="retrySync">${ic("refresh")}Retry sync</button></div>`;
  if(S&&S.__notInitialised) h+=`<div class="banner warn">${ic("alert")}<span class="grow">The database has not been initialised yet. An Administrator must sign in once to create it.</span></div>`;
  b.innerHTML=h;
  const r=$("#retrySync"); if(r) r.onclick=()=>{ Sync.retryDelay=4000; flush(); };
}
function tickClock(){
  const c=$("#clock"); if(!c) return;
  const n=new Date();
  c.textContent=n.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})+" · "+pad(n.getHours())+":"+pad(n.getMinutes());
}

/* ------------------------------------------------------------ routing */
function parseHash(){
  const h=location.hash.replace(/^#\/?/,"");
  const [page,query]=h.split("?");
  const params=new URLSearchParams(query||"");
  return {page:PAGES[page]?page:"dashboard",params};
}
function updateHash(){
  let q="";
  if(UI.page==="duty") q="?date="+dateKey(UI.date);
  if(UI.page==="parade") q="?date="+dateKey(UI.friday);
  const want="#/"+UI.page+q;
  if(location.hash!==want) history.replaceState(null,"",want);
}
function navigate(page){
  if(PAGES[page]&&PAGES[page].admin&&!canAdmin()) page="dashboard";
  UI.page=page;
  const want="#/"+page;
  if(!location.hash.startsWith(want)) history.pushState(null,"",want);
  renderPage();
}
function renderPage(){
  if(!S) return;
  closePop(); killSortables(); UI.pendingRerender=false;
  const p=PAGES[UI.page]||PAGES.dashboard;
  if(p.admin&&!canAdmin()){ UI.page="dashboard"; return renderPage(); }
  $("#pageTitle").textContent=p.title;
  document.title=`${p.title} — ${reportShort()} Duty Management`;
  $$("#nav a").forEach(a=>a.classList.toggle("active",a.dataset.page===UI.page));
  const el=$("#page");
  try{ p.render(el); }
  catch(e){ el.innerHTML=`<div class="card"><div class="empty">${ic("alert")}Something went wrong while showing this page.<br><span class="small mono">${esc(e.message)}</span></div></div>`; reportError(p.title,"Render page",e); console.error(e); }
  $$("[data-nav]",el).forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
  updateHash();
}
window.addEventListener("hashchange",()=>{
  if(!S) return;
  const {page,params}=parseHash();
  const d=params.get("date");
  if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)){ if(page==="duty") UI.date=dateFromKey(d); if(page==="parade") UI.friday=snapToFriday(dateFromKey(d)); }
  if(page!==UI.page||d){ UI.page=page; renderPage(); }
});
/* re-render after a background refresh, without disturbing someone typing */
function rerenderSafely(){
  renderNav(); renderShellUser();
  const a=document.activeElement;
  if(a&&$("#page").contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)){ UI.pendingRerender=true; return; }
  if($("#modalRoot").children.length||$("#popRoot").children.length){ UI.pendingRerender=true; return; }
  const y=window.scrollY; renderPage(); window.scrollTo(0,y);
}
document.addEventListener("focusout",()=>{ setTimeout(()=>{ if(UI.pendingRerender&&!$("#modalRoot").children.length){ const a=document.activeElement; if(!(a&&$("#page").contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))) rerenderSafely(); } },300); });

/* ------------------------------------------------------------ polling */
let pollTimer=null, clockTimer=null;
function stopTimers(){ clearInterval(pollTimer); clearInterval(clockTimer); pollTimer=clockTimer=null; }
async function poll(){
  if(!SESSION||!SESSION.token||!S||document.hidden||Sync.inflight) return;
  if(Sync.status==="offline"){ flush(); return; }
  try{
    const r=await api("data.poll",{});
    SERVER_INFO={lastModifiedBy:r.lastModifiedBy,lastModifiedAt:r.lastModifiedAt};
    if(r.version>S.version){ if(Sync.dirty.size||Sync.inflight) Sync.pendingRefresh=true; else refreshFromServer(true); }
    flushErrors();
  }catch(e){ if(isAuthError(e)) onAuthLost(e); }
}
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) poll(); });
window.addEventListener("online",()=>{ if(Sync.dirty.size) flush(); });
window.addEventListener("beforeunload",e=>{ if(Sync.dirty.size||Sync.inflight){ saveCache(); e.preventDefault(); e.returnValue=""; } });

/* ------------------------------------------------------------ enter app */
async function enterApp(){
  $("#loginScreen").hidden=true;
  $("#appShell").hidden=false;
  $("#menuBtn").innerHTML=ic("menu");
  $("#menuBtn").onclick=()=>$("#appShell").classList.toggle("nav-open");
  $("#scrim").onclick=()=>$("#appShell").classList.remove("nav-open");
  $("#syncPill").onclick=()=>{ if(Sync.status==="offline"){ Sync.retryDelay=4000; flush(); } else refreshFromServer(false); };
  renderShellUser(); renderNav(); setSyncStatus("saving");
  $("#page").innerHTML=loadingBlock("Loading duty data from "+(DEMO?"this browser":"Google Drive")+"…");
  let data=null;
  try{
    data=await api("data.bootstrap",{});
  }catch(e){
    if(isAuthError(e)){ clearSessionTokenOnly(); showLogin(e.message); return; }
    if(e.code==="PASSWORD_CHANGE"){ const ok=await changePasswordDialog({forced:true}); if(ok){ enterApp(); } else { clearSession(); showLogin(); } return; }
    const cache=readCache();
    if(cache&&cache.state&&cache.email===USER().email){
      S=cache.state; restoreQueued(cache);
      Sync.lastError=e.message; setSyncStatus("offline");
      toast("Working from this device's copy — "+e.message,"warn",8000);
      Sync.retryTimer=setTimeout(flush,5000);
    }else{
      $("#page").innerHTML=`<div class="card"><div class="card-body"><div class="empty">${ic("cloudOff")}<b>Could not load data.</b><br>${esc(e.message)}<div style="margin-top:14px"><button class="btn primary" id="retryBoot">${ic("refresh")}Try again</button></div></div></div></div>`;
      $("#retryBoot").onclick=enterApp;
      reportError("Startup","Load data",e);
      return;
    }
  }
  if(data){
    if(data.user){ SESSION.user=Object.assign({},SESSION.user,data.user); saveSession(SESSION); }
    const cache=readCache();
    const {fresh}=applySnapshot(data,{keepLocal:false});
    if(fresh&&!canAdmin()) S.__notInitialised=true;
    if(cache&&cache.email===USER().email&&(cache.dirty||[]).length){
      const values=cache.dirtyValues?new Map(cache.dirtyValues):null;
      cache.dirty.forEach(p=>{ const v=values?values.get(p):getPath(cache.state||{},p); setPath(S,p,clone(v)); Sync.dirty.add(p); });
      restoreQueued(cache,true);
      toast(`Recovered ${cache.dirty.length} unsaved change(s) from this device — saving to Google Drive now.`,"warn",7000);
      scheduleFlush(600);
    }
    setSyncStatus(Sync.dirty.size?"saving":"saved");
    saveCache();
  }
  renderShellUser(); renderNav();
  const {page,params}=parseHash();
  const d=params.get("date");
  if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)){ if(page==="duty") UI.date=dateFromKey(d); if(page==="parade") UI.friday=snapToFriday(dateFromKey(d)); }
  UI.page=page; renderPage();
  stopTimers();
  pollTimer=setInterval(poll,Math.max(15,Number(CFG.POLL_SECONDS)||40)*1000);
  clockTimer=setInterval(tickClock,20000); tickClock();
}
function restoreQueued(cache,auditOnly){
  if(!auditOnly) (cache.dirty||[]).forEach(p=>Sync.dirty.add(p));
  Sync.audit.push(...(cache.audit||[])); Sync.activity.push(...(cache.activity||[]));
}
function clearSessionTokenOnly(){ if(SESSION){ SESSION.token=null; saveSession(SESSION); } }

/* ------------------------------------------------------------ boot */
(function boot(){
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closePop(); });
  loadSession();
  if(SESSION&&SESSION.token) enterApp();
  else showLogin();
})();
