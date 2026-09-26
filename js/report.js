/* =========================================================================
   report.js — duty board / parade / attendance calculations and the
   Excel & PDF exports (same report designs as the original duty chart).
   ========================================================================= */
"use strict";

/* ------------------------------------------------------------ duty board */
function computeDutyBoard(key){
  const rec=(S.records[key])||{assignments:{}};
  const asg=rec.assignments||{};
  const cats=orderedDutyCategories();
  const rows=cats.map(c=>({key:c.key,label:c.label,people:[]}));
  const otherMap={}, offMap={};
  let onDuty=0, offCount=0;
  (S.personnel||[]).forEach(p=>{
    const a=asg[p.id]; const duty=a?(a.duty||"").trim():"";
    if(!duty) return;
    const item={p,note:a.note||""};
    if(isOffDuty(duty)){
      const cat=OFF_DUTY_CATEGORIES.find(c=>c.label.toLowerCase()===duty.toLowerCase());
      const lbl=cat?cat.label:duty;
      (offMap[lbl]=offMap[lbl]||[]).push(item); offCount++; return;
    }
    onDuty++;
    const cat=cats.find(c=>c.label.toLowerCase()===duty.toLowerCase());
    if(cat) rows.find(r=>r.key===cat.key).people.push(item);
    else (otherMap[duty]=otherMap[duty]||[]).push(item);
  });
  rows.forEach(r=>{
    if(r.key==="crime_inv"){
      const ip=r.people.filter(x=>baseRank(x.p.rank)==="IP"), rest=r.people.filter(x=>baseRank(x.p.rank)!=="IP");
      r.people=ip.concat(rest);
    }
  });
  const visibleRows=rows.filter(r=>r.people.length);
  const customOrder=(S.dutyTypes||[]).map(d=>d.name.toLowerCase());
  const otherRows=Object.keys(otherMap).sort((a,b)=>{
    const ia=customOrder.indexOf(a.toLowerCase()), ib=customOrder.indexOf(b.toLowerCase());
    return (ia<0?999:ia)-(ib<0?999:ib)||a.localeCompare(b);
  }).map(label=>({key:label,label,people:otherMap[label],isOther:true}));
  const offRows=[];
  OFF_DUTY_CATEGORIES.forEach(c=>{ if(offMap[c.label]){ offRows.push({key:c.key,label:c.label,people:offMap[c.label]}); delete offMap[c.label]; } });
  Object.keys(offMap).sort().forEach(l=>offRows.push({key:l,label:l,people:offMap[l]}));
  const unassigned=activePersonnel().filter(p=>!(asg[p.id]&&(asg[p.id].duty||"").trim())).length;
  // Final order of the Duty Detailing and Off Duty rows:
  //  1. default = duty priority order (off duty: standard leave order);
  //  2. rows with an ACP / IP officer move to the top (ACP rows first);
  //  3. if the rows were dragged into a custom order for this date, that wins.
  const dutyRows=arrangeRows(visibleRows.concat(otherRows),rec.rowOrder);
  const offOrdered=arrangeRows(offRows,rec.offRowOrder);
  return {visibleRows,otherRows,dutyRows,manualOrder:dutyRows.manual,offRows:offOrdered,offManualOrder:offOrdered.manual,counts:{onDuty,off:offCount,unassigned}};
}
function arrangeRows(list,savedOrder){
  let rows=list.map((r,i)=>Object.assign(r,{rowId:r.label.toLowerCase(),defIdx:i}));
  if(settings().seniorDutiesFirst!==false){
    const seniority=r=>{ const rs=r.people.map(x=>baseRank(x.p.rank)); return rs.includes("ACP")?0:rs.includes("IP")?1:2; };
    rows.sort((a,b)=>seniority(a)-seniority(b)||a.defIdx-b.defIdx);
  }
  const manual=Array.isArray(savedOrder)&&savedOrder.length?savedOrder.map(x=>String(x).toLowerCase()):null;
  if(manual){
    const pos=r=>{ const i=manual.indexOf(r.rowId); return i<0?null:i; };
    const listed=rows.filter(r=>pos(r)!==null).sort((a,b)=>pos(a)-pos(b));
    rows.filter(r=>pos(r)===null).forEach(r=>{ const at=rows.indexOf(r); listed.splice(Math.min(at,listed.length),0,r); });
    rows=listed;
  }
  rows.manual=!!manual;
  return rows;
}
function splitIpFirst(people){
  const idx=people.findIndex(x=>baseRank(x.p.rank)!=="IP");
  if(idx<=0) return [people];
  return [people.slice(0,idx),people.slice(idx)];
}
function officerChip(p,note){
  return `<span class="officer-chip"><span class="r">${esc(displayRank(p.rank))}</span>${esc(p.name)}${p.attached?" <em>(Attd)</em>":""}${note?`<span class="note">— ${esc(note)}</span>`:""}</span>`;
}
function officerChipsForRow(rowKey,people){
  if(rowKey!=="crime_inv") return people.map(x=>officerChip(x.p,x.note)).join("");
  return splitIpFirst(people).map(g=>`<div class="chip-line">${g.map(x=>officerChip(x.p,x.note)).join("")}</div>`).join("");
}
function officerNames(people){ return people.map(x=>`${displayRank(x.p.rank)} ${x.p.name}${x.p.attached?" (Attd)":""}${x.note?` — ${x.note}`:""}`).join("; "); }
function officerNamesForRow(rowKey,people,sep){
  if(rowKey!=="crime_inv") return officerNames(people);
  return splitIpFirst(people).map(officerNames).join(sep);
}
function strengthGroups(){
  const groups=[];
  S.strengthTable.columns.forEach(c=>{
    if(groups.length&&groups[groups.length-1].group===c.group) groups[groups.length-1].keys.push(c.key);
    else groups.push({group:c.group,keys:[c.key]});
  });
  return groups;
}

