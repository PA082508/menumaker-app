// src/pages/reports/KitchenPlanningReport.tsx
// Kitchen Planning Report — 3 tabs: Claimed Meals | Actual Dishes | Milk Orders

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { format, addDays, startOfWeek } from "date-fns";

const CENTER_ID   = "881ef4ce-1a27-4d3b-aa60-59d2a307bf2b";
const SK          = ["b","as","l","ps","su","es"];
const DK          = ["mon","tue","wed","thu","fri"];
const SL: Record<string,string> = {b:"Breakfast",as:"AM Snack",l:"Lunch",ps:"PM Snack",su:"Supper",es:"Eve Snack"};
const DL: Record<string,string> = {mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri"};
const MEAL_S      = ["b","l","su"];
const SNACK_S     = ["as","ps","es"];
const PRI: Record<string,number> = {b:1,as:2,l:3,ps:5,su:4,es:6};
const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const OZ_PER_GAL  = 128;
const SLOT_MAP: Record<string,string> = {breakfast:"b",am_snack:"as",lunch:"l",pm_snack:"ps",supper:"su",evening_snack:"es"};

type Tab = "claimed"|"dishes"|"milk";

function getExcl(dv:Record<string,number>):string|null {
  const cm=MEAL_S.filter(s=>dv[s]>0);
  const cs=SNACK_S.filter(s=>dv[s]>0);
  if(cm.length+cs.length<=3) return null;
  if(cm.length>2) return cm.sort((a,b)=>PRI[a]-PRI[b])[0];
  if(cs.length>1) return cs.sort((a,b)=>PRI[a]-PRI[b])[0];
  return null;
}

function ageGroupFrom(birthday:string|null):string {
  if(!birthday) return "3_5";
  const m=Math.floor((Date.now()-new Date(birthday).getTime())/(1000*60*60*24*30.44));
  if(m<6)  return "infant_0_5m";
  if(m<12) return "infant_6_11m";
  if(m<24) return "1y";
  if(m<36) return "2y";
  if(m<72) return "3_5";
  return "6_12";
}

const isInfant = (ag:string) => ag.startsWith("infant");
const monOf    = (d:Date)    => startOfWeek(d,{weekStartsOn:1});
const ozToGal  = (oz:number) => (oz/OZ_PER_GAL).toFixed(2);

interface Cls { id:string; name:string; sort_order:number; }
interface Kid { id:string; child_name:string; classroom_id:string; milk_kind:string; age_group_food:string; birthday:string|null; rate_oz:number; }
interface MR  { age_group:string; milk_type:string; rate_oz:number; }
interface Cfg { active_slots:string[]; milk_slots:string[]; }

export default function KitchenPlanningReport() {
  const now = new Date();
  const [tab,       setTab]       = useState<Tab>("claimed");
  const [weekStart, setWeekStart] = useState<Date>(()=>monOf(now));
  const [year,      setYear]      = useState(now.getFullYear());
  const [month,     setMonth]     = useState(now.getMonth()+1);
  const [viewMode,  setViewMode]  = useState<"week"|"month">("week");
  const [classes,   setClasses]   = useState<Cls[]>([]);
  const [roster,    setRoster]    = useState<Kid[]>([]);
  const [milkRates, setMilkRates] = useState<MR[]>([]);
  const [cfg,       setCfg]       = useState<Cfg|null>(null);
  const [records,   setRecords]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(()=>{
    Promise.all([
      supabase.schema("menumaker").from("classrooms").select("id,name,sort_order").eq("is_active",true).eq("center_id",CENTER_ID).order("sort_order"),
      supabase.schema("menumaker").from("roster").select("id,child_name,classroom_id,milk_kind,age_group_food,birthday,rate_oz").eq("is_active",true),
      supabase.schema("menumaker").from("milk_rates").select("age_group,milk_type,rate_oz").order("sort_order"),
      supabase.schema("menumaker").from("meal_count_settings").select("active_slots,milk_slots").eq("center_id",CENTER_ID).single(),
    ]).then(([{data:c},{data:r},{data:mr},{data:s}])=>{
      if(c)  setClasses(c as Cls[]);
      if(r)  setRoster(r as Kid[]);
      if(mr) setMilkRates(mr as MR[]);
      if(s)  setCfg(s as Cfg);
    });
  },[]);

  const loadRecords = useCallback(async()=>{
    setLoading(true);
    const mondays: string[] = [];
    if(viewMode==="week") {
      mondays.push(format(weekStart,"yyyy-MM-dd"));
    } else {
      let d = monOf(new Date(year,month-1,1));
      const end = new Date(year,month,0);
      while(d<=end){ mondays.push(format(d,"yyyy-MM-dd")); d=addDays(d,7); }
    }
    const {data:recs} = await supabase.schema("menumaker").from("meal_week_records")
      .select("*").eq("center_id",CENTER_ID).in("monday_date",mondays);
    setRecords((recs??[]) as any[]);
    setLoading(false);
  },[weekStart,viewMode,year,month]);

  useEffect(()=>{ loadRecords(); },[loadRecords]);

  const activeSlots: string[] = cfg?.active_slots?.map(s=>SLOT_MAP[s]||s) || ["b","as","l","su"];
  const milkSlots:   string[] = cfg?.milk_slots?.map(s=>SLOT_MAP[s]||s)   || ["b","l","su"];
  const nonStaff = classes.filter(c=>!c.name.toLowerCase().includes("staff"));

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function dateOf(rec:any, dk:string):string {
    return format(addDays(new Date(rec.monday_date+"T12:00:00"), DK.indexOf(dk)),"yyyy-MM-dd");
  }
  function inScope(date:string):boolean {
    if(viewMode==="week") return true;
    const d=new Date(date+"T12:00:00");
    return d.getMonth()+1===month && d.getFullYear()===year;
  }

  // ─── Claimed Meals ─────────────────────────────────────────────────────────
  // byDk[cls][dk][sk] = reimbursable count (for week view)
  // bySlot[cls][sk]   = monthly total (for month view)
  function computeClaimed() {
    const byDk:   Record<string,Record<string,Record<string,number>>> = {};
    const bySlot: Record<string,Record<string,number>>                = {};
    const adaDays:Record<string,Record<string,Set<string>>>           = {};

    for(const cls of nonStaff) {
      byDk[cls.id]    = {};
      bySlot[cls.id]  = {};
      adaDays[cls.id] = {};
      for(const dk of DK) { byDk[cls.id][dk]={}; for(const sk of activeSlots) byDk[cls.id][dk][sk]=0; }
      for(const sk of activeSlots) bySlot[cls.id][sk]=0;
    }

    for(const rec of records) {
      const cls=nonStaff.find(c=>c.id===rec.classroom_id);
      if(!cls) continue;
      for(const dk of DK) {
        const date=dateOf(rec,dk);
        if(!inScope(date)) continue;
        const dv:Record<string,number>={};
        for(const sk of SK) dv[sk]=rec[`${dk}_${sk}`]??0;
        const excl=getExcl(dv);
        let served=false;
        for(const sk of activeSlots) {
          if(dv[sk]&&sk!==excl) {
            byDk[cls.id][dk][sk]=(byDk[cls.id][dk][sk]||0)+1;
            bySlot[cls.id][sk]=(bySlot[cls.id][sk]||0)+1;
            served=true;
          }
        }
        if(served) {
          if(!adaDays[cls.id][date]) adaDays[cls.id][date]=new Set();
          adaDays[cls.id][date].add(rec.child_name);
        }
      }
    }

    const ada:Record<string,number>={};
    for(const [cid,dateSets] of Object.entries(adaDays)) {
      const dates=Object.keys(dateSets);
      if(!dates.length){ ada[cid]=0; continue; }
      ada[cid]=Math.ceil(Object.values(dateSets).reduce((s,v)=>s+v.size,0)/dates.length);
    }
    return {byDk,bySlot,ada};
  }

  // ─── Actual Dishes ─────────────────────────────────────────────────────────
  // totals[dk][sk] = across all classes (no exclusions)
  // byCls[cls][dk][sk] = per classroom
  function computeActual() {
    const totals: Record<string,Record<string,number>> = {};
    const byCls:  Record<string,Record<string,Record<string,number>>> = {};
    for(const dk of DK){ totals[dk]={}; for(const sk of SK) totals[dk][sk]=0; }
    for(const cls of classes){
      byCls[cls.id]={};
      for(const dk of DK){ byCls[cls.id][dk]={}; for(const sk of SK) byCls[cls.id][dk][sk]=0; }
    }
    for(const rec of records) {
      for(const dk of DK) {
        if(!inScope(dateOf(rec,dk))) continue;
        for(const sk of SK) {
          if(rec[`${dk}_${sk}`]===1) {
            totals[dk][sk]=(totals[dk][sk]||0)+1;
            if(byCls[rec.classroom_id]) byCls[rec.classroom_id][dk][sk]=(byCls[rec.classroom_id][dk][sk]||0)+1;
          }
        }
      }
    }
    return {totals,byCls};
  }

  // ─── Milk Orders ───────────────────────────────────────────────────────────
  // result[sk][dk] = {redOz, pct1Oz}
  function computeMilk() {
    const kidInfo: Record<string,{ag:string;mt:string;oz:number}> = {};
    for(const kid of roster) {
      const ag = kid.birthday ? ageGroupFrom(kid.birthday) : kid.age_group_food;
      const mr = milkRates.find(r=>r.age_group===ag);
      kidInfo[`${kid.classroom_id}_${kid.child_name}`] = {
        ag, mt:mr?.milk_type||kid.milk_kind, oz:mr?.rate_oz||kid.rate_oz
      };
    }
    const result: Record<string,Record<string,{redOz:number;pct1Oz:number}>> = {};
    for(const sk of milkSlots) { result[sk]={}; for(const dk of DK) result[sk][dk]={redOz:0,pct1Oz:0}; }
    for(const rec of records) {
      for(const dk of DK) {
        if(!inScope(dateOf(rec,dk))) continue;
        for(const sk of milkSlots) {
          if(rec[`${dk}_${sk}`]!==1) continue;
          const info=kidInfo[`${rec.classroom_id}_${rec.child_name}`];
          if(!info||isInfant(info.ag)||info.mt==="none"||info.mt==="formula") continue;
          if(info.mt==="red")      result[sk][dk].redOz+=info.oz;
          else if(info.mt==="1pct") result[sk][dk].pct1Oz+=info.oz;
        }
      }
    }
    return result;
  }

  const claimed = computeClaimed();
  const actual  = computeActual();
  const milk    = computeMilk();

  const weekOptions = Array.from({length:16},(_,i)=>{
    const m=addDays(monOf(now),(i-8)*7);
    return {val:format(m,"yyyy-MM-dd"),label:`${format(m,"MMM d")} – ${format(addDays(m,4),"MMM d")}`};
  });

  return (
    <div style={{padding:"1.5rem",fontFamily:"Calibri,Arial,sans-serif",maxWidth:1100}}>

      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <h2 style={{margin:0,fontSize:"1.1rem",fontWeight:700,color:"#0f4c35"}}>👨‍🍳 Kitchen Planning Report</h2>

        <div style={{display:"flex",gap:0,borderRadius:7,overflow:"hidden",border:"1.5px solid #c0d8c0"}}>
          {(["week","month"] as const).map(vm=>(
            <button key={vm} onClick={()=>setViewMode(vm)} style={{
              padding:".3rem .75rem",border:"none",fontFamily:"inherit",fontSize:".82rem",fontWeight:600,
              background:viewMode===vm?"#0f4c35":"#fff",color:viewMode===vm?"#fff":"#555",cursor:"pointer"
            }}>{vm==="week"?"📅 Week":"📆 Month"}</button>
          ))}
        </div>

        {viewMode==="week" ? (
          <select value={format(weekStart,"yyyy-MM-dd")}
            onChange={e=>setWeekStart(new Date(e.target.value+"T12:00:00"))}
            style={{padding:".35rem .6rem",borderRadius:7,border:"1.5px solid #c0d8c0",fontSize:".85rem",fontFamily:"inherit"}}>
            {weekOptions.map(w=><option key={w.val} value={w.val}>{w.label}</option>)}
          </select>
        ) : (<>
          <select value={month} onChange={e=>setMonth(+e.target.value)}
            style={{padding:".35rem .6rem",borderRadius:7,border:"1.5px solid #c0d8c0",fontSize:".85rem",fontFamily:"inherit"}}>
            {FULL_MONTHS.map((mn,i)=><option key={i} value={i+1}>{mn}</option>)}
          </select>
          <select value={year} onChange={e=>setYear(+e.target.value)}
            style={{padding:".35rem .6rem",borderRadius:7,border:"1.5px solid #c0d8c0",fontSize:".85rem",fontFamily:"inherit"}}>
            {[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </>)}

        {loading && <span style={{fontSize:".82rem",color:"#888"}}>Loading…</span>}
        <button onClick={()=>window.print()}
          style={{marginLeft:"auto",padding:".4rem .9rem",borderRadius:8,border:"none",
            background:"#0f4c35",color:"#fff",fontWeight:600,fontSize:".82rem",cursor:"pointer",fontFamily:"inherit"}}>
          🖨️ Print
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:"flex",gap:0,marginBottom:"1rem",borderBottom:"2px solid #0f4c35"}}>
        {([["claimed","📋 Claimed Meals"],["dishes","🍽️ Actual Dishes"],["milk","🥛 Milk Orders"]] as [Tab,string][]).map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:".5rem 1.25rem",border:"none",fontFamily:"inherit",fontSize:".88rem",fontWeight:600,
            cursor:"pointer",borderRadius:"8px 8px 0 0",
            background:tab===t?"#0f4c35":"#f4f7f4",color:tab===t?"#fff":"#555"
          }}>{l}</button>
        ))}
      </div>

      {/* ══ TAB: CLAIMED MEALS ══ */}
      {tab==="claimed" && (
        <div style={{overflowX:"auto"}}>
          {viewMode==="week" ? (
            <table style={TABLE}>
              <thead>
                <tr style={{background:"#0f4c35",color:"#fff"}}>
                  <th style={{...TH,textAlign:"left",minWidth:140}} rowSpan={2}>Classroom</th>
                  <th style={{...TH,minWidth:50}} rowSpan={2}>ADA</th>
                  {DK.map(dk=>(
                    <th key={dk} colSpan={activeSlots.length}
                      style={{...TH,background:"#1a6645"}}>
                      {DL[dk]} · {format(addDays(weekStart,DK.indexOf(dk)),"M/d")}
                    </th>
                  ))}
                  <th style={{...TH,background:"#0a3320",minWidth:50}} rowSpan={2}>Total</th>
                </tr>
                <tr style={{background:"#2a7a55",color:"#7ee8b0"}}>
                  {DK.flatMap(dk=>activeSlots.map(sk=>(
                    <th key={`${dk}_${sk}`} style={{...TH,minWidth:36,padding:"3px 2px",fontSize:".68rem"}}>
                      {SL[sk]?.slice(0,3)||sk}
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {nonStaff.map((cls,i)=>{
                  let rowTotal=0;
                  return (
                    <tr key={cls.id} style={{background:i%2===0?"#fff":"#f9fcf9"}}>
                      <td style={{...TD,textAlign:"left",paddingLeft:10,fontWeight:600}}>{cls.name}</td>
                      <td style={{...TD,textAlign:"center",fontWeight:700,color:"#1a5276"}}>
                        {claimed.ada[cls.id]||"—"}
                      </td>
                      {DK.flatMap(dk=>activeSlots.map(sk=>{
                        const v=claimed.byDk[cls.id]?.[dk]?.[sk]||0;
                        rowTotal+=v;
                        return <td key={`${dk}_${sk}`} style={{...TD,textAlign:"center"}}>{v||""}</td>;
                      }))}
                      <td style={{...TD,textAlign:"center",fontWeight:700}}>{rowTotal||""}</td>
                    </tr>
                  );
                })}
                <tr style={{background:"#e8f4f8",fontWeight:700,borderTop:"2px solid #0f4c35"}}>
                  <td style={{...TD,textAlign:"left",paddingLeft:10}}>TOTAL</td>
                  <td style={{...TD,textAlign:"center",color:"#1a5276"}}>
                    {nonStaff.reduce((s,c)=>s+(claimed.ada[c.id]||0),0)||"—"}
                  </td>
                  {DK.flatMap(dk=>activeSlots.map(sk=>{
                    const t=nonStaff.reduce((s,c)=>s+(claimed.byDk[c.id]?.[dk]?.[sk]||0),0);
                    return <td key={`t_${dk}_${sk}`} style={{...TD,textAlign:"center",color:"#0f4c35"}}>{t||""}</td>;
                  }))}
                  <td style={{...TD,textAlign:"center"}}>
                    {nonStaff.reduce((s,c)=>s+DK.reduce((ds,dk)=>ds+activeSlots.reduce((ss,sk)=>ss+(claimed.byDk[c.id]?.[dk]?.[sk]||0),0),0),0)||""}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            // Month view: classroom × slot totals
            <table style={TABLE}>
              <thead>
                <tr style={{background:"#0f4c35",color:"#fff"}}>
                  <th style={{...TH,textAlign:"left",minWidth:140}}>Classroom</th>
                  <th style={TH}>ADA</th>
                  {activeSlots.map(sk=><th key={sk} style={TH}>{SL[sk]}</th>)}
                  <th style={{...TH,background:"#0a3320"}}>Monthly Total</th>
                </tr>
              </thead>
              <tbody>
                {nonStaff.map((cls,i)=>{
                  const rowTotal=activeSlots.reduce((s,sk)=>s+(claimed.bySlot[cls.id]?.[sk]||0),0);
                  return (
                    <tr key={cls.id} style={{background:i%2===0?"#fff":"#f9fcf9"}}>
                      <td style={{...TD,textAlign:"left",paddingLeft:10,fontWeight:600}}>{cls.name}</td>
                      <td style={{...TD,textAlign:"center",fontWeight:700,color:"#1a5276"}}>
                        {claimed.ada[cls.id]||"—"}
                      </td>
                      {activeSlots.map(sk=>(
                        <td key={sk} style={{...TD,textAlign:"center"}}>{claimed.bySlot[cls.id]?.[sk]||""}</td>
                      ))}
                      <td style={{...TD,textAlign:"center",fontWeight:700}}>{rowTotal||""}</td>
                    </tr>
                  );
                })}
                <tr style={{background:"#e8f4f8",fontWeight:700,borderTop:"2px solid #0f4c35"}}>
                  <td style={{...TD,textAlign:"left",paddingLeft:10}}>TOTAL</td>
                  <td style={{...TD,textAlign:"center",color:"#1a5276"}}>
                    {nonStaff.reduce((s,c)=>s+(claimed.ada[c.id]||0),0)||"—"}
                  </td>
                  {activeSlots.map(sk=>{
                    const t=nonStaff.reduce((s,c)=>s+(claimed.bySlot[c.id]?.[sk]||0),0);
                    return <td key={sk} style={{...TD,textAlign:"center",color:"#0f4c35"}}>{t||""}</td>;
                  })}
                  <td style={{...TD,textAlign:"center"}}>
                    {nonStaff.reduce((s,c)=>s+activeSlots.reduce((ss,sk)=>ss+(claimed.bySlot[c.id]?.[sk]||0),0),0)||""}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Slot summary cards */}
          <div style={{marginTop:"1.25rem",padding:"1rem",background:"#fff",border:"1px solid #c0d8c0",borderRadius:8}}>
            <div style={{fontWeight:700,color:"#0f4c35",fontSize:".88rem",marginBottom:".65rem"}}>
              {viewMode==="month"?`${FULL_MONTHS[month-1]} ${year} — `:""}Claimed Slot Totals
            </div>
            <div style={{display:"flex",gap:".6rem",flexWrap:"wrap"}}>
              {activeSlots.map(sk=>{
                const total = viewMode==="week"
                  ? nonStaff.reduce((s,c)=>s+DK.reduce((ds,dk)=>ds+(claimed.byDk[c.id]?.[dk]?.[sk]||0),0),0)
                  : nonStaff.reduce((s,c)=>s+(claimed.bySlot[c.id]?.[sk]||0),0);
                return (
                  <div key={sk} style={{background:"#e8f4e8",borderRadius:8,padding:".5rem 1rem",textAlign:"center",minWidth:95}}>
                    <div style={{fontSize:".68rem",color:"#555",marginBottom:2}}>{SL[sk]}</div>
                    <div style={{fontSize:"1.5rem",fontWeight:800,color:"#0f4c35"}}>{total||0}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: ACTUAL DISHES ══ */}
      {tab==="dishes" && (
        <div style={{overflowX:"auto"}}>
          <div style={{background:"#fff3cd",border:"1px solid #ffc107",borderRadius:6,
            padding:".5rem .75rem",marginBottom:"1rem",fontSize:".8rem",color:"#856404"}}>
            🍽️ <b>For the cook:</b> All portions served — no CACFP exclusions, includes Staff classroom.
          </div>

          {/* Quick summary cards */}
          <div style={{display:"flex",gap:".5rem",flexWrap:"wrap",marginBottom:"1.25rem"}}>
            {SK.map(sk=>{
              const t=DK.reduce((s,dk)=>s+(actual.totals[dk]?.[sk]||0),0);
              return t>0 ? (
                <div key={sk} style={{background:"#fff",border:"1.5px solid #e0ebe0",borderRadius:8,
                  padding:".5rem .9rem",textAlign:"center",minWidth:95}}>
                  <div style={{fontSize:".68rem",color:"#555",marginBottom:2}}>{SL[sk]}</div>
                  <div style={{fontSize:"1.5rem",fontWeight:800,color:"#0a3320"}}>{t}</div>
                  <div style={{fontSize:".65rem",color:"#aaa"}}>{viewMode==="week"?"this week":"this month"}</div>
                </div>
              ) : null;
            })}
          </div>

          {/* Slot × Day breakdown */}
          <table style={TABLE}>
            <thead>
              <tr style={{background:"#0f4c35",color:"#fff"}}>
                <th style={{...TH,textAlign:"left",minWidth:110}}>Slot</th>
                {DK.map(dk=>(
                  <th key={dk} style={TH}>
                    {DL[dk]}{viewMode==="week"?` ${format(addDays(weekStart,DK.indexOf(dk)),"M/d")}`:""}
                  </th>
                ))}
                <th style={{...TH,background:"#0a3320"}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {SK.filter(sk=>DK.some(dk=>(actual.totals[dk]?.[sk]||0)>0)).map((sk,i)=>{
                const rowTotal=DK.reduce((s,dk)=>s+(actual.totals[dk]?.[sk]||0),0);
                return (
                  <tr key={sk} style={{background:i%2===0?"#fff":"#f9fcf9"}}>
                    <td style={{...TD,textAlign:"left",paddingLeft:10,fontWeight:600}}>{SL[sk]}</td>
                    {DK.map(dk=>(
                      <td key={dk} style={{...TD,textAlign:"center"}}>{actual.totals[dk]?.[sk]||""}</td>
                    ))}
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Per-classroom detail */}
          <div style={{marginTop:"1.25rem",fontWeight:700,color:"#0f4c35",fontSize:".88rem",marginBottom:".5rem"}}>
            By Classroom (all slots)
          </div>
          <table style={{...TABLE,fontSize:".74rem"}}>
            <thead>
              <tr style={{background:"#1a6645",color:"#fff"}}>
                <th style={{...TH,textAlign:"left",minWidth:130}}>Classroom</th>
                {DK.flatMap(dk=>SK.map(sk=>(
                  <th key={`${dk}_${sk}`} style={{...TH,minWidth:24,padding:"3px 2px",fontSize:".64rem"}}>
                    {DL[dk].slice(0,1)}/{(SL[sk]||sk).slice(0,2)}
                  </th>
                )))}
                <th style={TH}>Tot</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls,i)=>{
                const isStaff=cls.name.toLowerCase().includes("staff");
                let rowTotal=0;
                return (
                  <tr key={cls.id} style={{background:i%2===0?"#fff":"#f9fcf9",opacity:isStaff?0.65:1}}>
                    <td style={{...TD,textAlign:"left",paddingLeft:10,fontWeight:600}}>
                      {cls.name}{isStaff&&<span style={{fontSize:".64rem",color:"#888",marginLeft:4}}>(staff)</span>}
                    </td>
                    {DK.flatMap(dk=>SK.map(sk=>{
                      const v=actual.byCls[cls.id]?.[dk]?.[sk]||0;
                      rowTotal+=v;
                      return <td key={`${dk}_${sk}`} style={{...TD,textAlign:"center",padding:"3px 2px"}}>{v||""}</td>;
                    }))}
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{rowTotal||""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ TAB: MILK ORDERS ══ */}
      {tab==="milk" && (
        <div>
          <div style={{background:"#e8f4f0",border:"1px solid #a0c8b8",borderRadius:6,
            padding:".5rem .75rem",marginBottom:"1rem",fontSize:".8rem",color:"#0f4c35"}}>
            🥛 <b>Milk to pour per slot per day.</b> Calculated from check-ins × oz per age group. Infants excluded. 1 gallon = 128 oz.
          </div>

          {/* Summary totals */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1rem",marginBottom:"1.5rem"}}>
            {(["red","1pct","all"] as const).map(type=>{
              const totalOz=milkSlots.reduce((s,sk)=>s+DK.reduce((ds,dk)=>{
                const v=milk[sk]?.[dk];
                if(!v) return ds;
                return ds+(type==="red"?v.redOz:type==="1pct"?v.pct1Oz:v.redOz+v.pct1Oz);
              },0),0);
              return (
                <div key={type} style={{background:"#fff",border:"1.5px solid #e0ebe0",borderRadius:12,padding:"1rem",textAlign:"center"}}>
                  <div style={{fontSize:".78rem",color:"#666",marginBottom:4}}>
                    {type==="red"?"🥛 Whole (Red) Milk":type==="1pct"?"🥛 1% Milk":"📦 Total Milk"}
                  </div>
                  <div style={{fontSize:"1.75rem",fontWeight:800,color:"#0f4c35"}}>{Math.ceil(totalOz)||0}</div>
                  <div style={{fontSize:".72rem",color:"#888"}}>oz</div>
                  <div style={{fontSize:".9rem",fontWeight:700,color:"#1a6645",marginTop:4}}>
                    {ozToGal(totalOz)} gal
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-slot per-day table */}
          <table style={TABLE}>
            <thead>
              <tr style={{background:"#0f4c35",color:"#fff"}}>
                <th style={{...TH,textAlign:"left",minWidth:120}}>Slot</th>
                <th style={{...TH,minWidth:65}}>Type</th>
                {DK.map(dk=>(
                  <th key={dk} style={TH}>
                    {DL[dk]}{viewMode==="week"?` ${format(addDays(weekStart,DK.indexOf(dk)),"M/d")}`:""}
                  </th>
                ))}
                <th style={{...TH,background:"#0a3320"}}>Total oz</th>
                <th style={{...TH,background:"#0a3320"}}>Gallons</th>
              </tr>
            </thead>
            <tbody>
              {milkSlots.flatMap((sk,si)=>{
                const bg=si%2===0?"#fff":"#f9fcf9";
                const redTotal  = DK.reduce((s,dk)=>s+(milk[sk]?.[dk]?.redOz||0),0);
                const pct1Total = DK.reduce((s,dk)=>s+(milk[sk]?.[dk]?.pct1Oz||0),0);
                return [
                  <tr key={`${sk}-red`} style={{background:bg}}>
                    <td style={{...TD,textAlign:"left",paddingLeft:10,fontWeight:700}} rowSpan={2}>{SL[sk]}</td>
                    <td style={{...TD,paddingLeft:8,color:"#b91c1c",fontWeight:600}}>● Whole</td>
                    {DK.map(dk=>{
                      const oz=milk[sk]?.[dk]?.redOz||0;
                      return <td key={dk} style={{...TD,textAlign:"center"}}>{oz?Math.ceil(oz):""}</td>;
                    })}
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{redTotal?Math.ceil(redTotal):""}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:"#0f4c35"}}>{ozToGal(redTotal)}</td>
                  </tr>,
                  <tr key={`${sk}-1pct`} style={{background:bg}}>
                    <td style={{...TD,paddingLeft:8,color:"#1a5276",fontWeight:600}}>● 1%</td>
                    {DK.map(dk=>{
                      const oz=milk[sk]?.[dk]?.pct1Oz||0;
                      return <td key={dk} style={{...TD,textAlign:"center"}}>{oz?Math.ceil(oz):""}</td>;
                    })}
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{pct1Total?Math.ceil(pct1Total):""}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:"#0f4c35"}}>{ozToGal(pct1Total)}</td>
                  </tr>,
                ];
              })}
              {/* Grand total row */}
              <tr style={{background:"#e8f4f8",fontWeight:700,borderTop:"2px solid #0f4c35"}}>
                <td style={{...TD,textAlign:"left",paddingLeft:10}} colSpan={2}>TOTAL</td>
                {DK.map(dk=>{
                  const oz=Math.ceil(milkSlots.reduce((s,sk)=>{
                    const v=milk[sk]?.[dk]; return s+(v?.redOz||0)+(v?.pct1Oz||0);
                  },0));
                  return <td key={dk} style={{...TD,textAlign:"center",color:"#0f4c35"}}>{oz||""}</td>;
                })}
                <td style={{...TD,textAlign:"center",color:"#0f4c35"}}>
                  {Math.ceil(milkSlots.reduce((s,sk)=>s+DK.reduce((ds,dk)=>{
                    const v=milk[sk]?.[dk]; return ds+(v?.redOz||0)+(v?.pct1Oz||0);
                  },0),0))||""}
                </td>
                <td style={{...TD,textAlign:"center",fontWeight:700,color:"#0f4c35"}}>
                  {ozToGal(milkSlots.reduce((s,sk)=>s+DK.reduce((ds,dk)=>{
                    const v=milk[sk]?.[dk]; return ds+(v?.redOz||0)+(v?.pct1Oz||0);
                  },0),0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <style>{`@media print{body>*:not(#kitchen-report){display:none}}`}</style>
    </div>
  );
}

// ─── Shared table styles ──────────────────────────────────────────────────────
const TABLE: React.CSSProperties = {
  borderCollapse:"collapse",fontSize:".8rem",width:"100%",background:"#fff"
};
const TH: React.CSSProperties = {
  padding:"6px 8px",textAlign:"center",fontWeight:600,
  border:"1px solid rgba(255,255,255,0.15)",fontSize:".78rem",whiteSpace:"nowrap"
};
const TD: React.CSSProperties = {
  padding:"4px 6px",border:"1px solid #dde8dd",whiteSpace:"nowrap"
};
