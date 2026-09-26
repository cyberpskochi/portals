/* =========================================================================
   pages.js — every screen of the application.
   ========================================================================= */
"use strict";

const UI={
  page:"dashboard",
  date:today(),
  friday:snapToFriday(today()),
  editingStrength:false, strengthBefore:null,
  assign:{q:"",filter:"all",selected:new Set()},
  personnel:{filter:"active",q:""},
  att:{from:"",to:"",currentId:null,preview:null},
  logs:{type:"activity",from:"",to:"",email:"",text:"",result:"",page:1},
  users:{showRemoved:false},
  pendingRerender:false
};
let sortables=[];
function killSortables(){ sortables.forEach(s=>{ try{s.destroy();}catch(e){} }); sortables=[]; }
function makeSortable(el,opts){
  if(!window.Sortable||!el) return null;
  const s=window.Sortable.create(el,Object.assign({animation:160,handle:".drag-handle",ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",forceFallback:true,fallbackTolerance:3},opts));
  sortables.push(s); return s;
}
function loadingBlock(msg){ return `<div class="card"><div class="card-body"><div class="row"><span class="spinner"></span><span class="muted">${esc(msg||"Loading…")}</span></div><div class="skeleton" style="margin-top:14px;width:70%"></div><div class="skeleton" style="margin-top:10px;width:55%"></div></div></div>`; }
function needYearsThen(el,years,render){
  if(DEMO) return false;
  const miss=[...new Set(years)].filter(y=>!LOADED_YEARS.has(y));
  if(!miss.length) return false;
  el.innerHTML=loadingBlock("Loading "+miss.join(", ")+" duty charts from Google Drive…");
  ensureYears(miss).then(()=>{ if(el.isConnected) render(el); }).catch(()=>{});
  return true;
}
function personLabel(p){ return `${displayRank(p.rank)} ${p.name}`; }

/* =======================================================================
   DASHBOARD
   ======================================================================= */
function renderDashboard(el){
  const t=today(), key=dateKey(t);
  if(needYearsThen(el,[t.getFullYear(),addDays(t,-14).getFullYear()],renderDashboard)) return;
  const act=activePersonnel();
  const b=computeDutyBoard(key);
  const hr=new Date().getHours();
  const greet=hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";
  const fri=snapToFriday(t), fk=dateKey(fri), par=computeParadeList(fk);
  const tip=tipFor(key);
  const attached=act.filter(p=>p.attached).length;

  let strip="";
  for(let i=13;i>=0;i--){
    const d=addDays(t,-i), k=dateKey(d), asg=(S.records[k]&&S.records[k].assignments)||{};
    const n=act.filter(p=>asg[p.id]&&(asg[p.id].duty||"").trim()).length;
    const cls=n===0?"none":(n>=act.length?"full":"part");
    strip+=`<div class="day ${cls}${i===0?" today":""}" data-go="${k}" title="${dateDisplay(d)} — ${n}/${act.length} assigned">${d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,2)}<b>${d.getDate()}</b>${n}/${act.length}</div>`;
  }
  const dutyRows=b.dutyRows;
  el.innerHTML=`
  <div class="hero">
    <div class="grow">
      <h2>${greet}, ${esc((USER().name||"Officer").split(" ")[0])}</h2>
      <p>${dowName(t)}, ${t.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})} · ${esc(stationLine())}</p>
    </div>
    <button class="btn gold" data-nav="duty">${ic("clipboard")}Open today's duty chart</button>
    <button class="btn" data-nav="attendance" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.25)">${ic("calendar")}Attendance</button>
  </div>
  <div class="kpis">
    <div class="kpi" style="--k:var(--navy);--kbg:#e6ebf4"><div class="ic">${ic("users")}</div><div><div class="v">${act.length}</div><div class="l">Active personnel</div><div class="s">${attached} attached · expected ${settings().expectedStrength}</div></div></div>
    <div class="kpi" style="--k:var(--green);--kbg:var(--green-soft)"><div class="ic">${ic("briefcase")}</div><div><div class="v">${b.counts.onDuty}</div><div class="l">On duty today</div><div class="s">${dutyRows.length} duty posts filled</div></div></div>
    <div class="kpi" style="--k:var(--violet);--kbg:var(--violet-soft)"><div class="ic">${ic("coffee")}</div><div><div class="v">${b.counts.off}</div><div class="l">Leave / rest / off</div><div class="s">${b.offRows.map(r=>codeForOffLabel(r.label)+" "+r.people.length).join(" · ")||"none"}</div></div></div>
    <div class="kpi" style="--k:${b.counts.unassigned?"var(--amber)":"var(--teal)"};--kbg:${b.counts.unassigned?"var(--amber-soft)":"var(--teal-soft)"}"><div class="ic">${ic(b.counts.unassigned?"alert":"check")}</div><div><div class="v">${b.counts.unassigned}</div><div class="l">Not yet assigned</div><div class="s">${b.counts.unassigned?"for today's chart":"Today's chart is complete"}</div></div></div>
  </div>
  <div class="grid side">
    <div class="card">
      <div class="card-head"><h2>${ic("clipboard")}Today's duty detailing</h2><span class="spacer"></span><button class="btn sm" data-nav="duty">Open ${ic("chevR")}</button></div>
      <div class="card-body">${dutyRows.length?`<ul class="mini-duty">${dutyRows.map(r=>`<li><span class="d">${esc(r.label)}</span><span class="n">${esc(officerNames(r.people))}</span></li>`).join("")}</ul>`:`<div class="empty">${ic("clipboard")}No duties assigned for today yet.${canEdit()?`<div style="margin-top:10px"><button class="btn primary sm" data-nav="duty">${ic("plus")}Assign duties</button></div>`:""}</div>`}</div>
    </div>
    <div>
      <div class="card">
        <div class="card-head"><h2>${ic("coffee")}Leave / rest today</h2></div>
        <div class="card-body">${b.offRows.length?`<ul class="mini-duty">${b.offRows.map(r=>`<li><span class="d"><span class="code ${codeClass(codeForOffLabel(r.label))}">${esc(codeForOffLabel(r.label))}</span> ${esc(r.label)}</span><span class="n">${esc(officerNames(r.people))}</span></li>`).join("")}</ul>`:`<div class="empty">No one on leave or rest today.</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>${ic("flag")}${esc(paradeTitle(fk))} · ${dateDisplay(fri)}</h2><span class="spacer"></span><button class="btn sm" data-nav="parade">Open ${ic("chevR")}</button></div>
        <div class="card-body row" style="gap:12px"><span class="tag green" style="font-size:13px;padding:5px 12px">On parade <b class="mono">${par.on.length}</b></span><span class="tag red" style="font-size:13px;padding:5px 12px">Off parade <b class="mono">${par.off.length}</b></span></div>
      </div>
    </div>
  </div>
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><h2>${ic("calendar")}Duty chart completion · last 14 days</h2></div>
      <div class="card-body"><div class="strip">${strip}</div><div class="hint" style="margin-top:10px">Green = every active officer assigned · amber = partly assigned · grey = no chart saved. Click a day to open it.</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>${ic("activity")}Recent activity</h2><span class="spacer"></span>${canAdmin()?`<button class="btn sm" data-nav="logs">All logs ${ic("chevR")}</button>`:""}</div>
      <div class="card-body"><ul class="feed" id="feed"><li><span class="spinner"></span><span class="muted">Loading…</span></li></ul></div>
    </div>
  </div>
  <div class="card" style="overflow:hidden;border:none">
    <div class="tip-strip" style="padding:18px 20px">${ic("bulb")}<div><b>Cyber tip of the day <span class="no">#${tip.index===null?"—":tip.index+1}</span></b><div class="txt" style="font-size:14px">${esc(tip.text)}</div></div></div>
  </div>`;
  $$("[data-go]",el).forEach(x=>x.onclick=()=>{ UI.date=dateFromKey(x.dataset.go); navigate("duty"); });
  api("logs.recent",{limit:8}).then(r=>{
    const f=$("#feed",el); if(!f) return;
    f.innerHTML=(r.rows||[]).length?r.rows.map(x=>`<li><span class="dot"></span><div><div><b>${esc(x.name)}</b> · ${esc(x.action)} <span class="muted">${esc(x.record)}</span></div><div class="t">${esc(x.time)} · ${esc(x.module)}</div></div></li>`).join(""):`<li class="muted">No activity recorded yet.</li>`;
  }).catch(e=>{ const f=$("#feed",el); if(f) f.innerHTML=`<li class="muted">Activity feed unavailable (${esc(e.message)})</li>`; });
}

/* =======================================================================
   DUTY CHART
   ======================================================================= */
function renderDuty(el){
  const key=dateKey(UI.date);
  if(needYearsThen(el,[UI.date.getFullYear(),addDays(UI.date,-1).getFullYear()],renderDuty)) return;
  const locked=canEdit()&&isDateLocked(key);
  const ed=canEdit()&&!locked;
  el.innerHTML=`
  <div class="toolbar no-print">
    <div class="date-nav">
      <button class="icon-only" id="dPrev" title="Previous day">${ic("chevL")}</button>
      <input type="date" class="input sm" id="dPick" value="${key}">
      <button class="icon-only" id="dNext" title="Next day">${ic("chevR")}</button>
      <button class="btn sm primary" id="dToday">Today</button>
      <span class="day-name">${dowName(UI.date)}</span>
    </div>
    ${ed?`<button class="btn sm" id="dCopy">${ic("copy")}Copy previous day</button><button class="btn sm danger" id="dClear">${ic("trash")}Clear day</button>`:""}
    <span class="spacer"></span>
    <button class="btn sm gold" id="dXls">${ic("download")}Excel</button>
    <button class="btn sm primary" id="dPdf">${ic("download")}PDF</button>
    <button class="btn sm" id="dPrint">${ic("printer")}Print</button>
  </div>
  ${locked?`<div class="warn-box no-print" style="margin:0 0 16px">${ic("lock")}<span><b>Locked.</b> ${esc(lockMessage(key))} You can still view, export and print it.</span></div>`:""}
  <div class="sheet" id="dutySheet">
    <div class="sheet-title-row">
      <div class="sheet-title">DUTY CHART OF ${esc(reportShort())} ON ${dateDisplay(UI.date)}</div>
      ${ed?`<button class="btn sm sheet-edit no-print" id="dEditStr">${UI.editingStrength?ic("check")+"Done":ic("edit")+"Edit table"}</button>`:""}
    </div>
    <div class="sheet-sub">${esc(stationLine())} · ${dowName(UI.date)}</div>
    <div class="table-wrap"><table class="grid-table" id="strengthGrid"></table></div>
    <div class="legend-note">GSI = officiating in SI's grade pay · GASI = officiating in ASI's grade pay · GSCPO = officiating in SCPO's grade pay.</div>
    <div class="section-head-plain"><h2>Duty Detailing</h2>${ed?`<div class="row no-print"><span id="orderTag"></span><button class="btn sm" id="rowReset" hidden>${ic("restore")}Default order</button><button class="btn sm ${UI.arrangeRows?"primary":""}" id="rowArrange">${UI.arrangeRows?ic("check")+"Done":ic("sort")+"Arrange rows"}</button></div>`:""}</div>
    <div class="table-wrap"><table class="grid-table duty-report"><thead><tr><th class="boardHandleHead no-print" style="width:34px" hidden></th><th style="width:6%">Sl No</th><th style="width:24%">Duty</th><th>Officer(s) Assigned</th></tr></thead><tbody id="boardBody"></tbody></table></div>
    <div class="section-head-plain"><h2>Off Duty / Leave / Rest</h2></div>
    <div class="table-wrap"><table class="grid-table duty-report"><thead><tr><th class="boardHandleHead no-print" style="width:34px" hidden></th><th style="width:6%">Sl No</th><th style="width:24%">Off Duty Type</th><th>Officer(s)</th></tr></thead><tbody id="offBody"></tbody></table></div>
    <div class="tip-strip" id="tipStrip"></div>
  </div>
  ${ed?`<div class="card no-print" id="assignCard">
    <div class="card-head">
      <h2>${ic("edit")}Assign / edit duties — ${dateDisplay(UI.date)}</h2>
      <div class="assign-stats" id="assignStats"></div>
      <span class="spacer"></span>
      <div class="row">
        <input class="input sm" id="aSearch" placeholder="Search officer…" value="${esc(UI.assign.q)}" style="width:170px">
        <div class="seg" id="aFilter">${[["all","All"],["unassigned","Unassigned"],["duty","On duty"],["off","Leave/Rest"]].map(([k,l])=>`<button data-f="${k}" class="${UI.assign.filter===k?"on":""}">${l}</button>`).join("")}</div>
      </div>
    </div>
    <div id="strengthWarn"></div>
    <div id="bulkBar" style="margin-top:12px"></div>
    <div class="table-wrap"><table class="data" id="assignTable"><thead><tr>
      <th style="width:34px"><input type="checkbox" id="aAll" title="Select all shown"></th><th style="width:34px"></th><th style="width:34px">#</th><th>Rank</th><th>Name</th><th style="width:28%">Duty</th><th style="width:26%">Remarks (time / place / event)</th>
    </tr></thead><tbody id="assignBody"></tbody></table></div>
    <div class="hint" style="padding:10px 18px 14px">${canManagePersonnel()?`Drag ${ic("grip")} to change an officer's position in the roster (used in every report). `:""}Every change is saved to Google Drive automatically and recorded in the activity log.</div>
  </div>`:`<div class="card no-print"><div class="card-body row">${ic("lock")}<span class="muted">You have view-only access. Contact the Station Administrator to edit duty charts.</span></div></div>`}`;

  const go=d=>{ UI.date=d; UI.assign.selected.clear(); renderDuty(el); updateHash(); };
  $("#dPrev",el).onclick=()=>go(addDays(UI.date,-1));
  $("#dNext",el).onclick=()=>go(addDays(UI.date,1));
  $("#dToday",el).onclick=()=>go(today());
  $("#dPick",el).onchange=e=>{ if(e.target.value) go(dateFromKey(e.target.value)); };
  $("#dXls",el).onclick=()=>exportDutyExcel(key);
  $("#dPdf",el).onclick=()=>exportDutyPdf(key);
  $("#dPrint",el).onclick=()=>{ logEvent("Reports","Print duty chart",dateDisplay(UI.date)); window.print(); };
  renderStrengthGrid(); renderBoard(key); renderTipStrip(key);
  if(!ed) return;

  $("#dCopy",el).onclick=async()=>{
    const pk=dateKey(addDays(UI.date,-1)), prev=S.records[pk];
    if(!prev||!Object.keys(prev.assignments||{}).length){ toast("No duty chart found for "+dateDisplay(addDays(UI.date,-1))+" to copy from.","warn"); return; }
    const rec=ensureRecord(key);
    if(Object.keys(rec.assignments).length&&!await confirmBox({title:"Copy previous day",message:`This replaces all duty assignments of <b>${dateDisplay(UI.date)}</b> with those of <b>${dateDisplay(addDays(UI.date,-1))}</b>.`,confirmText:"Copy & replace"})) return;
    const copy={};
    Object.keys(prev.assignments).forEach(pid=>{ const p=personById(pid); if(p&&isActive(p)) copy[pid]=clone(prev.assignments[pid]); });
    rec.assignments=copy;
    markDirty(`records/${key}/assignments`);
    audit("Duty Chart","Copy previous day",dateDisplay(UI.date),"from "+dateDisplay(addDays(UI.date,-1)),Object.keys(copy).length+" assignments");
    toast("Copied "+Object.keys(copy).length+" assignments from the previous day.","success");
    renderDuty(el);
  };
  $("#dClear",el).onclick=async()=>{
    const rec=S.records[key];
    if(!rec||!Object.keys(rec.assignments||{}).length){ toast("Nothing to clear for this date.","info"); return; }
    if(!await confirmBox({title:"Clear duty chart",message:`Remove all ${Object.keys(rec.assignments).length} duty assignments of <b>${dateDisplay(UI.date)}</b>? (A backup is kept on Google Drive.)`,confirmText:"Clear day",danger:true})) return;
    const n=Object.keys(rec.assignments).length;
    rec.assignments={};
    markDirty(`records/${key}/assignments`);
    audit("Duty Chart","Clear day",dateDisplay(UI.date),n+" assignments","none");
    renderDuty(el);
  };
  $("#rowArrange",el).onclick=()=>{ UI.arrangeRows=!UI.arrangeRows; const b=$("#rowArrange",el); b.classList.toggle("primary",UI.arrangeRows); b.innerHTML=UI.arrangeRows?ic("check")+"Done":ic("sort")+"Arrange rows"; renderBoard(key); if(UI.arrangeRows) toast("Drag ⠿ to arrange the Duty Detailing or Off Duty rows for this date. Press Done when finished.","info"); };
  $("#rowReset",el).onclick=async()=>{
    if(!await confirmBox({title:"Default row order",message:"Go back to the default order (ACP / IP duties first, then duty priority) for this date?",confirmText:"Reset"})) return;
    const rec=ensureRecord(key); delete rec.rowOrder; delete rec.offRowOrder; markDirty(`records/${key}/rowOrder`); markDirty(`records/${key}/offRowOrder`);
    audit("Duty Chart","Reset duty row order",dateDisplay(UI.date),"custom","default"); renderBoard(key);
  };
  $("#dEditStr",el).onclick=()=>{
    if(!UI.editingStrength){ UI.editingStrength=true; UI.strengthBefore=clone(S.strengthTable); }
    else{
      UI.editingStrength=false;
      const diff=strengthDiff(UI.strengthBefore,S.strengthTable);
      if(diff.length) audit("Duty Chart","Edit strength table","Strength table",diff.map(d=>d.old).join("; "),diff.map(d=>d.nu).join("; "));
      UI.strengthBefore=null;
    }
    $("#dEditStr",el).innerHTML=UI.editingStrength?ic("check")+"Done":ic("edit")+"Edit table";
    renderStrengthGrid();
  };
  $("#aSearch",el).oninput=debounce(e=>{ UI.assign.q=e.target.value; renderAssignTable(key); },200);
  $$("#aFilter button",el).forEach(b=>b.onclick=()=>{ UI.assign.filter=b.dataset.f; $$("#aFilter button",el).forEach(x=>x.classList.toggle("on",x===b)); renderAssignTable(key); });
  $("#aAll",el).onchange=e=>{ const ids=$$("#assignBody tr[data-id]",el).map(tr=>tr.dataset.id); ids.forEach(id=>e.target.checked?UI.assign.selected.add(id):UI.assign.selected.delete(id)); renderAssignTable(key); };
  renderAssignTable(key);
}

function strengthDiff(a,b){
  const out=[]; if(!a||!b) return out;
  b.columns.forEach((c,i)=>{ const o=a.columns[i]; if(o&&(o.group!==c.group||o.sub!==c.sub)) out.push({old:`Heading ${o.group}/${o.sub||"-"}`,nu:`Heading ${c.group}/${c.sub||"-"}`}); });
  Object.keys(b.values).forEach(r=>Object.keys(b.values[r]).forEach(k=>{ const ov=(a.values[r]||{})[k]||0, nv=b.values[r][k]||0; if(ov!==nv){ const c=b.columns.find(x=>x.key===k)||{group:k,sub:""}; out.push({old:`${r} ${c.group}${c.sub?"-"+c.sub:""}: ${ov}`,nu:`${r} ${c.group}${c.sub?"-"+c.sub:""}: ${nv}`}); } }));
  return out;
}

function renderStrengthGrid(){
  const table=$("#strengthGrid"); if(!table) return;
  const cols=S.strengthTable.columns, vals=S.strengthTable.values, groups=strengthGroups(), E=UI.editingStrength;
  let r1=`<tr><th>Designation</th>`;
  groups.forEach((g,gi)=>{ r1+=`<th colspan="${g.keys.length}">${E?`<input class="hdr-edit g-edit" data-gi="${gi}" value="${esc(g.group)}">`:esc(g.group)}</th>`; });
  r1+=`<th class="total-hdr">Total</th></tr>`;
  let r2=`<tr><th>Grade Designation</th>`;
  cols.forEach((c,ci)=>{ r2+=`<th>${E?`<input class="hdr-edit s-edit" data-ci="${ci}" value="${esc(c.sub)}" placeholder="—">`:esc(c.sub||"")}</th>`; });
  r2+=`<th></th></tr>`;
  const row=(rk,label,merge)=>{
    let tot=0, cells;
    if(E||!merge){ cells=cols.map(c=>{ const v=vals[rk][c.key]||0; tot+=v; return E?`<td><input type="number" min="0" class="strength-edit-input" data-row="${rk}" data-key="${c.key}" value="${v}"></td>`:`<td>${v}</td>`; }).join(""); }
    else{ cells=groups.map(g=>{ let s=0; g.keys.forEach(k=>s+=(vals[rk][k]||0)); tot+=s; return `<td colspan="${g.keys.length}">${s}</td>`; }).join(""); }
    return `<tr><td class="rowlabel">${label}</td>${cells}<td><strong data-total-row="${rk}">${tot}</strong></td></tr>`;
  };
  table.innerHTML=`<thead>${r1}${r2}</thead><tbody>${row("sanctioned","Sanctioned",true)}${row("existing","Existing",false)}${row("attached","Attached",false)}${row("vacancy","Vacancy",true)}</tbody>`;
  if(!E) return;
  const save=debounce(()=>markDirty("strengthTable"),600);
  $$(".g-edit",table).forEach(inp=>inp.oninput=()=>{ groups[+inp.dataset.gi].keys.forEach(k=>{ const c=cols.find(x=>x.key===k); if(c) c.group=inp.value; }); save(); });
  $$(".s-edit",table).forEach(inp=>inp.oninput=()=>{ cols[+inp.dataset.ci].sub=inp.value; save(); });
  $$(".strength-edit-input",table).forEach(inp=>inp.oninput=()=>{
    const rk=inp.dataset.row; vals[rk][inp.dataset.key]=Math.max(parseInt(inp.value||"0",10)||0,0);
    let t=0; cols.forEach(c=>t+=vals[rk][c.key]||0); const te=$(`[data-total-row="${rk}"]`,table); if(te) te.textContent=t; save();
  });
}

function renderBoard(key){
  const tb=$("#boardBody"), ob=$("#offBody"); if(!tb||!ob) return;
  const {dutyRows,offRows,manualOrder,offManualOrder}=computeDutyBoard(key);
  const arr=UI.arrangeRows&&canEdit();
  $$(".boardHandleHead").forEach(h=>h.hidden=!arr);
  const handle=arr?`<td class="no-print" style="width:34px"><span class="drag-handle" title="Drag to change position">${ic("grip")}</span></td>`:"";
  tb.innerHTML=dutyRows.length?dutyRows.map((r,i)=>`<tr data-row="${esc(r.rowId)}">${handle}<td>${i+1}</td><td class="duty-label">${esc(r.label)}</td><td class="officers-cell">${officerChipsForRow(r.key,r.people)}</td></tr>`).join("")
    :`<tr><td colspan="${arr?4:3}" class="empty-note">No duties assigned for this date yet${canEdit()?" — use “Assign / edit duties” below":""}.</td></tr>`;
  ob.innerHTML=offRows.length?offRows.map((r,i)=>`<tr data-row="${esc(r.rowId)}">${handle}<td>${i+1}</td><td class="duty-label">${esc(r.label)}</td><td class="officers-cell">${r.people.map(x=>officerChip(x.p,x.note)).join("")}</td></tr>`).join("")
    :`<tr><td colspan="${arr?4:3}" class="empty-note">No one on leave / rest / off duty for this date.</td></tr>`;
  const custom=manualOrder||offManualOrder;
  const tag=$("#orderTag");
  if(tag) tag.innerHTML=custom?`<span class="tag gold">Custom order for this date</span>`:(settings().seniorDutiesFirst!==false?`<span class="tag grey">ACP / IP first · priority order</span>`:`<span class="tag grey">Priority order</span>`);
  const rs=$("#rowReset"); if(rs) rs.hidden=!custom||!canEdit();
  renderBoard.sortables=(renderBoard.sortables||[]).filter(x=>{ try{x.destroy();}catch(e){} return false; });
  if(!arr||!window.Sortable) return;
  [[tb,dutyRows,"rowOrder","Duty Detailing"],[ob,offRows,"offRowOrder","Off Duty / Leave"]].forEach(([body,list,field,label])=>{
    if(list.length<2) return;
    renderBoard.sortables.push(window.Sortable.create(body,{animation:160,handle:".drag-handle",ghostClass:"sortable-ghost",forceFallback:true,fallbackTolerance:3,onEnd:ev=>{
      if(ev.oldIndex===ev.newIndex) return;
      const rec=ensureRecord(key); const moved=list[ev.oldIndex];
      rec[field]=$$("tr[data-row]",body).map(tr=>tr.dataset.row);
      if(!markDirty(`records/${key}/${field}`)) return renderBoard(key);
      audit("Duty Chart","Change row order ("+label+")",`${dateDisplay(dateFromKey(key))} · ${moved?moved.label:""}`,"Row "+(ev.oldIndex+1),"Row "+(ev.newIndex+1));
      renderBoard(key);
    }}));
  });
}

function renderTipStrip(key){
  const box=$("#tipStrip"); if(!box) return;
  const t=tipFor(key);
  box.innerHTML=`${ic("bulb")}<div class="grow"><b>Cyber tip of the day <span class="no">#${t.index===null?"—":t.index+1}</span></b><div class="txt">${esc(t.text)}</div></div>${canEdit()?`<button class="btn sm no-print" id="tipRe" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.3)">${ic("refresh")}Change</button>`:""}`;
  const b=$("#tipRe",box);
  if(b) b.onclick=()=>{
    if(!S.tips.length) return;
    const old=t.index;
    let pool=S.tips.map((_,i)=>i).filter(i=>i!==old&&!S.usedTipIndices.includes(i));
    if(!pool.length){ S.usedTipIndices=[]; pool=S.tips.map((_,i)=>i).filter(i=>i!==old); }
    const idx=pool[Math.floor(Math.random()*pool.length)];
    const rec=ensureRecord(key); rec.messageIndex=idx;
    if(!S.usedTipIndices.includes(idx)) S.usedTipIndices.push(idx);
    markDirty(`records/${key}/messageIndex`); markDirty("usedTipIndices");
    audit("Duty Chart","Change cyber tip",dateDisplay(dateFromKey(key)),"#"+((old??-1)+1),"#"+(idx+1));
    renderTipStrip(key);
  };
}

function buildDutyOptions(current){
  const esc2=esc;
  let h=`<option value="">— Not assigned —</option><optgroup label="Duty">`;
  orderedDutyCategories().forEach(c=>h+=`<option value="${esc2(c.label)}">${esc2(c.label)}</option>`);
  (S.dutyTypes||[]).filter(d=>d.category!=="off").forEach(d=>h+=`<option value="${esc2(d.name)}">${esc2(d.name)}</option>`);
  h+=`</optgroup><optgroup label="Off duty / Leave / Rest">`;
  allOffLabels().forEach(l=>h+=`<option value="${esc2(l)}">${esc2(l)} (${esc2(codeForOffLabel(l))})</option>`);
  h+=`</optgroup>`;
  const known=[""].concat(orderedDutyCategories().map(c=>c.label),(S.dutyTypes||[]).map(d=>d.name),OFF_DUTY_TYPES);
  if(current&&!known.some(k=>k.toLowerCase()===current.toLowerCase())) h+=`<option value="${esc2(current)}">${esc2(current)}</option>`;
  h+=`<option value="__add__">+ Add new duty type…</option>`;
  return h;
}
function selectValueFor(sel,v){ const opt=[...sel.options].find(o=>o.value.toLowerCase()===String(v||"").toLowerCase()); sel.value=opt?opt.value:""; }

function setDuty(key,pid,duty,{silentAudit}={}){
  const rec=ensureRecord(key);
  const a=rec.assignments[pid]||{duty:"",note:""};
  const old=a.duty||"";
  if(old===duty) return false;
  a.duty=duty;
  if(!a.duty&&!a.note) delete rec.assignments[pid]; else rec.assignments[pid]=a;
  if(!markDirty(`records/${key}/assignments/${pid}`)) return false;
  const p=personById(pid);
  if(!silentAudit) audit("Duty Chart","Change duty",`${dateDisplay(dateFromKey(key))} · ${p?personLabel(p):pid}`,old||"Not assigned",duty||"Not assigned");
  return true;
}

async function addDutyTypeFlow(){
  const r=await promptBox({title:"Add new duty type",label:"Duty type name",placeholder:"e.g. VIP Security",confirmText:"Add",
    extra:`<div class="field" style="margin-top:12px"><label>Category</label><select class="select" data-extra="cat"><option value="duty">Duty (counts as Present in attendance)</option><option value="off">Off duty / Leave / Rest</option></select></div>`});
  if(!r||!r.value) return null;
  const name=r.value.trim();
  if(FIXED_DUTY_LABELS.concat(OFF_DUTY_TYPES).some(d=>d.toLowerCase()===name.toLowerCase())){ toast(`"${name}" is already a standard duty type.`,"warn"); return name; }
  if((S.dutyTypes||[]).some(d=>d.name.toLowerCase()===name.toLowerCase())){ toast("That duty type already exists.","warn"); return name; }
  S.dutyTypes.push({name,category:r.extra.cat==="off"?"off":"duty"});
  markDirty("dutyTypes");
  audit("Duty Setup","Add duty type",name,"",r.extra.cat==="off"?"Off duty / Leave":"Duty");
  return name;
}

function renderAssignTable(key){
  const body=$("#assignBody"); if(!body) return;
  const rec=S.records[key]||{assignments:{}};
  const q=UI.assign.q.trim().toLowerCase(), f=UI.assign.filter;
  const act=activePersonnel();
  const shown=act.filter(p=>{
    const d=dutyOf(key,p.id);
    if(q&&!(p.name.toLowerCase().includes(q)||displayRank(p.rank).toLowerCase().includes(q)||d.toLowerCase().includes(q))) return false;
    if(f==="unassigned"&&d) return false;
    if(f==="duty"&&(!d||isOffDuty(d))) return false;
    if(f==="off"&&!isOffDuty(d)) return false;
    return true;
  });
  const drag=canManagePersonnel()&&!q&&f==="all";
  const opts=buildDutyOptions("");
  body.innerHTML=shown.length?shown.map(p=>{
    const a=(rec.assignments||{})[p.id]||{}; const d=(a.duty||"").trim();
    return `<tr data-id="${p.id}" class="${UI.assign.selected.has(p.id)?"row-selected":""}">
      <td><input type="checkbox" class="aSel" ${UI.assign.selected.has(p.id)?"checked":""}></td>
      <td>${drag?`<span class="drag-handle" title="Drag to reorder">${ic("grip")}</span>`:""}</td>
      <td class="pos-no">${rosterIndex(p.id)+1}</td>
      <td>${rankPill(p.rank)}</td>
      <td><b>${esc(p.name)}</b>${p.attached?` <span class="tag violet">Attd</span>`:""}</td>
      <td><select class="duty-select ${!d?"unassigned":(isOffDuty(d)?"off":"")}">${d&&!opts.includes(`value="${esc(d)}"`)?buildDutyOptions(d):opts}</select></td>
      <td><input class="remarks-input" value="${esc(a.note||"")}" placeholder="Time / place / event"></td>
    </tr>`;
  }).join(""):`<tr><td colspan="7"><div class="empty">No officers match.</div></td></tr>`;
  $$("tr[data-id]",body).forEach(tr=>{
    const pid=tr.dataset.id, sel=$(".duty-select",tr), rem=$(".remarks-input",tr);
    selectValueFor(sel,dutyOf(key,pid));
    sel.onchange=async()=>{
      let v=sel.value;
      if(v==="__add__"){ const n=await addDutyTypeFlow(); if(!n){ selectValueFor(sel,dutyOf(key,pid)); return; } v=n; }
      setDuty(key,pid,v);
      renderAssignTable(key); renderBoard(key); updateAssignStats(key);
    };
    rem.onfocus=()=>{ rem.dataset.orig=rem.value; };
    rem.oninput=()=>{
      const r=ensureRecord(key); const a=r.assignments[pid]||{duty:"",note:""};
      a.note=rem.value; if(!a.duty&&!a.note) delete r.assignments[pid]; else r.assignments[pid]=a;
      markDirty(`records/${key}/assignments/${pid}`); boardSoon(key);
    };
    rem.onchange=()=>{ const p=personById(pid); if((rem.dataset.orig||"")!==rem.value) audit("Duty Chart","Change remarks",`${dateDisplay(dateFromKey(key))} · ${personLabel(p)}`,rem.dataset.orig||"",rem.value); rem.dataset.orig=rem.value; };
    $(".aSel",tr).onchange=e=>{ e.target.checked?UI.assign.selected.add(pid):UI.assign.selected.delete(pid); tr.classList.toggle("row-selected",e.target.checked); renderBulkBar(key); };
  });
  if(drag) makeSortable(body,{onEnd:ev=>{ if(ev.oldIndex===ev.newIndex) return; const ids=$$("tr[data-id]",body).map(tr=>tr.dataset.id); applyRosterOrder(ids,ev.item.dataset.id); renderAssignTable(key); renderBoard(key); }});
  updateAssignStats(key); renderBulkBar(key);
  const all=$("#aAll"); if(all) all.checked=shown.length>0&&shown.every(p=>UI.assign.selected.has(p.id));
}
const boardSoon=debounce(k=>renderBoard(k),350);

function updateAssignStats(key){
  const box=$("#assignStats"); if(!box) return;
  const act=activePersonnel(); const b=computeDutyBoard(key);
  box.innerHTML=`<span class="stat-chip">Assigned <b>${act.length-b.counts.unassigned}/${act.length}</b></span><span class="stat-chip" style="color:var(--green)">On duty <b>${b.counts.onDuty}</b></span><span class="stat-chip" style="color:var(--violet)">Leave/Rest <b>${b.counts.off}</b></span>${b.counts.unassigned?`<span class="stat-chip" style="color:var(--amber)">Unassigned <b>${b.counts.unassigned}</b></span>`:""}`;
  const w=$("#strengthWarn");
  if(w){ const exp=Number(settings().expectedStrength)||0; w.innerHTML=exp&&act.length!==exp?`<div class="warn-box">${ic("alert")}Personnel count: ${act.length} active officers on the roster, expected strength is ${exp}. ${canAdmin()?"(Change the expected strength in Settings.)":""}</div>`:""; }
}

function renderBulkBar(key){
  const bar=$("#bulkBar"); if(!bar) return;
  const n=UI.assign.selected.size;
  if(!n){ bar.innerHTML=""; return; }
  bar.innerHTML=`<div class="bulk-bar"><b>${n} selected</b><span class="muted">Set duty:</span><select class="select sm" id="bDuty" style="min-width:200px">${buildDutyOptions("").replace('<option value="__add__">+ Add new duty type…</option>',"")}</select><button class="btn sm primary" id="bApply">${ic("check")}Apply to selected</button><button class="btn sm" id="bNone">Clear selection</button></div>`;
  $("#bApply",bar).onclick=()=>{
    const v=$("#bDuty",bar).value; let c=0;
    UI.assign.selected.forEach(pid=>{ if(setDuty(key,pid,v)) c++; });
    toast(`${v||"Not assigned"} set for ${c} officer(s).`,"success");
    UI.assign.selected.clear(); renderAssignTable(key); renderBoard(key);
  };
  $("#bNone",bar).onclick=()=>{ UI.assign.selected.clear(); renderAssignTable(key); };
}

/** Re-orders the roster so that the ids in `visibleIds` take the order given,
    keeping every hidden officer in their existing slot. */
function applyRosterOrder(visibleIds,movedId){
  const oldPos=rosterIndex(movedId);
  const set=new Set(visibleIds);
  const slots=[]; S.personnel.forEach((p,i)=>{ if(set.has(p.id)) slots.push(i); });
  const byId={}; S.personnel.forEach(p=>byId[p.id]=p);
  const next=S.personnel.slice();
  slots.forEach((slot,i)=>{ next[slot]=byId[visibleIds[i]]; });
  S.personnel=next;
  if(!markDirty("personnel")) return;
  const p=personById(movedId);
  audit("Personnel","Change roster position",p?personLabel(p):movedId,"Position "+(oldPos+1),"Position "+(rosterIndex(movedId)+1));
}

/* =======================================================================
   FRIDAY PARADE
   ======================================================================= */
function renderParade(el){
  const key=dateKey(UI.friday);
  if(needYearsThen(el,[UI.friday.getFullYear(),addDays(UI.friday,-1).getFullYear()],renderParade)) return;
  const ed=canEdit();
  const editing=ed&&UI.paradeEdit===key;
  const {on,off}=computeParadeList(key);
  const meta=paradeMeta(key), title=paradeTitle(key), LB=paradeLabels(key);
  const manualCount=Object.keys((S.paradeOverrides||{})[key]||{}).length;
  const custCount=Object.keys(meta.reasons||{}).length+((meta.order||[]).length?1:0);
  const chip=({p,st})=>`<li class="parade-chip-item${st.manual?" manual":""}${st.customReason?" custom":""}" data-id="${p.id}">
      ${ed?`<span class="drag-handle" title="Drag up / down, or to the other column">${ic("grip")}</span>`:""}
      <span class="pc-rank">${esc(displayRank(p.rank))}</span><span class="pc-name">${esc(p.name)}${p.attached?" <em>(Attd)</em>":""}</span>
      ${editing?`<input class="input sm pc-reason-edit" data-reason value="${esc(st.customReason?st.reason:"")}" placeholder="${esc(st.status==="off"?paradeReasonText(p,Object.assign({},st,{customReason:false,reason:st.autoReason||st.reason}),key):(st.autoReason||st.reason))}" title="Leave blank to use the duty chart">`
        :`<span class="pc-reason">${esc(st.status==="off"?paradeReasonText(p,st,key):st.reason)}${st.manual?" · moved":""}${st.customReason?" · edited":""}</span>`}
      ${ed?`<button class="icon-only pc-move" title="${st.status==="on"?"Move to "+esc(LB.off):"Move to "+esc(LB.on)}">${ic("swap")}</button>`:""}</li>`;
  el.innerHTML=`
  <div class="toolbar no-print">
    <div class="date-nav">
      <button class="icon-only" id="pPrev" title="Previous Friday">${ic("chevL")}</button>
      <input type="date" class="input sm" id="pPick" value="${key}" title="Any date — snaps to that week's Friday">
      <button class="icon-only" id="pNext" title="Next Friday">${ic("chevR")}</button>
      <span class="day-name">Friday</span>
    </div>
    ${ed?`<button class="btn sm primary" id="pGen">${ic("bolt")}Generate</button>
      <button class="btn sm ${editing?"gold":""}" id="pEdit">${editing?ic("check")+"Done editing":ic("edit")+"Edit duties / reasons"}</button>`:""}
    ${manualCount?`<span class="tag gold">${manualCount} moved</span>`:""}${custCount?`<span class="tag violet">edited</span>`:""}
    <span class="spacer"></span>
    <button class="btn sm gold" id="pXls">${ic("download")}Excel</button>
    <button class="btn sm primary" id="pPdf">${ic("download")}PDF</button>
    <button class="btn sm" id="pPrint">${ic("printer")}Print</button>
  </div>
  <div class="card no-print">
    <div class="card-head">
      <h2>${ic("flag")}${esc(title)} — ${dateDisplay(UI.friday)}</h2>
      ${ed?`<button class="btn sm" id="pTitle" title="Change the heading for this Friday">${ic("edit")}Edit heading</button>`:""}
      <span class="sub">${ed?(editing?"Type the duty / reason against any officer (leave blank to use the duty chart). ":"")+"Drag ⠿ up / down to change the order, or to the other column to move an officer.":"Worked out from that Friday's duty chart."}</span>
    </div>
    <div class="card-body">
      <div class="parade-cols">
        <div class="parade-col on-col"><h3>${esc(LB.on)} <span class="pcount">${on.length}</span></h3><ul class="parade-list" id="onList" data-status="on">${on.map(chip).join("")||'<li class="empty">Nobody.</li>'}</ul></div>
        <div class="parade-col off-col"><h3>${esc(LB.off)} <span class="pcount">${off.length}</span></h3><ul class="parade-list" id="offList" data-status="off">${off.map(chip).join("")||'<li class="empty">Nobody.</li>'}</ul></div>
      </div>
      <div class="hint" style="margin-top:12px">Worked out automatically from the duty chart: off duty / leave / rest, Night GD, Night Watch, Course, Sub Division Check and Echo are off; anyone on Night GD on Thursday night is also off. <b>Edit duties / reasons</b> lets you type what should appear (e.g. “Night Duty 25/09 & Day GD”). <b>Generate</b> clears moves, edited reasons and custom order.</div>
    </div>
  </div>
  <div class="sheet">
    <div class="sheet-title-row"><div class="sheet-title">${esc(title)} Statement — ${dateDisplay(UI.friday)}</div></div>
    <div class="sheet-sub">${esc(stationLine())}</div>
    <div class="table-wrap">${paradeStatementHtml(key,false)}</div>
  </div>`;
  const go=d=>{ UI.friday=snapToFriday(d); UI.paradeEdit=null; renderParade(el); updateHash(); };
  $("#pPrev",el).onclick=()=>go(addDays(UI.friday,-7));
  $("#pNext",el).onclick=()=>go(addDays(UI.friday,7));
  $("#pPick",el).onchange=e=>{ if(e.target.value) go(dateFromKey(e.target.value)); };
  $("#pXls",el).onclick=()=>exportParadeExcel(key);
  $("#pPdf",el).onclick=()=>exportParadePdf(key);
  $("#pPrint",el).onclick=()=>{ logEvent("Reports","Print "+title,dateDisplay(UI.friday)); window.print(); };
  if(!ed) return;

  const ensureMeta=()=>{ if(!S.paradeMeta) S.paradeMeta={}; if(!S.paradeMeta[key]) S.paradeMeta[key]={}; return S.paradeMeta[key]; };
  const saveMeta=()=>{ const m=S.paradeMeta[key]; if(m&&!Object.keys(m).some(k=>{ const v=m[k]; return Array.isArray(v)?v.length:(v&&typeof v==="object")?Object.keys(v).length:!!v; })) delete S.paradeMeta[key]; markDirty(`paradeMeta/${key}`); };

  $("#pTitle",el).onclick=()=>{
    openModal({title:"Heading for "+dateDisplay(UI.friday),body:`
      <div class="form-grid">
        <div class="field full"><label>Heading</label><input class="input" id="ptT" value="${esc(meta.title||"")}" placeholder="Friday Parade"><span class="hint">e.g. Catechism Class, Weekly Parade, Special Parade</span></div>
        <div class="field"><label>First section</label><input class="input" id="ptOn" value="${esc(meta.onLabel||"")}" placeholder="On Parade"></div>
        <div class="field"><label>Second section</label><input class="input" id="ptOff" value="${esc(meta.offLabel||"")}" placeholder="Off Parade"></div>
      </div><p class="hint" style="margin-top:10px">Applies to this Friday only. Leave blank for the normal “Friday Parade / On Parade / Off Parade”.</p>`,
      actions:[{label:"Cancel"},{label:"Save",cls:"primary",icon:"check",onClick:(close,m)=>{
        const nt=$("#ptT",m).value.trim(), no=$("#ptOn",m).value.trim(), nf=$("#ptOff",m).value.trim();
        const old=[meta.title||"Friday Parade",meta.onLabel||"On Parade",meta.offLabel||"Off Parade"].join(" / ");
        const md=ensureMeta(); md.title=nt; md.onLabel=no; md.offLabel=nf;
        saveMeta();
        audit("Friday Parade","Change heading",dateDisplay(UI.friday),old,[nt||"Friday Parade",no||"On Parade",nf||"Off Parade"].join(" / "));
        close(); renderParade(el);
      }}]});
  };
  $("#pEdit",el).onclick=()=>{ UI.paradeEdit=editing?null:key; renderParade(el); };
  $$("[data-reason]",el).forEach(inp=>{
    inp.onchange=()=>{
      const pid=inp.closest("li").dataset.id, p=personById(pid);
      const md=ensureMeta(); if(!md.reasons) md.reasons={};
      const old=md.reasons[pid]||"", v=inp.value.trim();
      if(v) md.reasons[pid]=v; else delete md.reasons[pid];
      saveMeta();
      audit("Friday Parade","Edit duty / reason",`${dateDisplay(UI.friday)} · ${personLabel(p)}`,old||"(from duty chart)",v||"(from duty chart)");
      const sheet=$(".sheet .table-wrap",el); if(sheet) sheet.innerHTML=paradeStatementHtml(key,false);
    };
    inp.onkeydown=e=>{ if(e.key==="Enter") inp.blur(); };
  });
  $("#pGen",el).onclick=async()=>{
    if((manualCount||custCount)&&!await confirmBox({title:"Generate "+title,message:`Clear ${manualCount} moved officer(s), edited reasons and the custom order, and recompute from the duty chart? (The heading is kept.)`,confirmText:"Generate"})) return;
    if(S.paradeOverrides[key]){ delete S.paradeOverrides[key]; markDirty(`paradeOverrides/${key}`); }
    if(S.paradeMeta&&S.paradeMeta[key]){ delete S.paradeMeta[key].reasons; delete S.paradeMeta[key].order; saveMeta(); }
    audit("Friday Parade","Generate parade",dateDisplay(UI.friday),manualCount+" moved, "+custCount+" edits","recomputed");
    renderParade(el);
  };
  const setStatus=(pid,status)=>{
    const auto=paradeAutoStatus(pid,key), cur=paradeStatusFor(pid,key);
    if(cur.status===status) return false;
    if(!S.paradeOverrides[key]) S.paradeOverrides[key]={};
    if(status===auto.status) delete S.paradeOverrides[key][pid]; else S.paradeOverrides[key][pid]=status;
    if(!Object.keys(S.paradeOverrides[key]).length) delete S.paradeOverrides[key];
    markDirty(`paradeOverrides/${key}`);
    const p=personById(pid);
    audit("Friday Parade","Move officer",`${dateDisplay(UI.friday)} · ${personLabel(p)}`,cur.status==="on"?LB.on:LB.off,status==="on"?LB.on:LB.off);
    return true;
  };
  const saveOrder=(movedId)=>{
    const ids=$$("#onList li[data-id]",el).map(x=>x.dataset.id).concat($$("#offList li[data-id]",el).map(x=>x.dataset.id));
    const md=ensureMeta(); const oldPos=(md.order||[]).indexOf(movedId);
    md.order=ids; saveMeta();
    const p=personById(movedId);
    audit("Friday Parade","Change order",`${dateDisplay(UI.friday)} · ${p?personLabel(p):movedId}`,oldPos<0?"default":"Position "+(oldPos+1),"Position "+(ids.indexOf(movedId)+1));
  };
  $$(".pc-move",el).forEach(b=>b.onclick=()=>{ const li=b.closest("li"); setStatus(li.dataset.id,li.closest("ul").dataset.status==="on"?"off":"on"); renderParade(el); });
  ["#onList","#offList"].forEach(id=>makeSortable($(id,el),{group:"parade",sort:true,filter:"input",preventOnFilter:false,onEnd:ev=>{
    if(ev.from===ev.to&&ev.oldIndex===ev.newIndex) return;
    const pid=ev.item.dataset.id;
    if(ev.from!==ev.to) setStatus(pid,ev.to.dataset.status);
    saveOrder(pid);
    renderParade(el);
  }}));
}

/* =======================================================================
   ATTENDANCE
   ======================================================================= */
function monthRange(offset){ const t=today(); const f=new Date(t.getFullYear(),t.getMonth()+offset,1); const l=new Date(f.getFullYear(),f.getMonth()+1,0); return [dateKey(f),dateKey(l)]; }
function currentSheet(){ return UI.att.currentId?(S.attendance[UI.att.currentId]||null):UI.att.preview; }

function renderAttendance(el){
  if(!UI.att.from){ const [f,t]=monthRange(0); UI.att.from=f; UI.att.to=t; }
  const ed=canEdit();
  const regs=Object.values(S.attendance||{}).filter(x=>x&&x.from).sort((a,b)=>b.from.localeCompare(a.from));
  el.innerHTML=`
  <div class="grid side">
    <div class="card">
      <div class="card-head"><h2>${ic("bolt")}Create attendance from duty detailing</h2></div>
      <div class="card-body">
        <div class="row" style="align-items:flex-end;gap:12px">
          <div class="field"><label>From date</label><input type="date" class="input" id="atFrom" value="${UI.att.from}"></div>
          <div class="field"><label>To date</label><input type="date" class="input" id="atTo" value="${UI.att.to}"></div>
          <div class="field"><label>Quick select</label><div class="row"><button class="btn sm" id="atThis">This month</button><button class="btn sm" id="atLast">Last month</button></div></div>
          <button class="btn primary" id="atGen">${ic("bolt")}${ed?"Generate attendance":"Preview attendance"}</button>
        </div>
        <p class="hint" style="margin:12px 0 0">Built from each day's saved duty chart: any duty = <b>${esc(presentCode())}</b>, Casual Leave = <b>${esc(codeForOffLabel("Casual Leave"))}</b>, Day Off = <b>${esc(codeForOffLabel("Day Off"))}</b>, Commuted Leave = <b>${esc(codeForOffLabel("Commuted Leave"))}</b>, Medical Leave = <b>${esc(codeForOffLabel("Medical Leave"))}</b>, Half Pay Leave = <b>${esc(codeForOffLabel("Half Pay Leave"))}</b>, Earned Leave = <b>${esc(codeForOffLabel("Earned Leave"))}</b>. ${ed?"The register is saved to Google Drive and every hand-correction is logged.":""}</p>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>${ic("database")}Saved registers</h2><span class="sub">${regs.length}</span></div>
      <div class="card-body tight" style="max-height:230px;overflow:auto">${regs.length?`<ul class="reg-list">${regs.map(r=>`<li class="${r.id===UI.att.currentId?"cur":""}"><div class="t"><b>${dateDisplay(dateFromKey(r.from))} – ${dateDisplay(dateFromKey(r.to))}</b><span>${r.status==="final"?"🔒 Finalised · ":""}Updated ${esc(r.updatedAt||r.createdAt||"")} by ${esc(r.updatedBy||r.createdBy||"")}</span></div><button class="btn sm" data-open="${esc(r.id)}">Open</button></li>`).join("")}</ul>`:`<div class="empty">No attendance registers saved yet.</div>`}</div>
    </div>
  </div>
  <div id="attRegister"></div>`;
  $("#atFrom",el).onchange=e=>UI.att.from=e.target.value;
  $("#atTo",el).onchange=e=>UI.att.to=e.target.value;
  $("#atThis",el).onclick=()=>{ [UI.att.from,UI.att.to]=monthRange(0); renderAttendance(el); };
  $("#atLast",el).onclick=()=>{ [UI.att.from,UI.att.to]=monthRange(-1); renderAttendance(el); };
  $$("[data-open]",el).forEach(b=>b.onclick=async()=>{ const r=S.attendance[b.dataset.open]; await ensureYears([+r.from.slice(0,4),+r.to.slice(0,4)]).catch(()=>{}); UI.att.currentId=r.id; UI.att.preview=null; UI.att.from=r.from; UI.att.to=r.to; renderAttendance(el); });
  $("#atGen",el).onclick=()=>generateAttendance(el);
  renderRegister($("#attRegister",el),el);
}

async function generateAttendance(el){
  const f=UI.att.from, t=UI.att.to;
  if(!f||!t){ toast("Select both From and To dates.","warn"); return; }
  if(t<f){ toast("The To date must be on or after the From date.","warn"); return; }
  const days=datesBetween(f,t).length;
  if(days>62){ toast("Please select a period of 62 days or less.","warn"); return; }
  try{ await ensureYears([+f.slice(0,4),+t.slice(0,4)]); }catch(e){ return; }
  const id=f+"_"+t;
  if(!canEdit()){ UI.att.preview=buildAttendance(f,t,null); UI.att.currentId=null; renderAttendance(el); return; }
  const ex=S.attendance[id];
  if(ex){
    const choice=await new Promise(res=>{
      openModal({title:"Register already exists",body:`<p>An attendance register for <b>${dateDisplay(dateFromKey(f))} – ${dateDisplay(dateFromKey(t))}</b> was saved on ${esc(ex.updatedAt||ex.createdAt)} by ${esc(ex.updatedBy||ex.createdBy)}.</p><p class="hint">“Refresh” re-reads the duty charts; any cells corrected by hand are kept.</p>`,
        actions:[{label:"Cancel",onClick:c=>{c();res(null);}},{label:"Open saved",onClick:c=>{c();res("open");}},{label:"Refresh from duty charts",cls:"primary",onClick:c=>{c();res("refresh");}}]});
    });
    if(!choice) return;
    UI.att.currentId=id; UI.att.preview=null;
    if(choice==="refresh") refreshRegister(id);
    renderAttendance(el); return;
  }
  const sheet=buildAttendance(f,t,null);
  Object.assign(sheet,{status:"draft",createdAt:stampNow(),createdBy:USER().name||USER().email,updatedAt:stampNow(),updatedBy:USER().name||USER().email});
  S.attendance[id]=sheet;
  markDirty(`attendance/${id}`);
  audit("Attendance","Generate attendance",attendanceTitle(sheet),"",`${sheet.personIds.length} officers × ${days} days (${sheet.chartedDays} days with duty charts)`);
  UI.att.currentId=id; UI.att.preview=null;
  toast(`Attendance generated and saved — ${sheet.chartedDays} of ${days} days have duty charts.`,"success");
  renderAttendance(el);
}

function refreshRegister(id){
  const old=S.attendance[id]; if(!old) return;
  const fresh=buildAttendance(old.from,old.to,old);
  let changed=0;
  fresh.personIds.forEach(pid=>Object.keys(fresh.cells[pid]).forEach(k=>{ if(((old.cells[pid]||{})[k]||"")!==fresh.cells[pid][k]) changed++; }));
  S.attendance[id]=Object.assign({},old,{personIds:fresh.personIds,cells:fresh.cells,manual:fresh.manual,chartedDays:fresh.chartedDays,totalDays:fresh.totalDays,updatedAt:stampNow(),updatedBy:USER().name||USER().email});
  markDirty(`attendance/${id}`);
  audit("Attendance","Refresh attendance from duty charts",attendanceTitle(old),"",changed+" cell(s) changed");
  toast(`Register refreshed — ${changed} cell(s) updated; hand corrections kept.`,"success");
}

function renderRegister(box,pageEl){
  const sheet=currentSheet();
  if(!sheet){ box.innerHTML=`<div class="card"><div class="empty" style="padding:40px">${ic("calendar")}Choose a period and press <b>${canEdit()?"Generate attendance":"Preview attendance"}</b>, or open a saved register.</div></div>`; return; }
  const dates=datesBetween(sheet.from,sheet.to), cols=attendanceColumns(sheet);
  const locked=sheet.status==="final";
  const editable=canEdit()&&!locked&&!!UI.att.currentId;
  const isPreview=!UI.att.currentId;
  const pc=presentCode();
  let head=`<tr><th class="sticky1">Sl</th><th class="sticky2">Rank &amp; Name</th>`;
  dates.forEach(k=>{ const d=dateFromKey(k); head+=`<th class="${d.getDay()===0?"sun":""}">${pad(d.getDate())}<span class="wd">${d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,2)}</span></th>`; });
  cols.forEach(c=>head+=`<th class="tot">${esc(c)}</th>`);
  head+=`</tr>`;
  let body="";
  sheet.personIds.forEach((pid,i)=>{
    const p=personById(pid); if(!p) return;
    const t=attendanceTotals(sheet,pid);
    body+=`<tr data-pid="${pid}"><td class="sl sticky1">${i+1}</td><td class="sticky2">${rankPill(p.rank)} <b>${esc(p.name)}</b>${isActive(p)?"":` <span class="tag grey">${esc(PERSON_STATUS[p.status]?.label||p.status)}</span>`}</td>`;
    dates.forEach(k=>{
      const c=(sheet.cells[pid]||{})[k]||""; const man=sheet.manual&&sheet.manual[pid]&&sheet.manual[pid][k];
      body+=`<td class="c${editable?"":" ro"}${man?" manual":""}${dateFromKey(k).getDay()===0?" sun":""}" data-k="${k}" title="${esc(personLabel(p))} · ${dateDisplay(dateFromKey(k))}${man?" · corrected by hand":""}">${c?`<span class="code ${codeClass(c)}">${esc(c)}</span>`:""}</td>`;
    });
    cols.forEach(c=>body+=`<td class="t${t[c]?"":" zero"}" data-tot="${esc(c)}">${t[c]||0}</td>`);
    body+=`</tr>`;
  });
  const legend=[`<span><span class="code code-P">${esc(pc)}</span>Present / on duty</span>`].concat(allOffLabels().map(l=>{ const c=codeForOffLabel(l); return `<span><span class="code ${codeClass(c)}">${esc(c)}</span>${esc(l)}</span>`; })).join("")+`<span><span style="display:inline-block;width:10px;height:10px;background:linear-gradient(225deg,var(--gold) 50%,transparent 50%)"></span>Corrected by hand</span>`;
  box.innerHTML=`<div class="card">
    <div class="card-head">
      <h2>${ic("calendar")}${esc(attendanceTitle(sheet))}</h2>
      ${isPreview?`<span class="tag amber">Preview — not saved</span>`:locked?`<span class="tag gold">${ic("lock")} Finalised</span>`:`<span class="tag green">Saved to Drive</span>`}
      <span class="sub">${sheet.personIds.length} officers · ${dates.length} days · ${sheet.chartedDays} days have duty charts${sheet.updatedBy?` · last updated ${esc(sheet.updatedAt)} by ${esc(sheet.updatedBy)}`:""}</span>
      <span class="spacer"></span>
      ${!isPreview&&canEdit()&&!locked?`<button class="btn sm" id="rgRefresh">${ic("refresh")}Refresh from duty charts</button>`:""}
      ${!isPreview&&canAdmin()?`<button class="btn sm" id="rgLock">${locked?ic("unlock")+"Unlock":ic("lock")+"Finalise"}</button>`:""}
      <button class="btn sm gold" id="rgXls">${ic("download")}Excel</button>
      <button class="btn sm primary" id="rgPdf">${ic("download")}PDF</button>
      ${!isPreview&&canAdmin()?`<button class="icon-only danger" id="rgDel" title="Delete register">${ic("trash")}</button>`:""}
    </div>
    ${sheet.chartedDays<dates.length?`<div class="warn-box" style="margin:12px 18px">${ic("alert")}${dates.length-sheet.chartedDays} day(s) in this period have no saved duty chart — those cells are blank.</div>`:""}
    <div class="att-wrap"><table class="att"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="att-legend">${legend}</div>
    ${editable?`<div class="hint" style="padding:0 18px 14px">Click any cell to correct it. Corrections are saved automatically and recorded in the activity log (old → new value).</div>`:""}
  </div>`;
  $("#rgXls",box).onclick=()=>exportAttendanceExcel(sheet);
  $("#rgPdf",box).onclick=()=>exportAttendancePdf(sheet);
  const r=$("#rgRefresh",box); if(r) r.onclick=()=>{ refreshRegister(sheet.id); renderAttendance(pageEl); };
  const lk=$("#rgLock",box); if(lk) lk.onclick=async()=>{
    const to=locked?"draft":"final";
    if(to==="final"&&!await confirmBox({title:"Finalise register",message:"Finalised registers cannot be edited until an Administrator unlocks them.",confirmText:"Finalise"})) return;
    sheet.status=to; sheet.updatedAt=stampNow(); sheet.updatedBy=USER().name||USER().email;
    markDirty(`attendance/${sheet.id}/status`); markDirty(`attendance/${sheet.id}/updatedAt`); markDirty(`attendance/${sheet.id}/updatedBy`);
    audit("Attendance",to==="final"?"Finalise register":"Unlock register",attendanceTitle(sheet),locked?"Finalised":"Draft",to==="final"?"Finalised":"Draft");
    renderAttendance(pageEl);
  };
  const dl=$("#rgDel",box); if(dl) dl.onclick=async()=>{
    if(!await confirmBox({title:"Delete register",message:`Delete the saved register <b>${esc(attendanceTitle(sheet))}</b>? The daily duty charts are not affected, and a Drive backup keeps a copy.`,confirmText:"Delete",danger:true})) return;
    delete S.attendance[sheet.id]; markDirty(`attendance/${sheet.id}`);
    audit("Attendance","Delete register",attendanceTitle(sheet),"saved","deleted");
    UI.att.currentId=null; renderAttendance(pageEl);
  };
  if(editable) $$("td.c",box).forEach(td=>td.onclick=e=>openCodeMenu(td,sheet));
}

function openCodeMenu(td,sheet){
  closePop();
  const pid=td.closest("tr").dataset.pid, k=td.dataset.k, p=personById(pid);
  const cur=(sheet.cells[pid]||{})[k]||"";
  const man=sheet.manual&&sheet.manual[pid]&&sheet.manual[pid][k];
  const codes=[presentCode()].concat(LEAVE_TOTAL_CODES,["COFF"],allOffLabels().map(codeForOffLabel)).filter((c,i,a)=>c&&a.indexOf(c)===i);
  const m=document.createElement("div");
  m.className="code-menu";
  m.innerHTML=`<div class="ttl"><b>${esc(personLabel(p))}</b><br>${dowName(dateFromKey(k))}, ${dateDisplay(dateFromKey(k))} · from chart: <b>${esc(attendanceCodeForDuty(dutyOf(k,pid))||"blank")}</b></div>
    <div class="opts">${codes.map(c=>`<button data-c="${esc(c)}" class="${c===cur?"cur":""}">${esc(c)}</button>`).join("")}<button data-c="" class="${!cur?"cur":""}">—</button>
    ${man?`<button class="reset" data-reset="1">↺ Use duty chart value</button>`:""}</div>
    <div class="custom"><input maxlength="6" placeholder="Other code"><button class="btn sm primary">Set</button></div>`;
  $("#popRoot").appendChild(m);
  const r=td.getBoundingClientRect();
  let left=Math.min(r.left,window.innerWidth-250), top=r.bottom+6;
  if(top+260>window.innerHeight) top=Math.max(8,r.top-266);
  m.style.left=Math.max(8,left)+"px"; m.style.top=top+"px";
  const apply=(val,reset)=>{
    closePop();
    if(!sheet.cells[pid]) sheet.cells[pid]={};
    if(!sheet.manual) sheet.manual={};
    const nv=reset?attendanceCodeForDuty(dutyOf(k,pid)):val;
    if(nv===cur&&!reset) return;
    sheet.cells[pid][k]=nv;
    if(reset){ if(sheet.manual[pid]) delete sheet.manual[pid][k]; }
    else{ if(!sheet.manual[pid]) sheet.manual[pid]={}; sheet.manual[pid][k]=true; }
    sheet.updatedAt=stampNow(); sheet.updatedBy=USER().name||USER().email;
    markDirty(`attendance/${sheet.id}/cells/${pid}/${k}`); markDirty(`attendance/${sheet.id}/manual/${pid}`);
    markDirty(`attendance/${sheet.id}/updatedAt`); markDirty(`attendance/${sheet.id}/updatedBy`);
    audit("Attendance",reset?"Reset attendance cell":"Edit attendance",`${personLabel(p)} · ${dateDisplay(dateFromKey(k))}`,cur||"blank",nv||"blank");
    // update cell & totals in place
    td.innerHTML=nv?`<span class="code ${codeClass(nv)}">${esc(nv)}</span>`:"";
    td.classList.toggle("manual",!reset);
    const cols=attendanceColumns(sheet), tr=td.closest("tr");
    const shown=$$("td[data-tot]",tr).map(x=>x.dataset.tot);
    if(cols.join("|")!==shown.join("|")){ renderAttendance($("#page")); return; }
    const t=attendanceTotals(sheet,pid);
    $$("td[data-tot]",tr).forEach(x=>{ const v=t[x.dataset.tot]||0; x.textContent=v; x.classList.toggle("zero",!v); });
  };
  $$("[data-c]",m).forEach(b=>b.onclick=()=>apply(b.dataset.c,false));
  const rs=$("[data-reset]",m); if(rs) rs.onclick=()=>apply("",true);
  const inp=$(".custom input",m);
  $(".custom button",m).onclick=()=>{ const v=inp.value.trim().toUpperCase(); if(v) apply(v,false); };
  inp.onkeydown=e=>{ if(e.key==="Enter"){ const v=inp.value.trim().toUpperCase(); if(v) apply(v,false); } };
  setTimeout(()=>document.addEventListener("mousedown",outsidePop),0);
}
function outsidePop(e){ if(!e.target.closest(".code-menu")) closePop(); }
function closePop(){ $("#popRoot").innerHTML=""; document.removeEventListener("mousedown",outsidePop); }

/* =======================================================================
   PERSONNEL
   ======================================================================= */
function renderPersonnel(el){
  const mg=canManagePersonnel();
  const all=S.personnel||[];
  const q=UI.personnel.q.trim().toLowerCase(), f=UI.personnel.filter;
  const list=all.filter(p=>{
    if(f==="active"&&!isActive(p)) return false;
    if(f==="inactive"&&isActive(p)) return false;
    if(q&&!(p.name.toLowerCase().includes(q)||displayRank(p.rank).toLowerCase().includes(q)||(p.penNo||"").toLowerCase().includes(q)||(p.phone||"").includes(q))) return false;
    return true;
  });
  const act=activePersonnel();
  const byRank={}; act.forEach(p=>{ const r=baseRank(p.rank); byRank[r]=(byRank[r]||0)+1; });
  const drag=mg&&f==="active"&&!q;
  el.innerHTML=`
  <div class="card">
    <div class="card-head">
      <h2>${ic("users")}Station roster</h2>
      <div class="seg" id="pfSeg">${[["active",`Active (${act.length})`],["inactive",`Transferred / removed (${all.length-act.length})`],["all",`All (${all.length})`]].map(([k,l])=>`<button data-f="${k}" class="${f===k?"on":""}">${l}</button>`).join("")}</div>
      <span class="spacer"></span>
      <input class="input sm" id="pfQ" placeholder="Search name, rank, PEN, phone…" value="${esc(UI.personnel.q)}" style="width:230px">
      ${mg?`<button class="btn sm" id="pfSort">${ic("sort")}Sort by rank</button><button class="btn sm primary" id="pfAdd">${ic("userPlus")}Add officer</button>`:""}
    </div>
    <div class="card-body" style="padding-bottom:8px"><div class="row">${RANKS.filter(r=>byRank[r]).map(r=>`<span class="rank-pill" style="${pillStyle(r)}">${esc(r)} · ${byRank[r]}</span>`).join("")}<span class="muted small" style="margin-left:6px">Expected strength ${esc(settings().expectedStrength)}</span></div></div>
    <div class="table-wrap"><table class="data"><thead><tr><th style="width:34px"></th><th style="width:40px">Pos</th><th>Rank</th><th>Name</th><th>PEN No</th><th>Phone</th><th>Status</th><th>Remarks</th><th style="width:150px"></th></tr></thead>
      <tbody id="pBody">${list.length?list.map(p=>{
        const st=PERSON_STATUS[p.status]||PERSON_STATUS.active;
        return `<tr data-id="${p.id}" class="${isActive(p)?"":"inactive"}">
          <td>${drag?`<span class="drag-handle" title="Drag to change position">${ic("grip")}</span>`:""}</td>
          <td class="pos-no">${rosterIndex(p.id)+1}</td>
          <td>${rankPill(p.rank)}</td>
          <td><b>${esc(p.name)}</b>${p.attached?` <span class="tag violet">Attached</span>`:""}</td>
          <td class="mono small">${esc(p.penNo||"")}</td>
          <td class="mono small">${esc(p.phone||"")}</td>
          <td><span class="tag ${st.tag}">${st.label}</span>${p.statusDate&&!isActive(p)?`<div class="small muted">${esc(dateDisplay(dateFromKey(p.statusDate)))}</div>`:""}</td>
          <td class="wrap small">${esc(p.remarks||"")}</td>
          <td><div class="row end" style="gap:2px">${mg?`
            ${drag?`<button class="icon-only" data-up title="Move up">${ic("chevU")}</button><button class="icon-only" data-down title="Move down">${ic("chevD")}</button>`:""}
            <button class="icon-only" data-edit title="Edit officer">${ic("edit")}</button>
            ${isActive(p)?`<button class="icon-only danger" data-remove title="Transfer / remove">${ic("userX")}</button>`:`<button class="icon-only" data-restore title="Restore to active roster">${ic("restore")}</button>`}`:""}
          </div></td></tr>`;
      }).join(""):`<tr><td colspan="9"><div class="empty">No officers match.</div></td></tr>`}</tbody></table></div>
    <div class="hint" style="padding:12px 18px">${drag?`Drag ${ic("grip")} or use the arrows to change an officer's position — this order is used in the duty chart, Friday parade and attendance register. `:""}Removing or transferring an officer keeps all of their past duty charts and attendance intact.${mg?"":" Only the Administrator can change the roster."}</div>
  </div>`;
  $$("#pfSeg button",el).forEach(b=>b.onclick=()=>{ UI.personnel.filter=b.dataset.f; renderPersonnel(el); });
  $("#pfQ",el).oninput=debounce(e=>{ UI.personnel.q=e.target.value; renderPersonnel(el); setTimeout(()=>{ const i=$("#pfQ"); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length);} },0); },300);
  if(!mg) return;
  $("#pfAdd",el).onclick=()=>officerModal(null,()=>renderPersonnel(el));
  $("#pfSort",el).onclick=async()=>{
    if(!await confirmBox({title:"Sort roster by rank",message:"Reset the roster order to rank seniority, then name? Any custom order will be replaced.",confirmText:"Sort"})) return;
    S.personnel=sortByRank(S.personnel); markDirty("personnel"); audit("Personnel","Sort roster by rank","Roster","custom order","rank order"); renderPersonnel(el);
  };
  const body=$("#pBody",el);
  $$("tr[data-id]",body).forEach(tr=>{
    const id=tr.dataset.id, p=personById(id);
    const b=s=>$(s,tr);
    if(b("[data-edit]")) b("[data-edit]").onclick=()=>officerModal(p,()=>renderPersonnel(el));
    if(b("[data-remove]")) b("[data-remove]").onclick=()=>removeOfficerModal(p,()=>renderPersonnel(el));
    if(b("[data-restore]")) b("[data-restore]").onclick=async()=>{
      if(!await confirmBox({title:"Restore officer",message:`Restore <b>${esc(personLabel(p))}</b> to the active roster?`,confirmText:"Restore"})) return;
      const old=p.status; p.status="active"; p.statusDate=""; markDirty("personnel"); audit("Personnel","Restore officer",personLabel(p),PERSON_STATUS[old]?.label||old,"Active"); renderPersonnel(el);
    };
    const move=dir=>{ const ids=$$("tr[data-id]",body).map(x=>x.dataset.id); const i=ids.indexOf(id), j=i+dir; if(j<0||j>=ids.length) return; [ids[i],ids[j]]=[ids[j],ids[i]]; applyRosterOrder(ids,id); renderPersonnel(el); };
    if(b("[data-up]")) b("[data-up]").onclick=()=>move(-1);
    if(b("[data-down]")) b("[data-down]").onclick=()=>move(1);
  });
  if(drag) makeSortable(body,{onEnd:ev=>{ if(ev.oldIndex===ev.newIndex) return; applyRosterOrder($$("tr[data-id]",body).map(x=>x.dataset.id),ev.item.dataset.id); renderPersonnel(el); }});
}

function officerModal(p,done){
  const isNew=!p;
  const v=p||{name:"",rank:"CPO",penNo:"",phone:"",attached:false,status:"active",statusDate:"",remarks:""};
  openModal({title:isNew?"Add officer":"Edit officer — "+p.name,body:`<div class="form-grid">
      <div class="field full"><label>Name *</label><input class="input" id="oName" value="${esc(v.name)}"></div>
      <div class="field"><label>Rank / grade</label><select class="select" id="oRank">${RANK_OPTIONS.map(o=>`<option value="${esc(o.value)}" ${o.value===v.rank?"selected":""}>${esc(o.label)}</option>`).join("")}</select></div>
      <div class="field"><label>PEN No</label><input class="input" id="oPen" value="${esc(v.penNo||"")}"></div>
      <div class="field"><label>Phone</label><input class="input" id="oPhone" value="${esc(v.phone||"")}" inputmode="tel"></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" id="oAtt" ${v.attached?"checked":""}> Attached (Attd) to this station</label></div>
      ${isNew?"":`<div class="field"><label>Status</label><select class="select" id="oStatus">${Object.entries(PERSON_STATUS).map(([k,s])=>`<option value="${k}" ${k===v.status?"selected":""}>${s.label}</option>`).join("")}</select></div>
      <div class="field"><label>Status effective date</label><input type="date" class="input" id="oSDate" value="${esc(v.statusDate||"")}"></div>`}
      <div class="field full"><label>Remarks</label><textarea class="input" id="oRem" rows="2">${esc(v.remarks||"")}</textarea></div>
    </div>`,
    actions:[{label:"Cancel"},{label:isNew?"Add officer":"Save changes",cls:"primary",icon:"check",onClick:(close,el)=>{
      const name=$("#oName",el).value.trim();
      if(!name){ toast("Officer name is required.","warn"); return false; }
      const nv={name,rank:$("#oRank",el).value,penNo:$("#oPen",el).value.trim(),phone:$("#oPhone",el).value.trim(),attached:$("#oAtt",el).checked,remarks:$("#oRem",el).value.trim()};
      if(!isNew){ nv.status=$("#oStatus",el).value; nv.statusDate=$("#oSDate",el).value; }
      if(isNew){
        const np=Object.assign({id:uid(),status:"active",statusDate:""},nv);
        S.personnel.push(np); markDirty("personnel");
        audit("Personnel","Add officer",personLabel(np),"",`Rank ${displayRank(np.rank)}${np.attached?", attached":""}`);
        toast(personLabel(np)+" added to the roster.","success");
      }else{
        const labels={name:"Name",rank:"Rank",penNo:"PEN No",phone:"Phone",attached:"Attached",remarks:"Remarks",status:"Status",statusDate:"Status date"};
        const olds=[], news=[];
        Object.keys(nv).forEach(k=>{ const o=p[k]===undefined?"":p[k], n=nv[k]; if(String(o)!==String(n)){ olds.push(`${labels[k]}: ${k==="rank"?displayRank(o):o}`); news.push(`${labels[k]}: ${k==="rank"?displayRank(n):n}`); } });
        if(olds.length){
          const before=personLabel(p);
          Object.assign(p,nv); markDirty("personnel");
          audit("Personnel",olds.some(x=>x.startsWith("Rank"))?"Change rank / edit officer":"Edit officer",before,olds.join("; "),news.join("; "));
          toast("Officer details saved.","success");
        }
      }
      close(); done&&done();
    }}]});
}

function removeOfficerModal(p,done){
  openModal({title:"Transfer / remove officer",body:`<p><b>${esc(personLabel(p))}</b> will leave the active roster. Past duty charts and attendance remain unchanged.</p>
    <div class="form-grid"><div class="field"><label>Reason</label><select class="select" id="rmSt"><option value="transferred">Transferred out</option><option value="retired">Retired</option><option value="removed">Removed</option></select></div>
    <div class="field"><label>Effective date</label><input type="date" class="input" id="rmDate" value="${dateKey(today())}"></div>
    <div class="field full"><label>Remarks</label><input class="input" id="rmRem" placeholder="e.g. Transferred to Hill Palace PS"></div></div>`,
    actions:[{label:"Cancel"},{label:"Confirm",cls:"danger solid",onClick:(close,el)=>{
      const st=$("#rmSt",el).value, d=$("#rmDate",el).value, rem=$("#rmRem",el).value.trim();
      p.status=st; p.statusDate=d; if(rem) p.remarks=rem;
      markDirty("personnel");
      audit("Personnel",st==="transferred"?"Transfer officer":st==="retired"?"Retire officer":"Remove officer",personLabel(p),"Active",`${PERSON_STATUS[st].label}${d?" w.e.f. "+dateDisplay(dateFromKey(d)):""}${rem?" — "+rem:""}`);
      close(); done&&done();
    }}]});
}

/* =======================================================================
   DUTY SETUP (priority order, duty types, cyber tips)
   ======================================================================= */
function renderSetup(el){
  const ro=canReorderDuties(), ed=canEdit();
  const ordered=orderedDutyCategories();
  const custom=S.dutyTypes||[];
  el.innerHTML=`
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><h2>${ic("list")}Duty priority order</h2><span class="spacer"></span>${ro?`<button class="btn sm" id="doReset">${ic("restore")}Default order</button>`:""}</div>
      <div class="card-body">
        <p class="hint" style="margin-top:0">${ro?`Drag ${ic("grip")} up or down, or use the arrows. `:""}This order is used for the Duty Detailing table, Excel and PDF.</p>
        <ul class="order-list" id="doList">${ordered.map((c,i)=>`<li class="order-item" data-key="${c.key}">${ro?`<span class="drag-handle">${ic("grip")}</span>`:""}<span class="no">${i+1}.</span><span class="lbl">${esc(c.label)}</span>${ro?`<button class="icon-only" data-up ${i===0?"disabled":""}>${ic("chevU")}</button><button class="icon-only" data-down ${i===ordered.length-1?"disabled":""}>${ic("chevD")}</button>`:""}</li>`).join("")}</ul>
        ${ro?"":`<p class="hint">${ic("lock")} Only the Administrator can change the priority order.</p>`}
      </div>
    </div>
    <div>
      <div class="card">
        <div class="card-head"><h2>${ic("plus")}Custom duty types</h2></div>
        <div class="card-body">
          <div class="field"><label>Duty</label><div class="type-list">${custom.filter(d=>d.category!=="off").map(d=>typeTag(d,ed)).join("")||'<span class="muted small">None</span>'}</div></div>
          <div class="field" style="margin-top:14px"><label>Off duty / Leave / Rest</label><div class="type-list">${custom.filter(d=>d.category==="off").map(d=>typeTag(d,ed)).join("")||'<span class="muted small">None</span>'}</div></div>
          ${ed?`<div class="row" style="margin-top:16px"><input class="input" id="dtName" placeholder="New duty type" style="flex:1;min-width:160px"><select class="select" id="dtCat"><option value="duty">Duty</option><option value="off">Off duty / Leave / Rest</option></select><button class="btn primary" id="dtAdd">${ic("plus")}Add</button></div>`:""}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>${ic("calendar")}Leave / rest types &amp; attendance codes</h2>${canAdmin()?`<span class="spacer"></span><button class="btn sm" data-nav="settings">Edit codes ${ic("chevR")}</button>`:""}</div>
        <div class="card-body tight"><table class="data"><thead><tr><th>Off duty / Leave / Rest</th><th>Code in attendance</th></tr></thead><tbody>
          <tr><td>Any duty (present)</td><td><span class="code code-P">${esc(presentCode())}</span></td></tr>
          ${allOffLabels().map(l=>`<tr><td>${esc(l)}</td><td><span class="code ${codeClass(codeForOffLabel(l))}">${esc(codeForOffLabel(l))}</span></td></tr>`).join("")}
        </tbody></table></div>
      </div>
    </div>
  </div>
  <div class="card" id="tipCard"></div>`;
  $$(".type-tag [data-del]",el).forEach(b=>b.onclick=async()=>{
    const name=b.dataset.del;
    if(!await confirmBox({title:"Remove duty type",message:`Remove "<b>${esc(name)}</b>" from the dropdown? Past duty charts that used it keep the label.`,confirmText:"Remove",danger:true})) return;
    const d=S.dutyTypes.find(x=>x.name===name);
    S.dutyTypes=S.dutyTypes.filter(x=>x.name!==name); markDirty("dutyTypes");
    audit("Duty Setup","Remove duty type",name,d&&d.category==="off"?"Off duty / Leave":"Duty","removed");
    renderSetup(el);
  });
  if(ed) $("#dtAdd",el).onclick=()=>{
    const name=$("#dtName",el).value.trim(), cat=$("#dtCat",el).value;
    if(!name){ toast("Enter a duty type name.","warn"); return; }
    if(FIXED_DUTY_LABELS.concat(OFF_DUTY_TYPES).some(d=>d.toLowerCase()===name.toLowerCase())){ toast("That is already a standard duty type.","warn"); return; }
    if(custom.some(d=>d.name.toLowerCase()===name.toLowerCase())){ toast("That duty type already exists.","warn"); return; }
    S.dutyTypes.push({name,category:cat}); markDirty("dutyTypes");
    audit("Duty Setup","Add duty type",name,"",cat==="off"?"Off duty / Leave":"Duty");
    renderSetup(el);
  };
  if(ro){
    const list=$("#doList",el);
    const commit=(movedKey)=>{
      const oldIdx=orderedDutyCategories().findIndex(c=>c.key===movedKey);
      S.dutyOrder=$$(".order-item",list).map(li=>li.dataset.key);
      markDirty("dutyOrder");
      const c=DUTY_CATEGORIES.find(x=>x.key===movedKey);
      audit("Duty Setup","Change duty priority",c?c.label:movedKey,"Position "+(oldIdx+1),"Position "+(S.dutyOrder.indexOf(movedKey)+1));
      renderSetup(el);
    };
    makeSortable(list,{onEnd:ev=>{ if(ev.oldIndex!==ev.newIndex) commit(ev.item.dataset.key); }});
    $$(".order-item",list).forEach(li=>{
      const mv=dir=>{ const a=$$(".order-item",list); const i=a.indexOf(li), j=i+dir; if(j<0||j>=a.length) return; if(dir<0) list.insertBefore(li,a[j]); else list.insertBefore(a[j],li); commit(li.dataset.key); };
      const u=$("[data-up]",li), d=$("[data-down]",li);
      if(u) u.onclick=()=>mv(-1); if(d) d.onclick=()=>mv(1);
    });
    $("#doReset",el).onclick=async()=>{
      if(!await confirmBox({title:"Default duty order",message:"Reset the duty priority order to the default?",confirmText:"Reset"})) return;
      S.dutyOrder=defaultCore().dutyOrder; markDirty("dutyOrder"); audit("Duty Setup","Reset duty priority","Duty order","custom","default"); renderSetup(el);
    };
  }
  renderTipManager($("#tipCard",el),el);
}
function typeTag(d,ed){ return `<span class="type-tag">${esc(d.name)} <small class="muted">${d.category==="off"?esc(codeForOffLabel(d.name)):""}</small>${ed?`<button class="icon-only danger" data-del="${esc(d.name)}" title="Remove">${ic("x")}</button>`:""}</span>`; }

function renderTipManager(box,pageEl){
  const ed=canEdit(), t=tipFor(dateKey(today()));
  box.innerHTML=`<div class="card-head"><h2>${ic("bulb")}Cyber tip of the day</h2><span class="sub">${S.tips.length} messages · Day 1 = 1 January</span><span class="spacer"></span>
    ${ed?`<label class="btn sm">${ic("upload")}Upload Excel<input type="file" id="tipFile" accept=".xlsx,.xls,.csv" hidden></label><button class="btn sm" id="tipDefault">${ic("restore")}Restore default 365</button>`:""}
    <button class="btn sm" id="tipShow">${ic("eye")}Show all</button></div>
    <div class="tip-strip">${ic("bulb")}<div><b>Today · #${t.index===null?"—":t.index+1}</b><div class="txt">${esc(t.text)}</div></div></div>
    ${ed?`<div class="card-body row"><input class="input" id="tipNew" placeholder="Type one message to add…" style="flex:1"><button class="btn primary" id="tipAdd">${ic("plus")}Add</button></div>`:""}
    <div id="tipList" hidden style="max-height:320px;overflow:auto;border-top:1px solid var(--line-2)"></div>`;
  $("#tipShow",box).onclick=()=>{
    const l=$("#tipList",box); l.hidden=!l.hidden;
    if(!l.hidden) l.innerHTML=`<table class="data"><tbody>${S.tips.map((x,i)=>`<tr><td class="pos-no">${i+1}</td><td class="wrap small">${esc(x)}</td><td style="width:40px">${ed?`<button class="icon-only danger" data-tdel="${i}">${ic("x")}</button>`:""}</td></tr>`).join("")}</tbody></table>`;
    $$("[data-tdel]",l).forEach(b=>b.onclick=()=>{ const i=+b.dataset.tdel; const txt=S.tips[i]; S.tips.splice(i,1); S.usedTipIndices=[]; markDirty("tips"); markDirty("usedTipIndices"); audit("Duty Setup","Delete cyber tip","#"+(i+1),txt.slice(0,120),"deleted"); renderTipManager(box,pageEl); $("#tipShow",box).click(); });
  };
  if(!ed) return;
  $("#tipAdd",box).onclick=()=>{ const v=$("#tipNew",box).value.trim(); if(!v) return; S.tips.push(v); markDirty("tips"); audit("Duty Setup","Add cyber tip","#"+S.tips.length,"",v.slice(0,200)); renderTipManager(box,pageEl); toast("Message added.","success"); };
  $("#tipDefault",box).onclick=async()=>{
    if(!await confirmBox({title:"Restore default tips",message:"Replace the current message list with the bundled 365-day cyber tip set?",confirmText:"Restore"})) return;
    S.tips=(window.CYBER_TIPS_365||[]).slice(); S.tipsVersion=TIPS_VERSION; S.usedTipIndices=[];
    markDirty("tips"); markDirty("tipsVersion"); markDirty("usedTipIndices");
    audit("Duty Setup","Restore default cyber tips","Cyber tips","custom list","365 default tips"); renderTipManager(box,pageEl);
  };
  $("#tipFile",box).onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    if(file.size>1024*1024){ toast("Please upload an Excel file under 1 MB.","warn"); e.target.value=""; return; }
    if(!needLibs("xlsx")) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const wb=window.XLSX.read(new Uint8Array(ev.target.result),{type:"array"});
        let rows=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
        const DAY=/^day\s*\d+$/i, SER=/^(sl\s*no\.?|s\.no\.?|#|no\.?)$/i;
        const headers=["tip of the day","tip","message","cyber tip","daily message","content"];
        let col=0, found=false;
        if(rows.length&&rows[0]){ const h=rows[0].map(c=>String(c??"").trim().toLowerCase()); const i=h.findIndex(x=>headers.includes(x)); if(i>=0){ col=i; found=true; rows=rows.slice(1); } }
        if(!found){ const max=rows.reduce((m,r)=>Math.max(m,r?r.length:0),0); let best=-1; for(let c=0;c<max;c++){ let tot=0,n=0; rows.slice(0,40).forEach(r=>{ const v=r&&r[c]!=null?String(r[c]).trim():""; if(v&&!DAY.test(v)&&!SER.test(v)){ tot+=v.length; n++; } }); const avg=n?tot/n:0; if(avg>best){ best=avg; col=c; } } }
        const msgs=rows.map(r=>r&&r[col]!=null?String(r[col]).trim():"").filter(v=>v&&!DAY.test(v)&&!SER.test(v)&&!headers.includes(v.toLowerCase()));
        if(!msgs.length){ toast("No usable text found in that file.","warn"); return; }
        if(!await confirmBox({title:"Replace cyber tips",message:`Found <b>${msgs.length}</b> message(s) in ${esc(file.name)}. Replace the current list?`,confirmText:"Replace"})) return;
        S.tips=msgs; S.tipsVersion=TIPS_VERSION; S.usedTipIndices=[];
        markDirty("tips"); markDirty("tipsVersion"); markDirty("usedTipIndices");
        audit("Duty Setup","Upload cyber tips",file.name,"",msgs.length+" messages");
        renderTipManager(box,pageEl);
      }catch(err){ toast("Could not read this file. Upload a valid .xlsx/.xls/.csv file.","error"); reportError("Duty Setup","Upload cyber tips",err); }
    };
    reader.readAsArrayBuffer(file); e.target.value="";
  };
}