/* ------------------------------------------------------------ cyber tip */
function dayOfYear(d){ return Math.floor((d-new Date(d.getFullYear(),0,0))/86400000); }
function tipIndexFor(key){
  if(!S.tips||!S.tips.length) return null;
  const rec=S.records[key];
  if(rec&&rec.messageIndex!==null&&rec.messageIndex!==undefined&&rec.messageIndex<S.tips.length) return rec.messageIndex;
  return (dayOfYear(dateFromKey(key))-1)%S.tips.length;
}
function tipFor(key){ const i=tipIndexFor(key); return {index:i,text:(i!==null&&S.tips[i])?S.tips[i]:"No message available."}; }

/* ------------------------------------------------------------ parade */
const PARADE_OFF_KEYWORDS=[
  {test:"night gd",reason:"Night GD"},{test:"night watch",reason:"Night Watch"},{test:"course",reason:"Course"},
  {test:"subdivision",reason:"Subdivision Check"},{test:"sub division",reason:"Sub Division Check"},{test:"echo",reason:"Echo"}
];
function paradeAutoStatus(pid,fridayKey){
  const td=dutyOf(fridayKey,pid);
  const pd=dutyOf(dateKey(addDays(dateFromKey(fridayKey),-1)),pid);
  const dn=td.toLowerCase(), pn=pd.toLowerCase();
  if(td&&isOffDuty(td)) return {status:"off",reason:td};
  for(const k of PARADE_OFF_KEYWORDS){ if(dn.includes(k.test)) return {status:"off",reason:td||k.reason}; }
  if(pn.includes("night gd")) return {status:"off",reason:"Ongoing Night GD"};
  return {status:"on",reason:td||"Present"};
}
function paradeStatusFor(pid,fridayKey){
  const auto=paradeAutoStatus(pid,fridayKey);
  const ov=(S.paradeOverrides&&S.paradeOverrides[fridayKey])||{};
  if(ov[pid]==="on"||ov[pid]==="off") return {status:ov[pid],reason:auto.reason,manual:true};
  return {status:auto.status,reason:auto.reason,manual:false};
}
/* Per-Friday customisation: heading (e.g. "Catechism Class"), section
   labels, edited duty / reason text per officer, and a dragged order. */
function paradeMeta(key){ return (S.paradeMeta&&S.paradeMeta[key])||{}; }
function paradeTitle(key){ return (paradeMeta(key).title||"").trim()||"Friday Parade"; }
function paradeLabels(key){ const m=paradeMeta(key); return {on:(m.onLabel||"").trim()||"On Parade",off:(m.offLabel||"").trim()||"Off Parade"}; }
function computeParadeList(fridayKey){
  const on=[],off=[];
  const meta=paradeMeta(fridayKey), reasons=meta.reasons||{}, order=Array.isArray(meta.order)?meta.order:[];
  activePersonnel().forEach(p=>{
    const st=paradeStatusFor(p.id,fridayKey);
    if(reasons[p.id]!==undefined&&String(reasons[p.id]).trim()!==""){ st.autoReason=st.reason; st.reason=String(reasons[p.id]).trim(); st.customReason=true; }
    (st.status==="on"?on:off).push({p,st});
  });
  if(order.length){
    const pos=id=>{ const i=order.indexOf(id); return i<0?100000+rosterIndex(id):i; };
    on.sort((a,b)=>pos(a.p.id)-pos(b.p.id)); off.sort((a,b)=>pos(a.p.id)-pos(b.p.id));
  }
  return {on,off};
}

/* ------------------------------------------------------------ attendance */
function datesBetween(fromKey,toKey){
  const out=[]; let d=dateFromKey(fromKey); const end=dateFromKey(toKey);
  while(d<=end&&out.length<400){ out.push(dateKey(d)); d=addDays(d,1); }
  return out;
}
function attendancePeople(dates){
  const ids=new Set(activePersonnel().map(p=>p.id));
  (S.personnel||[]).forEach(p=>{ if(!ids.has(p.id)&&dates.some(k=>dutyOf(k,p.id))) ids.add(p.id); });
  return (S.personnel||[]).filter(p=>ids.has(p.id)).map(p=>p.id);
}
/** Builds (or refreshes) an attendance register from the saved duty charts.
    Cells that were edited by hand (sheet.manual) are kept as they are. */
function buildAttendance(fromKey,toKey,existing){
  const dates=datesBetween(fromKey,toKey);
  const personIds=attendancePeople(dates);
  if(existing) (existing.personIds||[]).forEach(id=>{ if(!personIds.includes(id)&&personById(id)) personIds.push(id); });
  const cells={}, manual=existing?clone(existing.manual||{}):{};
  let charted=0;
  dates.forEach(k=>{ if(S.records[k]&&Object.keys(S.records[k].assignments||{}).length) charted++; });
  personIds.forEach(pid=>{
    cells[pid]={};
    dates.forEach(k=>{
      if(manual[pid]&&manual[pid][k]&&existing&&existing.cells&&existing.cells[pid]) cells[pid][k]=existing.cells[pid][k]||"";
      else cells[pid][k]=attendanceCodeForDuty(dutyOf(k,pid));
    });
  });
  return {id:fromKey+"_"+toKey,from:fromKey,to:toKey,personIds,cells,manual,chartedDays:charted,totalDays:dates.length};
}
function attendanceColumns(sheet){
  const pc=presentCode();
  const found=new Set();
  sheet.personIds.forEach(pid=>Object.values(sheet.cells[pid]||{}).forEach(c=>{ if(c) found.add(c); }));
  const fixed=[pc].concat(LEAVE_TOTAL_CODES.filter(c=>c!==pc));
  const extra=[...found].filter(c=>!fixed.includes(c)).sort();
  return fixed.concat(extra);
}
function attendanceTotals(sheet,pid){
  const t={}; Object.values(sheet.cells[pid]||{}).forEach(c=>{ if(c) t[c]=(t[c]||0)+1; }); return t;
}
function attendanceTitle(sheet){ return `Attendance ${dateDash(dateFromKey(sheet.from))} to ${dateDash(dateFromKey(sheet.to))}`; }

/* ------------------------------------------------------------ delivery */
async function deliverReport(blob,filename,driveType){
  downloadBlob(blob,filename);
  logEvent("Reports","Export "+(filename.split(".").pop()||"").toUpperCase(),filename);
  if(settings().saveReportsToDrive&&!DEMO&&SESSION){
    try{
      const b64=await blobToBase64(blob);
      await api("reports.save",{type:driveType,fileName:filename,mimeType:blob.type||"application/octet-stream",base64:b64});
      toast(`Downloaded, and a copy saved to Drive ▸ Reports ▸ ${driveType}.`,"success");
    }catch(e){ toast("Downloaded. Copy to Drive failed: "+e.message,"warn"); reportError("Reports","Save report to Drive",e); }
  }else toast("Downloaded "+filename,"success");
}

function excelA4Head(sheetName,landscape){
  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'+
    '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>'+
    '<x:Name>'+sheetName+'</x:Name><x:WorksheetOptions><x:PageSetup><x:Layout x:Orientation="'+(landscape?"Landscape":"Portrait")+'"/>'+
    '<x:PageMargins x:Bottom="0.4" x:Left="0.4" x:Right="0.4" x:Top="0.4" x:Header="0.2" x:Footer="0.2"/></x:PageSetup>'+
    '<x:Print><x:PaperSizeIndex>9</x:PaperSizeIndex><x:FitWidth>1</x:FitWidth><x:FitHeight>0</x:FitHeight></x:Print>'+
    '</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->'+
    '<style>td,th{white-space:normal;mso-wrap-text:wrap;word-wrap:break-word;vertical-align:top;}</style></head><body>';
}
const xlsBlob=html=>new Blob(["﻿"+html],{type:"application/vnd.ms-excel"});
function stationLine(){ const s=settings(); return `${s.stationName}, ${s.stationCity}`; }
function reportShort(){ return settings().reportShort||"CYBER PS"; }
function needLibs(which){
  if(which==="pdf"&&!(window.jspdf&&window.jspdf.jsPDF)){ toast("PDF library could not load — check the internet connection.","error"); return false; }
  if(which==="xlsx"&&!window.XLSX){ toast("Excel library could not load — check the internet connection.","error"); return false; }
  return true;
}

/* ------------------------------------------------------------ duty chart exports */
function exportDutyExcel(key){
  const d=dateFromKey(key);
  const cols=S.strengthTable.columns, vals=S.strengthTable.values, groups=strengthGroups(), n=cols.length;
  const {dutyRows,offRows}=computeDutyBoard(key);
  const msg=tipFor(key).text;
  const NAVY="#132038",NAVY2="#1c2f4e",GOLD="#c9962f",TEAL="#125658",ORANGE="#e0562a",AMBER="#d97706",VIOLET="#7c3aed",INK="#1a2333";
  const FONT="font-family:'Calibri','Segoe UI',Arial,sans-serif;";
  const rowColors={sanctioned:"#eaf1ff",existing:"#eafaf1",attached:"#f5edfb",vacancy:"#fdeceb"};
  const rowText={sanctioned:"#1d4b8f",existing:"#1f7a4c",attached:"#6a3a9e",vacancy:"#a5341f"};
  let h=excelA4Head("Duty Chart");
  h+=`<table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;${FONT}font-size:12px;color:${INK};">`;
  h+=`<tr><td colspan="${n+2}" style="text-align:center;font-size:19px;font-weight:bold;padding:14px;background:${NAVY};color:#fff;">DUTY CHART OF ${esc(reportShort())} ON ${dateDisplay(d)}</td></tr>`;
  h+=`<tr><td colspan="${n+2}" style="text-align:center;font-size:12px;font-style:italic;padding:6px;background:${GOLD};color:#241a05;font-weight:bold;">${esc(stationLine())} · ${dowName(d)}</td></tr>`;
  h+=`<tr><td colspan="${n+2}" style="height:6px;border:none;"></td></tr>`;
  h+=`<tr style="background:${NAVY2};font-weight:bold;color:#fff;"><td>Designation</td>`+groups.map(g=>`<td colspan="${g.keys.length}">${esc(g.group)}</td>`).join("")+`<td style="background:${ORANGE};">Total</td></tr>`;
  h+=`<tr style="background:#dfe6f0;font-weight:bold;color:${NAVY};"><td>Grade Designation</td>`+cols.map(c=>`<td>${esc(c.sub||"")}</td>`).join("")+`<td style="background:#f6c9b8;"></td></tr>`;
  const srow=(label,rk,merge)=>{
    let tot=0; const bg=rowColors[rk], tc=rowText[rk];
    const cells=merge?groups.map(g=>{ let s=0; g.keys.forEach(k=>s+=(vals[rk][k]||0)); tot+=s; return `<td colspan="${g.keys.length}" style="background:${bg};color:${tc};">${s}</td>`; }).join("")
      :cols.map(c=>{ const v=vals[rk][c.key]||0; tot+=v; return `<td style="background:${bg};color:${tc};">${v}</td>`; }).join("");
    return `<tr><td style="font-weight:bold;background:${tc};color:#fff;">${label}</td>${cells}<td style="background:${ORANGE};color:#fff;font-weight:bold;">${tot}</td></tr>`;
  };
  h+=srow("Sanctioned","sanctioned",true)+srow("Existing","existing",false)+srow("Attached","attached",false)+srow("Vacancy","vacancy",true);
  h+=`<tr><td colspan="${n+2}" style="height:14px;border:none;"></td></tr>`;
  h+=`<tr style="background:${AMBER};font-weight:bold;color:#fff;font-size:13px;"><td colspan="2">DUTY ASSIGNMENTS</td><td colspan="${n}">Officer(s) Assigned</td></tr>`;
  const all=dutyRows;
  if(!all.length) h+=`<tr><td colspan="${n+2}" style="background:#fdf1de;">No duties assigned for this date.</td></tr>`;
  all.forEach((r,i)=>{ h+=`<tr style="background:${i%2?"#fffaf1":"#fdf1de"};"><td colspan="2" style="font-weight:bold;color:#a05a06;background:#fce3bc;">${esc(r.label)}</td><td colspan="${n}">${esc(officerNamesForRow(r.key,r.people,"\n")).replace(/\n/g,"<br>")}</td></tr>`; });
  h+=`<tr><td colspan="${n+2}" style="height:14px;border:none;"></td></tr>`;
  h+=`<tr style="background:${VIOLET};font-weight:bold;color:#fff;font-size:13px;"><td colspan="2">OFF DUTY / LEAVE / REST</td><td colspan="${n}">Officer(s)</td></tr>`;
  if(!offRows.length) h+=`<tr><td colspan="${n+2}" style="background:#efe7fc;">None.</td></tr>`;
  offRows.forEach((r,i)=>{ h+=`<tr style="background:${i%2?"#f8f4fe":"#efe7fc"};"><td colspan="2" style="color:${VIOLET};font-weight:bold;background:#e2d3fa;">${esc(r.label)}</td><td colspan="${n}">${esc(officerNames(r.people))}</td></tr>`; });
  h+=`<tr><td colspan="${n+2}" style="height:14px;border:none;"></td></tr>`;
  h+=`<tr><td colspan="${n+2}" style="background:${TEAL};color:#eafbfa;font-weight:bold;padding:12px;">CYBER TIP OF THE DAY: ${esc(msg)}</td></tr>`;
  h+="</table></body></html>";
  return deliverReport(xlsBlob(h),`Duty_Chart_${key}.xls`,"Duty Charts");
}

function exportDutyPdf(key){
  if(!needLibs("pdf")) return;
  const d=dateFromKey(key);
  const cols=S.strengthTable.columns, vals=S.strengthTable.values, groups=strengthGroups();
  const {dutyRows,offRows}=computeDutyBoard(key);
  const msg=tipFor(key).text;
  const doc=new window.jspdf.jsPDF({unit:"pt",format:"a4"});
  const W=doc.internal.pageSize.getWidth();
  const NAVY=[19,32,56],NAVY2=[28,47,78],TEAL=[18,86,88],ORANGE=[224,86,42],AMBER=[217,119,6],VIOLET=[124,58,237];
  doc.setFillColor(...NAVY); doc.rect(0,0,W,54,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(255,255,255);
  doc.text(`DUTY CHART OF ${reportShort()} ON ${dateDisplay(d)}`,W/2,28,{align:"center"});
  doc.setFont("helvetica","italic"); doc.setFontSize(10.5); doc.setTextColor(230,200,140);
  doc.text(`${stationLine()} · ${dowName(d)}`,W/2,44,{align:"center"});
  const head1=[{content:"Designation",rowSpan:2}], head2=[];
  groups.forEach(g=>{
    if(g.keys.length>1){ head1.push({content:g.group,colSpan:g.keys.length}); g.keys.forEach(k=>head2.push({content:(cols.find(x=>x.key===k).sub)||""})); }
    else{ const c=cols.find(x=>x.key===g.keys[0]); if(c.sub){ head1.push({content:g.group}); head2.push({content:c.sub}); } else head1.push({content:g.group,rowSpan:2}); }
  });
  head1.push({content:"Total",rowSpan:2});
  const fill={sanctioned:[234,241,255],existing:[234,250,241],attached:[245,237,251],vacancy:[253,236,235]};
  const txt={sanctioned:[29,75,143],existing:[31,122,76],attached:[106,58,158],vacancy:[165,52,31]};
  const merge={sanctioned:true,existing:false,attached:false,vacancy:true};
  const labels={sanctioned:"Sanctioned",existing:"Existing",attached:"Attached",vacancy:"Vacancy"};
  const body=Object.keys(labels).map(rk=>{
    let tot=0; const bg=fill[rk], tc=txt[rk];
    const cells=merge[rk]?groups.map(g=>{ let s=0; g.keys.forEach(k=>s+=(vals[rk][k]||0)); tot+=s; return {content:String(s),colSpan:g.keys.length,styles:{fillColor:bg,textColor:tc}}; })
      :cols.map(c=>{ const v=vals[rk][c.key]||0; tot+=v; return {content:String(v),styles:{fillColor:bg,textColor:tc}}; });
    return [{content:labels[rk],styles:{fillColor:tc,textColor:[255,255,255],fontStyle:"bold"}},...cells,{content:String(tot),styles:{fillColor:ORANGE,textColor:[255,255,255],fontStyle:"bold"}}];
  });
  doc.autoTable({startY:70,head:[head1,head2],body,headStyles:{fillColor:NAVY2,textColor:[255,255,255],fontStyle:"bold",halign:"center"},bodyStyles:{halign:"center",fontStyle:"bold"},styles:{fontSize:8.5,cellPadding:5,lineColor:[255,255,255],lineWidth:.75}});
  const band=(y,color,title)=>{ doc.setFillColor(...color); doc.roundedRect(30,y,W-60,20,5,5,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(255,255,255); doc.text(title,40,y+14); };
  const all=dutyRows;
  let y=doc.lastAutoTable.finalY+16; band(y,AMBER,"DUTY ASSIGNMENTS");
  doc.autoTable({startY:y+22,head:[["Sl No","Duty","Officer(s) Assigned"]],body:all.length?all.map((r,i)=>[i+1,r.label,officerNamesForRow(r.key,r.people,"\n")]):[["","No duties assigned for this date.",""]],
    headStyles:{fillColor:[252,227,188],textColor:[128,73,4],fontStyle:"bold"},bodyStyles:{fillColor:[253,241,222]},alternateRowStyles:{fillColor:[255,250,241]},
    styles:{fontSize:9,cellPadding:5,lineColor:[248,220,175],lineWidth:.5,overflow:"linebreak"},columnStyles:{0:{cellWidth:36,halign:"center"},1:{cellWidth:120,fontStyle:"bold",textColor:[160,90,6]}}});
  y=doc.lastAutoTable.finalY+16; band(y,VIOLET,"OFF DUTY / LEAVE / REST");
  doc.autoTable({startY:y+22,head:[["Sl No","Off Duty Type","Officer(s)"]],body:offRows.length?offRows.map((r,i)=>[i+1,r.label,officerNames(r.people)]):[["","None.",""]],
    headStyles:{fillColor:[226,211,250],textColor:[76,29,149],fontStyle:"bold"},bodyStyles:{fillColor:[243,236,253]},alternateRowStyles:{fillColor:[248,244,254]},
    styles:{fontSize:9,cellPadding:5,lineColor:[220,200,248],lineWidth:.5},columnStyles:{0:{cellWidth:36,halign:"center"},1:{cellWidth:120,fontStyle:"bold",textColor:VIOLET}}});
  let y4=doc.lastAutoTable.finalY+20;
  const wrapped=doc.splitTextToSize(msg,W-84);
  const boxH=30+wrapped.length*12;
  if(y4+boxH>doc.internal.pageSize.getHeight()-30){ doc.addPage(); y4=40; }
  doc.setFillColor(...TEAL); doc.roundedRect(30,y4,W-60,boxH,6,6,"F");
  doc.setTextColor(255,214,140); doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.text("CYBER TIP OF THE DAY",42,y4+18);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(255,255,255); doc.text(wrapped,42,y4+32);
  return deliverReport(doc.output("blob"),`Duty_Chart_${dateDash(d)}.pdf`,"Duty Charts");
}

/* ------------------------------------------------------------ parade exports */
/* Friday Parade statement — rank-wise, in the station's standard format:
   Particulars | Rank | Name | Count, On Parade block, Off Parade block
   (with duty / reason against each name), totals and grand total. */
const PARADE_RANK_GROUPS=[
  {label:"ACP",ranks:["ACP"]},
  {label:"IP",ranks:["IP"]},
  {label:"SI/Tele SI",ranks:["SI","SI Tele"]},
  {label:"ASI",ranks:["ASI"]},
  {label:"SCPO/Tele HC",ranks:["SCPO","HC Tele"]},
  {label:"CPO/Tele PC",ranks:["CPO","PC Tele","PC DVR","AR CPO"]}
];
function paradeGroupFor(rank){
  const b=baseRank(rank);
  return PARADE_RANK_GROUPS.find(g=>g.ranks.includes(b))||PARADE_RANK_GROUPS[PARADE_RANK_GROUPS.length-1];
}
function ddmm(d){ return pad(d.getDate())+"/"+pad(d.getMonth()+1); }
function paradeReasonText(p,st,fridayKey){
  if(st.customReason) return st.reason;
  const fri=dateFromKey(fridayKey), thu=addDays(fri,-1);
  const r=String(st.reason||"").trim();
  const note=((S.records[fridayKey]||{}).assignments||{})[p.id];
  const extra=note&&note.note?" ("+note.note+")":"";
  if(r==="Ongoing Night GD") return "Night Duty "+ddmm(thu);
  if(/night gd/i.test(r)) return "Night Duty "+ddmm(fri)+extra;
  if(isOffDuty(r)) return codeForOffLabel(r)+extra;
  if(!r||r==="Present") return "Off parade";
  return r+extra;
}
function paradeNameText(p,group,withReason,st,key){
  let n=p.name+(p.attached?" (Attd)":"");
  const b=baseRank(p.rank);
  if(group.ranks.length>1&&b!==group.ranks[0]) n+=" ("+displayRank(p.rank)+")";
  if(withReason) n+=" – "+paradeReasonText(p,st,key);
  return n;
}
function computeParadeStatement(key){
  const {on,off}=computeParadeList(key);
  const build=(list,withReason)=>PARADE_RANK_GROUPS.map(g=>({label:g.label,names:list.filter(x=>paradeGroupFor(x.p.rank)===g).map(x=>paradeNameText(x.p,g,withReason,x.st,key))}));
  return {on:build(on,false),off:build(off,true),onTotal:on.length,offTotal:off.length};
}
/** HTML table (used on screen, for printing and for Excel). */
function paradeStatementHtml(key,forExcel){
  const st=computeParadeStatement(key);
  const B=forExcel?' style="border:1px solid #000;padding:5px 8px;vertical-align:middle;"':"";
  const H=forExcel?' style="border:1px solid #000;padding:6px 8px;background:#132038;color:#fff;font-weight:bold;"':"";
  const T=(bg)=>forExcel?` style="border:1px solid #000;padding:6px 8px;font-weight:bold;text-align:center;background:${bg};"`:` class="ps-total"`;
  const block=(title,groups,total,bg)=>{
    let h="";
    groups.forEach((g,i)=>{
      const names=g.names.length?g.names.map(esc).join("<br>"):"";
      h+=`<tr>${i===0?`<td rowspan="${groups.length}"${B} class="ps-part"><b>${title}</b></td>`:""}<td${B} class="ps-rank"><b>${esc(g.label)}</b></td>`+
        (g.names.length?`<td${B} class="ps-names">${names}</td><td${B} class="ps-count"><b>${g.names.length}</b></td>`:`<td colspan="2"${B} class="ps-nil">—</td>`)+`</tr>`;
    });
    h+=`<tr><td colspan="3"${T(bg)}>TOTAL ${title.toUpperCase()}</td><td${T(bg)}>${total}</td></tr>`;
    return h;
  };
  let h=`<table${forExcel?' border="1" cellspacing="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:12px;text-align:center;"':' class="grid-table parade-statement"'}>`;
  h+=`<thead><tr><th${H} style="${forExcel?"":"width:16%"}">Particulars</th><th${H}>RANK</th><th${H}>Name</th><th${H}>Count</th></tr></thead><tbody>`;
  const LB=paradeLabels(key);
  h+=block(LB.on,st.on,st.onTotal,"#e5f4ea");
  h+=`<tr><td colspan="4"${forExcel?' style="border:none;height:8px;"':' class="ps-gap"'}></td></tr>`;
  h+=block(LB.off,st.off,st.offTotal,"#fbe9e5");
  h+=`<tr><td colspan="3"${T("#f6c9b8")}>GRAND TOTAL</td><td${T("#f6c9b8")}>${st.onTotal+st.offTotal}</td></tr>`;
  h+="</tbody></table>";
  return h;
}
function exportParadeExcel(key){
  const d=dateFromKey(key);
  let h=excelA4Head("Friday Parade");
  h+=`<table border="0" style="font-family:Calibri,Arial,sans-serif;"><tr><td colspan="4" style="text-align:center;font-size:16px;font-weight:bold;">${esc(paradeTitle(key).toUpperCase())} STATEMENT — ${dateDisplay(d)}</td></tr>`;
  h+=`<tr><td colspan="4" style="text-align:center;font-weight:bold;">${esc(stationLine())}</td></tr><tr><td colspan="4"></td></tr></table>`;
  h+=paradeStatementHtml(key,true);
  h+="</body></html>";
  return deliverReport(xlsBlob(h),`${fileSafe(paradeTitle(key)).replace(/\s+/g,"_")}_${key}.xls`,"Friday Parade");
}
function exportParadePdf(key){
  if(!needLibs("pdf")) return;
  const d=dateFromKey(key), st=computeParadeStatement(key);
  const doc=new window.jspdf.jsPDF({unit:"pt",format:"a4"}); const W=doc.internal.pageSize.getWidth();
  doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(0,0,0);
  doc.text(`${paradeTitle(key).toUpperCase()} STATEMENT — ${dateDisplay(d)}`,W/2,40,{align:"center"});
  doc.setFontSize(11); doc.text(stationLine(),W/2,57,{align:"center"});
  const body=[];
  const block=(title,groups,total,fill)=>{
    groups.forEach((g,i)=>{
      const row=[];
      if(i===0) row.push({content:title,rowSpan:groups.length,styles:{fontStyle:"bold",valign:"middle"}});
      row.push({content:g.label,styles:{fontStyle:"bold"}});
      if(g.names.length){ row.push({content:g.names.join("\n")}); row.push({content:String(g.names.length),styles:{fontStyle:"bold"}}); }
      else row.push({content:"—",colSpan:2,styles:{textColor:[150,150,150]}});
      body.push(row);
    });
    body.push([{content:"TOTAL "+title.toUpperCase(),colSpan:3,styles:{fontStyle:"bold",fillColor:fill}},{content:String(total),styles:{fontStyle:"bold",fillColor:fill}}]);
  };
  const LB=paradeLabels(key);
  block(LB.on,st.on,st.onTotal,[229,244,234]);
  body.push([{content:"",colSpan:4,styles:{minCellHeight:8,lineWidth:0}}]);
  block(LB.off,st.off,st.offTotal,[251,233,229]);
  body.push([{content:"GRAND TOTAL",colSpan:3,styles:{fontStyle:"bold",fillColor:[246,201,184]}},{content:String(st.onTotal+st.offTotal),styles:{fontStyle:"bold",fillColor:[246,201,184]}}]);
  doc.autoTable({startY:70,head:[["Particulars","RANK","Name","Count"]],body,theme:"grid",
    headStyles:{fillColor:[19,32,56],textColor:[255,255,255],fontStyle:"bold",halign:"center"},
    styles:{fontSize:10,cellPadding:5,halign:"center",valign:"middle",lineColor:[0,0,0],lineWidth:.6,textColor:[0,0,0]},
    columnStyles:{0:{cellWidth:80},1:{cellWidth:95},3:{cellWidth:55}}});
  return deliverReport(doc.output("blob"),`${fileSafe(paradeTitle(key)).replace(/\s+/g,"_")}_${key}.pdf`,"Friday Parade");
}

/* ------------------------------------------------------------ attendance exports */
const ATT_XLS_COLORS={"CL":["#dbeafe","#1e40af"],"D/OFF":["#ede9fe","#5b21b6"],"CML":["#fde68a","#78350f"],"ML":["#fecaca","#991b1b"],"HPL":["#fed7aa","#9a3412"],"EL":["#bbf7d0","#14532d"],"COFF":["#cffafe","#155e75"]};
function attLegendText(){
  const pc=presentCode();
  const parts=[`${pc} = Present / On duty`];
  allOffLabels().forEach(l=>parts.push(`${codeForOffLabel(l)} = ${l}`));
  parts.push("blank = no duty chart saved for that date");
  return parts.join(" · ");
}
function exportAttendanceExcel(sheet){
  const dates=datesBetween(sheet.from,sheet.to), cols=attendanceColumns(sheet), pc=presentCode();
  const total=3+dates.length+cols.length;
  let h=excelA4Head("Attendance",true);
  h+=`<table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11px;">`;
  h+=`<tr><td colspan="${total}" style="text-align:center;font-size:17px;font-weight:bold;padding:12px;background:#132038;color:#fff;">ATTENDANCE REGISTER — ${dateDisplay(dateFromKey(sheet.from))} TO ${dateDisplay(dateFromKey(sheet.to))}</td></tr>`;
  h+=`<tr><td colspan="${total}" style="text-align:center;font-style:italic;background:#c9962f;font-weight:bold;">${esc(stationLine())}</td></tr>`;
  let hr=`<tr style="background:#dfe6f0;font-weight:bold;color:#132038;text-align:center;"><td>Sl No</td><td>Rank</td><td style="text-align:left;">Name</td>`;
  dates.forEach(k=>{ const d=dateFromKey(k); hr+=`<td style="${d.getDay()===0?"background:#e4dcf7;":""}">${pad(d.getDate())}<br>${d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,2)}</td>`; });
  cols.forEach(c=>hr+=`<td style="background:#132038;color:#fff;">${esc(c)}</td>`);
  h+=hr+"</tr>";
  sheet.personIds.forEach((pid,i)=>{
    const p=personById(pid); if(!p) return;
    const t=attendanceTotals(sheet,pid);
    let r=`<tr style="text-align:center;"><td>${i+1}</td><td>${esc(displayRank(p.rank))}</td><td style="text-align:left;font-weight:bold;">${esc(p.name)}${p.attached?" (Attd)":""}</td>`;
    dates.forEach(k=>{ const c=(sheet.cells[pid]||{})[k]||""; const col=c===pc?["#ffffff","#1f7a4c"]:(ATT_XLS_COLORS[c]||(c?["#eeeeee","#333333"]:["#ffffff","#999999"])); r+=`<td style="background:${col[0]};color:${col[1]};font-weight:bold;">${esc(c)}</td>`; });
    cols.forEach(c=>r+=`<td style="background:#f2f5fa;font-weight:bold;">${t[c]||0}</td>`);
    h+=r+"</tr>";
  });
  h+=`<tr><td colspan="${total}" style="font-size:10px;text-align:left;">${esc(attLegendText())}</td></tr>`;
  h+=`<tr><td colspan="${total}" style="font-size:10px;text-align:left;color:#666;">Generated ${stampNow()} by ${esc(USER().name||USER().email)} from the saved daily duty charts.</td></tr>`;
  h+="</table></body></html>";
  return deliverReport(xlsBlob(h),`Attendance_${sheet.from}_to_${sheet.to}.xls`,"Attendance");
}
function exportAttendancePdf(sheet){
  if(!needLibs("pdf")) return;
  const dates=datesBetween(sheet.from,sheet.to), cols=attendanceColumns(sheet), pc=presentCode();
  const big=dates.length>31;
  const doc=new window.jspdf.jsPDF({unit:"pt",format:big?"a3":"a4",orientation:"landscape"});
  const W=doc.internal.pageSize.getWidth();
  doc.setFillColor(19,32,56); doc.rect(0,0,W,48,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(255,255,255);
  doc.text(`ATTENDANCE REGISTER — ${dateDisplay(dateFromKey(sheet.from))} TO ${dateDisplay(dateFromKey(sheet.to))}`,W/2,24,{align:"center"});
  doc.setFont("helvetica","italic"); doc.setFontSize(9.5); doc.setTextColor(230,200,140); doc.text(stationLine(),W/2,39,{align:"center"});
  const head=[["Sl","Rank & Name",...dates.map(k=>{ const d=dateFromKey(k); return pad(d.getDate())+"\n"+d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,2); }),...cols]];
  const body=[];
  sheet.personIds.forEach((pid,i)=>{
    const p=personById(pid); if(!p) return;
    const t=attendanceTotals(sheet,pid);
    body.push([i+1,`${displayRank(p.rank)} ${p.name}${p.attached?" (Attd)":""}`,...dates.map(k=>(sheet.cells[pid]||{})[k]||""),...cols.map(c=>String(t[c]||0))]);
  });
  const nD=dates.length, first=2, totStart=2+nD;
  const nameW=big?110:88, slW=16, totW=big?24:19;
  const dayW=Math.max(12,(W-36-slW-nameW-totW*cols.length)/nD);
  const colStyles={0:{cellWidth:slW},1:{cellWidth:nameW,halign:"left",fontStyle:"bold"}};
  for(let i=0;i<nD;i++) colStyles[2+i]={cellWidth:dayW};
  cols.forEach((c,i)=>colStyles[2+nD+i]={cellWidth:totW});
  const pdfCol={"CL":[[219,234,254],[30,64,175]],"D/OFF":[[237,233,254],[91,33,182]],"CML":[[253,230,138],[120,53,15]],"ML":[[254,202,202],[153,27,27]],"HPL":[[254,215,170],[154,52,18]],"EL":[[187,247,208],[20,83,45]],"COFF":[[207,250,254],[21,94,117]]};
  doc.autoTable({startY:58,head,body,theme:"grid",
    styles:{fontSize:big?6.5:6.8,cellPadding:{top:3,bottom:3,left:.5,right:.5},halign:"center",valign:"middle",lineColor:[210,216,226],lineWidth:.4},
    headStyles:{fillColor:[28,47,78],textColor:[255,255,255],fontStyle:"bold",fontSize:6.5},
    columnStyles:colStyles,
    margin:{left:18,right:18},
    didParseCell:(data)=>{
      if(data.section==="head"&&data.column.index>=totStart){ data.cell.styles.fillColor=[19,32,56]; if(String(data.cell.raw).length>=4) data.cell.styles.fontSize=5; }
      if(data.section==="head"&&data.column.index>=first&&data.column.index<totStart){ const d=dateFromKey(dates[data.column.index-first]); if(d.getDay()===0) data.cell.styles.fillColor=[58,47,92]; }
      if(data.section==="body"&&data.column.index>=first&&data.column.index<totStart){
        const c=String(data.cell.raw||"");
        if(c.length>=4) data.cell.styles.fontSize=5.4;
        if(c===pc){ data.cell.styles.textColor=[31,122,76]; data.cell.styles.fontStyle="bold"; }
        else if(pdfCol[c]){ data.cell.styles.fillColor=pdfCol[c][0]; data.cell.styles.textColor=pdfCol[c][1]; data.cell.styles.fontStyle="bold"; }
        else if(c){ data.cell.styles.fillColor=[235,237,241]; data.cell.styles.fontStyle="bold"; }
      }
      if(data.section==="body"&&data.column.index>=totStart){ data.cell.styles.fillColor=[242,245,250]; data.cell.styles.fontStyle="bold"; }
    }
  });
  let y=doc.lastAutoTable.finalY+14;
  if(y>doc.internal.pageSize.getHeight()-40){ doc.addPage(); y=40; }
  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(60,60,60);
  doc.text(doc.splitTextToSize(attLegendText(),W-36),18,y);
  doc.setFontSize(7); doc.setTextColor(120,120,120);
  doc.text(`Generated ${stampNow()} by ${USER().name||USER().email} from the saved daily duty charts.`,18,doc.internal.pageSize.getHeight()-14);
  return deliverReport(doc.output("blob"),`Attendance_${sheet.from}_to_${sheet.to}.pdf`,"Attendance");
}

/* ------------------------------------------------------------ logs export */
function exportLogsXlsx(type,rows){
  if(!needLibs("xlsx")) return;
  const ws=window.XLSX.utils.json_to_sheet(rows);
  const wb=window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb,ws,type.charAt(0).toUpperCase()+type.slice(1)+" Log");
  const out=window.XLSX.write(wb,{bookType:"xlsx",type:"array"});
  const blob=new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  return deliverReport(blob,`${type}_log_${dateKey(new Date())}.xlsx`,"Logs");
}
