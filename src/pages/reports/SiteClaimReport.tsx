// src/pages/reports/SiteClaimReport.tsx
// CACFP Site Claim Report — 3 tabs: Site Claim | Claim Recap | Cost Details

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { useOrg } from "@/contexts/OrgContext";
const SLOT_KEYS   = ["b","as","l","ps","su","es"];
const SLOT_NAMES  = ["breakfast","am_snack","lunch","pm_snack","supper","evening_snack"];
const DAY_KEYS    = ["mon","tue","wed","thu","fri"];
const MEAL_SLOTS  = ["b","l","su"];
const SNACK_SLOTS = ["as","ps","es"];
const PRIORITY: Record<string,number> = {b:1,as:2,l:3,ps:5,su:4,es:6};
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const SLOT_LABEL: Record<string,string> = {
  breakfast:"Breakfast", am_snack:"AM Snack", lunch:"Lunch",
  pm_snack:"PM Snack", supper:"Supper", evening_snack:"Evening Snack"
};

interface ClassBreakdown {
  id:string; name:string; days_of_op:number;
  slots:Record<string,number>; ada:number; total:number;
}
interface Reimbursement {
  meal_reimbursement:number; cil_reimbursement:number; total:number;
}
interface ClaimData {
  days_of_operation:number; total_attendance:number; ada:number;
  breakfast:number; am_snack:number; lunch:number;
  pm_snack:number; supper:number; evening_snack:number;
  classrooms:ClassBreakdown[];
  weeks_approved:number; weeks_total:number;
  claim_id?:string; status?:string;
  number_of_shifts:number; free_category:number;
  reduced_category:number; paid_category:number;
  license_capacity:number; notes:string;
  reimbursement?:Reimbursement;
}
interface Rate { slot:string; category:string; rate:number; }

function getExcludedSlot(dayVals:Record<string,number>):string|null {
  const cm=MEAL_SLOTS.filter(s=>dayVals[s]>0);
  const cs=SNACK_SLOTS.filter(s=>dayVals[s]>0);
  if(cm.length+cs.length<=3) return null;
  if(cm.length>2) return cm.sort((a,b)=>PRIORITY[a]-PRIORITY[b])[0];
  if(cs.length>1) return cs.sort((a,b)=>PRIORITY[a]-PRIORITY[b])[0];
  return null;
}

type Tab = "claim"|"recap"|"costs";

export default function SiteClaimReport() {
  const { currentCenter } = useOrg();
  const centerId = currentCenter?.id ?? '';
  const now = new Date();
  const [tab,     setTab]     = useState<Tab>("claim");
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth()+1);
  const [data,    setData]    = useState<ClaimData|null>(null);
  const [rates,   setRates]   = useState<Rate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [closing, setClosing] = useState(false);
  const [msg,     setMsg]     = useState<string|null>(null);

  // Load rates once
  useEffect(()=>{
    supabase.schema("menumaker").from("cacfp_rates")
      .select("slot,category,rate").order("slot").order("category")
      .then(({data:r})=>{ if(r) setRates(r as Rate[]); });
  },[]);

  const loadData = useCallback(async()=>{
    setLoading(true); setMsg(null);
    const {data:center} = await supabase.schema("menumaker").from("centers")
      .select("license_capacity").eq("id",centerId).single();
    const {data:ec} = await supabase.schema("menumaker").from("monthly_claims")
      .select("*").eq("center_id",centerId)
      .eq("claim_month",month).eq("claim_year",year).single();
    if(ec && ec.status!=="open"){
      setData({
        claim_id:ec.id, status:ec.status,
        days_of_operation:ec.days_of_operation||0, total_attendance:ec.total_attendance||0, ada:ec.ada||0,
        breakfast:ec.breakfast||0, am_snack:ec.am_snack||0, lunch:ec.lunch||0,
        pm_snack:ec.pm_snack||0, supper:ec.supper||0, evening_snack:ec.evening_snack||0,
        classrooms:(ec.classroom_breakdown as ClassBreakdown[])||[],
        weeks_approved:0, weeks_total:0,
        number_of_shifts:ec.number_of_shifts||1, free_category:ec.free_category||0,
        reduced_category:ec.reduced_category||0, paid_category:ec.paid_category||0,
        license_capacity:ec.license_capacity||center?.license_capacity||158, notes:ec.notes||"",
        reimbursement:ec.reimbursement as Reimbursement|undefined,
      });
      setLoading(false); return;
    }
    const monthEnd=new Date(year,month,0);
    const mondays:string[]=[];
    let d=new Date(year,month-1,1);
    while(d.getDay()!==1) d=new Date(d.getTime()-86400000);
    while(d<=new Date(monthEnd.getTime()+7*86400000)){
      mondays.push(format(d,"yyyy-MM-dd")); d=new Date(d.getTime()+7*86400000);
    }
    const {data:clsRaw}=await supabase.schema("menumaker").from("classrooms")
      .select("id,name,sort_order").eq("is_active",true).eq("center_id",centerId).order("sort_order");
    const {data:allRecs}=await supabase.schema("menumaker").from("meal_week_records")
      .select("*").eq("center_id",centerId).in("monday_date",mondays);
    const approved=(allRecs||[]).filter(r=>r.status==="director_approved");
    const wTotal=new Set((allRecs||[]).map(r=>`${r.classroom_id}_${r.monday_date}`)).size;
    const wApproved=new Set(approved.map(r=>`${r.classroom_id}_${r.monday_date}`)).size;
    const clsMap:Record<string,ClassBreakdown>={};
    for(const cls of clsRaw||[]){
      if(cls.name.toLowerCase().includes("staff")) continue;
      clsMap[cls.id]={id:cls.id,name:cls.name,days_of_op:0,slots:{b:0,as:0,l:0,ps:0,su:0,es:0},ada:0,total:0};
    }
    const clsDays:Record<string,Set<string>>={};
    for(const rec of approved){
      const cls=clsMap[rec.classroom_id]; if(!cls) continue;
      if(!clsDays[rec.classroom_id]) clsDays[rec.classroom_id]=new Set();
      const monday=new Date(rec.monday_date+"T12:00:00");
      for(const dk of DAY_KEYS){
        const di=DAY_KEYS.indexOf(dk);
        const date=new Date(monday.getTime()+di*86400000);
        if(date.getMonth()+1!==month||date.getFullYear()!==year) continue;
        const dv:Record<string,number>={};
        for(const s of SLOT_KEYS) dv[s]=rec[`${dk}_${s}`]??0;
        const excl=getExcludedSlot(dv);
        let has=false;
        for(const s of SLOT_KEYS){ if(dv[s]>0&&s!==excl){cls.slots[s]=(cls.slots[s]||0)+dv[s];has=true;} }
        if(has) clsDays[rec.classroom_id].add(format(date,"yyyy-MM-dd"));
      }
    }
    let totDays=0,totADA=0,totAtt=0;
    const totSlots:Record<string,number>={b:0,as:0,l:0,ps:0,su:0,es:0};
    for(const cls of Object.values(clsMap)){
      const days=clsDays[cls.id]?.size||0; cls.days_of_op=days;
      if(days>totDays) totDays=days;
      const mx=Math.max(...SLOT_KEYS.map(s=>cls.slots[s]||0));
      cls.ada=days>0?Math.ceil(mx/days):0;
      cls.total=SLOT_KEYS.reduce((s,k)=>s+(cls.slots[k]||0),0);
      totADA+=cls.ada; totAtt+=cls.total;
      for(const s of SLOT_KEYS) totSlots[s]=(totSlots[s]||0)+(cls.slots[s]||0);
    }
    const manual=(ec||{}) as any;
    setData({
      claim_id:ec?.id, status:"open",
      days_of_operation:totDays, total_attendance:totAtt, ada:totADA,
      breakfast:totSlots.b||0, am_snack:totSlots.as||0, lunch:totSlots.l||0,
      pm_snack:totSlots.ps||0, supper:totSlots.su||0, evening_snack:totSlots.es||0,
      classrooms:Object.values(clsMap), weeks_approved:wApproved, weeks_total:wTotal,
      number_of_shifts:manual.number_of_shifts||1, free_category:manual.free_category||0,
      reduced_category:manual.reduced_category||0, paid_category:manual.paid_category||0,
      license_capacity:manual.license_capacity||center?.license_capacity||158, notes:manual.notes||"",
    });
    setLoading(false);
  },[year,month]);

  useEffect(()=>{loadData();},[loadData]);

  async function saveManual(){
    if(!data) return; setSaving(true);
    const r = calcRecap();
    const reimbursement = r ? {meal_reimbursement:r.mealTotal, cil_reimbursement:r.cilAmt, total:r.grandTotal} : undefined;
    await supabase.schema("menumaker").from("monthly_claims").upsert({
      center_id:centerId, claim_month:month, claim_year:year, status:"open",
      days_of_operation:data.days_of_operation, total_attendance:data.total_attendance, ada:data.ada,
      breakfast:data.breakfast, am_snack:data.am_snack, lunch:data.lunch,
      pm_snack:data.pm_snack, supper:data.supper, evening_snack:data.evening_snack,
      classroom_breakdown:data.classrooms,
      number_of_shifts:data.number_of_shifts, free_category:data.free_category,
      reduced_category:data.reduced_category, paid_category:data.paid_category,
      license_capacity:data.license_capacity, notes:data.notes,
      reimbursement,
      updated_at:new Date().toISOString(),
    },{onConflict:"center_id,claim_month,claim_year"});
    setSaving(false); setMsg("✓ Saved"); setTimeout(()=>setMsg(null),2000);
  }

  async function closeMonth(){
    if(!data) return; setClosing(true);
    const r = calcRecap();
    const reimbursement = r ? {meal_reimbursement:r.mealTotal, cil_reimbursement:r.cilAmt, total:r.grandTotal} : undefined;
    await supabase.schema("menumaker").from("monthly_claims").upsert({
      center_id:centerId, claim_month:month, claim_year:year, status:"closed",
      days_of_operation:data.days_of_operation, total_attendance:data.total_attendance, ada:data.ada,
      breakfast:data.breakfast, am_snack:data.am_snack, lunch:data.lunch,
      pm_snack:data.pm_snack, supper:data.supper, evening_snack:data.evening_snack,
      classroom_breakdown:data.classrooms,
      number_of_shifts:data.number_of_shifts, free_category:data.free_category,
      reduced_category:data.reduced_category, paid_category:data.paid_category,
      license_capacity:data.license_capacity, notes:data.notes,
      reimbursement,
      closed_at:new Date().toISOString(), updated_at:new Date().toISOString(),
    },{onConflict:"center_id,claim_month,claim_year"});
    setClosing(false); setMsg("✅ Month closed"); await loadData();
  }

  async function reopen(){
    if(!data?.claim_id) return;
    await supabase.schema("menumaker").from("monthly_claims")
      .update({status:"open"}).eq("id",data.claim_id);
    await loadData();
  }

  const isClosed = data?.status==="closed"||data?.status==="submitted";
  const totalEnrolled = (data?.free_category||0)+(data?.reduced_category||0)+(data?.paid_category||0);
  const progressPct = data&&data.weeks_total>0?Math.round(data.weeks_approved/data.weeks_total*100):0;

  // Claim Recap calculation
  function calcRecap(){
    if(!data||!rates.length) return null;
    const slotOrder = ["breakfast","am_snack","lunch","supper","pm_snack","evening_snack"];
    const slotTotals: Record<string,number> = {
      breakfast:data.breakfast, am_snack:data.am_snack, lunch:data.lunch,
      pm_snack:data.pm_snack, supper:data.supper, evening_snack:data.evening_snack,
    };
    const total_enrolled = totalEnrolled||1;
    const free_pct   = (data.free_category||0)/total_enrolled;
    const reduced_pct= (data.reduced_category||0)/total_enrolled;
    let mealTotal=0;
    const rows = slotOrder.map(slot=>{
      const count = slotTotals[slot]||0;
      if(!count) return null;
      const freeCount    = Math.round(count*free_pct);
      const reducedCount = Math.round(count*reduced_pct);
      const paidCount    = count-freeCount-reducedCount;
      const rFree    = rates.find(r=>r.slot===slot&&r.category==="free")?.rate||0;
      const rReduced = rates.find(r=>r.slot===slot&&r.category==="reduced")?.rate||0;
      const rPaid    = rates.find(r=>r.slot===slot&&r.category==="paid")?.rate||0;
      const amtFree    = freeCount*rFree;
      const amtReduced = reducedCount*rReduced;
      const amtPaid    = paidCount*rPaid;
      const slotAmt    = amtFree+amtReduced+amtPaid;
      mealTotal+=slotAmt;
      return {slot,count,freeCount,reducedCount,paidCount,
        rFree,rReduced,rPaid,amtFree,amtReduced,amtPaid,slotAmt};
    }).filter(Boolean);
    // CIL = (lunch.total + supper.total) × cacfp_rates(lunch, 'cil')
    const cilRate  = rates.find(r=>r.slot==="lunch"&&r.category==="cil")?.rate||0;
    const cilCount = (slotTotals.lunch||0)+(slotTotals.supper||0);
    const cilAmt   = cilCount*cilRate;
    const grandTotal = mealTotal+cilAmt;

    // Assert computed values match stored reimbursement (if present)
    const stored = data.reimbursement;
    if(stored){
      const eps = 0.005;
      if(Math.abs(mealTotal - stored.meal_reimbursement) > eps)
        console.error(`[claim] mealTotal mismatch: computed ${mealTotal.toFixed(2)} ≠ stored ${stored.meal_reimbursement}`);
      if(Math.abs(cilAmt - stored.cil_reimbursement) > eps)
        console.error(`[claim] cilAmt mismatch: computed ${cilAmt.toFixed(2)} ≠ stored ${stored.cil_reimbursement}`);
      if(Math.abs(grandTotal - stored.total) > eps)
        console.error(`[claim] grandTotal mismatch: computed ${grandTotal.toFixed(2)} ≠ stored ${stored.total}`);
    }

    return {rows,mealTotal,cilRate,cilCount,cilAmt,grandTotal};
  }

  const recap = calcRecap();

  return (
    <div style={{padding:"1.5rem",fontFamily:"Calibri,Arial,sans-serif",maxWidth:920}}>

      {/* Top controls */}
      <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <h2 style={{margin:0,fontSize:"1.1rem",fontWeight:700,color:"#0f4c35"}}>📋 CACFP Claim</h2>
        <select value={month} onChange={e=>setMonth(+e.target.value)} style={SEL}>
          {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(+e.target.value)} style={SEL}>
          {[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        {data?.status && (
          <span style={{padding:".25rem .75rem",borderRadius:12,fontSize:".78rem",fontWeight:700,
            background:isClosed?"#e8f4e8":"#fff3cd",color:isClosed?"#0f4c35":"#856404"}}>
            {data.status==="open"?"🔄 Live":data.status==="closed"?"🔒 Closed":"✅ Submitted"}
          </span>
        )}
        {loading&&<span style={{fontSize:".82rem",color:"#888"}}>Calculating…</span>}
        {msg&&<span style={{fontSize:".82rem",color:"#0f4c35",fontWeight:600}}>{msg}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:".5rem"}}>
          {!isClosed&&data&&(<>
            <button onClick={saveManual} disabled={saving} style={BTN_SEC}>{saving?"Saving…":"💾 Save"}</button>
            <button onClick={closeMonth} disabled={closing} style={{...BTN_PRI,background:"#856404"}}>
              {closing?"Closing…":"🔒 Close Month"}
            </button>
          </>)}
          {isClosed&&<button onClick={reopen} style={{...BTN_SEC,borderColor:"#dc3545",color:"#dc3545"}}>🔓 Reopen</button>}
          <button onClick={()=>window.print()} style={BTN_PRI}>🖨️ Print</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,marginBottom:"1rem",borderBottom:"2px solid #0f4c35"}}>
        {([["claim","📋 Site Claim"],["recap","💰 Claim Recap"],["costs","📊 Cost Details"]] as [Tab,string][]).map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:".5rem 1.25rem",border:"none",fontFamily:"inherit",fontSize:".88rem",fontWeight:600,
            cursor:"pointer",borderRadius:"8px 8px 0 0",
            background:tab===t?"#0f4c35":"#f4f7f4",
            color:tab===t?"#fff":"#555",
            borderBottom:tab===t?"2px solid #0f4c35":"none",
          }}>{l}</button>
        ))}
      </div>

      {/* Progress bar */}
      {data&&!isClosed&&data.weeks_total>0&&tab==="claim"&&(
        <div style={{marginBottom:"1rem",background:"#f4f7f4",borderRadius:10,padding:".75rem 1rem",border:"1px solid #c0d8c0"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:".8rem",marginBottom:4}}>
            <span style={{fontWeight:600,color:"#0f4c35"}}>📊 Approval Progress</span>
            <span style={{color:"#666"}}>{data.weeks_approved} of {data.weeks_total} week-classes approved ({progressPct}%)</span>
          </div>
          <div style={{background:"#e0e0e0",borderRadius:4,height:8}}>
            <div style={{background:progressPct===100?"#0f4c35":"#e6a817",width:`${progressPct}%`,height:8,borderRadius:4,transition:"width .3s"}}/>
          </div>
          {progressPct<100&&<div style={{fontSize:".75rem",color:"#856404",marginTop:4}}>⚠️ Some weeks not yet approved — figures may be incomplete</div>}
        </div>
      )}

      {/* ── TAB: SITE CLAIM ── */}
      {tab==="claim"&&data&&(
        <div id="claim-report" style={{background:"#fff",border:"1px solid #ccc",padding:"1rem"}}>
          <div style={{background:"#1a5276",color:"#fff",textAlign:"center",fontWeight:"bold",fontSize:"13pt",padding:"6px 0",marginBottom:4}}>
            Child & Adult Care Food Program — Site Claim Report
          </div>
          <div style={{fontSize:"9pt",color:"#555",marginBottom:2}}>011269 | Play Academy | 201 Alpha Park, Highland Heights, OH 44143-2225 | FEIN: 26-2255862</div>
          <div style={{fontSize:"9pt",color:"#555",marginBottom:8}}>50020338 | PLAY ACADEMY WEST | 6285 Pearl Rd #30, Parma Hts, OH 44130-3069</div>
          <Row2 label="Month/Year Claimed" value={`${MONTHS[month-1]} ${year}`} yellow/>
          <Sec title="Child Care Center"/><Row2 label="Child Care Center" value="Play Academy (West)" yellow/>
          <Sec title="Attendance Reporting"/><H2 label="Quantity"/>
          <DR2 code="C1" label="Total Days of Operation"  value={data.days_of_operation} auto/>
          <DR2 code="C2" label="Total Attendance"         value={data.total_attendance} auto/>
          <DR2 code="C3" label="Average Daily Attendance" value={data.ada} auto/>
          <DR2 code="C4" label="Number of Shifts" value={isClosed?data.number_of_shifts:
            <input value={data.number_of_shifts} type="number" onChange={e=>setData(d=>d?{...d,number_of_shifts:+e.target.value}:d)} style={INP}/>}/>
          <Sec title="Number of enrolled participants in each reimbursement category"/><H2 label="Quantity"/>
          {([["C5","Free Category","free_category"],["C6","Reduced Category","reduced_category"],["C7","Paid Category","paid_category"]] as [string,string,string][]).map(([c,l,k])=>(
            <DR2 key={c} code={c} label={l} value={isClosed?(data as any)[k]:
              <input value={(data as any)[k]||""} type="number" min={0} onChange={e=>setData(d=>d?{...d,[k]:+e.target.value}:d)} style={INP}/>}/>
          ))}
          <DR2 code="C8" label="Total Enrolled" value={totalEnrolled||""} auto/>
          <Sec title="For Profit Centers Only"/><H2 label="Quantity"/>
          <DR2 code="C9"  label="License Capacity" value={isClosed?data.license_capacity:
            <input value={data.license_capacity||""} type="number" onChange={e=>setData(d=>d?{...d,license_capacity:+e.target.value}:d)} style={INP}/>}/>
          <DR2 code="C10" label="Free/Reduced Eligibility"      value="Eligibility: (auto)" gray/>
          <DR2 code="C11" label="Number of Subsidized Children" value="Eligibility: (auto)" gray/>
          <Sec title="Qualified Child Meals / Snacks Served"/><H2 label="Total"/>
          <DR2 code="C12" label="Breakfast"     value={data.breakfast}       auto/>
          <DR2 code="C13" label="AM Snack"      value={data.am_snack}        auto/>
          <DR2 code="C14" label="Lunch"         value={data.lunch}           auto/>
          <DR2 code="C15" label="PM Snack"      value={data.pm_snack||0}     auto/>
          <DR2 code="C16" label="Supper"        value={data.supper||0}       auto/>
          <DR2 code="C17" label="Evening Snack" value={data.evening_snack||0} auto/>
          <Sec title="Child Second Meals / Snacks Served"/><H2 label="Total"/>
          {["Breakfast","AM Snack","Lunch","PM Snack","Supper","Evening Snack"].map((l,i)=>(
            <DR2 key={i} code={`C${18+i}`} label={`${l} - Second Serving`} value=""/>
          ))}
          {!isClosed&&(<div style={{marginTop:8}}>
            <div style={{fontSize:"8pt",fontWeight:600,color:"#666",marginBottom:2}}>Notes</div>
            <textarea value={data.notes} rows={2} onChange={e=>setData(d=>d?{...d,notes:e.target.value}:d)}
              style={{width:"100%",border:"1px solid #ccc",borderRadius:4,padding:"4px",fontFamily:"inherit",fontSize:"8pt",resize:"vertical"}}/>
          </div>)}
          {/* Classroom breakdown */}
          <div style={{marginTop:12,borderTop:"2px solid #1a5276",paddingTop:8}}>
            <div style={{fontWeight:"bold",fontSize:"9pt",color:"#1a5276",marginBottom:4}}>Breakdown by Classroom</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"8pt"}}>
              <thead><tr style={{background:"#d6e4f0"}}>
                {["Classroom","Days","Breakfast","AM Snack","Lunch","PM Snack","Supper","Eve Snack","ADA","Total"].map(h=>(
                  <th key={h} style={{border:"1px solid #aaa",padding:"2px 4px",textAlign:"center"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.classrooms.map((cls,i)=>(
                  <tr key={cls.id||i} style={{background:i%2===0?"#fff":"#f9f9f9"}}>
                    <td style={{border:"1px solid #ddd",padding:"2px 4px"}}>{cls.name}</td>
                    <td style={TC}>{cls.days_of_op||"—"}</td>
                    <td style={TC}>{cls.slots.b||""}</td><td style={TC}>{cls.slots.as||""}</td>
                    <td style={TC}>{cls.slots.l||""}</td><td style={TC}>{cls.slots.ps||""}</td>
                    <td style={TC}>{cls.slots.su||""}</td><td style={TC}>{cls.slots.es||""}</td>
                    <td style={{...TC,fontWeight:"bold",color:"#1a5276"}}>{cls.ada||"—"}</td>
                    <td style={{...TC,fontWeight:"bold"}}>{cls.total||""}</td>
                  </tr>
                ))}
                <tr style={{background:"#e8f4f8",fontWeight:"bold"}}>
                  <td style={{border:"1px solid #aaa",padding:"2px 4px"}}>TOTAL</td>
                  <td style={TC}>{data.days_of_operation}</td>
                  <td style={TC}>{data.breakfast}</td><td style={TC}>{data.am_snack}</td>
                  <td style={TC}>{data.lunch}</td><td style={TC}>{data.pm_snack||""}</td>
                  <td style={TC}>{data.supper||""}</td><td style={TC}>{data.evening_snack||""}</td>
                  <td style={{...TC,color:"#1a5276"}}>{data.ada}</td>
                  <td style={TC}>{data.total_attendance}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: CLAIM RECAP ── */}
      {tab==="recap"&&(
        <div style={{background:"#fff",border:"1px solid #ccc",padding:"1rem"}}>
          <div style={{background:"#1a5276",color:"#fff",textAlign:"center",fontWeight:"bold",fontSize:"13pt",padding:"6px 0",marginBottom:8}}>
            Child & Adult Care Food Program — Claim For Reimbursement Summary
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"1rem",marginBottom:"1rem",fontSize:"9pt"}}>
            <div><b>Month/Year Claimed:</b> {MONTHS[month-1]} {year}</div>
            <div style={{color:"#888"}}>Date Received: ___________</div>
            <div style={{color:"#888"}}>Date Processed: ___________</div>
          </div>
          {!totalEnrolled&&(
            <div style={{background:"#fff3cd",border:"1px solid #ffc107",borderRadius:6,padding:".5rem .75rem",
              fontSize:".8rem",color:"#856404",marginBottom:"1rem"}}>
              ⚠️ Enter Free/Reduced/Paid counts in Site Claim tab to calculate reimbursement amounts
            </div>
          )}
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"9pt"}}>
            <thead>
              <tr style={{background:"#d6e4f0"}}>
                <th style={TH}>Sponsor Totals</th>
                <th style={TH}>Meals/Snacks</th>
                <th style={TH}>Federal Rate</th>
                <th style={TH}>Reimbursement Amount</th>
              </tr>
            </thead>
            <tbody>
              {recap?.rows.map((row,i)=>{
                if(!row) return null;
                const cats=[
                  {label:"Free",    count:row.freeCount,    rate:row.rFree,    amt:row.amtFree},
                  {label:"Reduced", count:row.reducedCount, rate:row.rReduced, amt:row.amtReduced},
                  {label:"Paid",    count:row.paidCount,    rate:row.rPaid,    amt:row.amtPaid},
                ];
                return [
                  <tr key={`${i}-h`} style={{background:"#eaf2fb"}}>
                    <td colSpan={4} style={{...TH,textAlign:"left",fontWeight:"bold",color:"#1a5276"}}>
                      {SLOT_LABEL[row.slot]}
                    </td>
                  </tr>,
                  ...cats.map((cat,j)=>(
                    <tr key={`${i}-${j}`} style={{background:j%2===0?"#fff":"#f9f9f9"}}>
                      <td style={{...TD,paddingLeft:16}}>{cat.label}</td>
                      <td style={{...TD,textAlign:"center"}}>{cat.count}</td>
                      <td style={{...TD,textAlign:"center"}}>${cat.rate.toFixed(4)}</td>
                      <td style={{...TD,textAlign:"right"}}>{cat.count?`$${cat.amt.toFixed(2)}`:""}</td>
                    </tr>
                  )),
                  <tr key={`${i}-t`} style={{background:"#fff176",fontWeight:"bold"}}>
                    <td colSpan={2} style={TD}>Total {SLOT_LABEL[row.slot]}</td>
                    <td style={{...TD,textAlign:"center"}}>{row.count}</td>
                    <td style={{...TD,textAlign:"right"}}>${row.slotAmt.toFixed(2)}</td>
                  </tr>
                ];
              })}
              {recap&&recap.cilCount>0&&(
                <tr style={{background:"#f0f4ff"}}>
                  <td style={{...TD,paddingLeft:16,fontStyle:"italic"}}>Cash In Lieu (CIL)</td>
                  <td style={{...TD,textAlign:"center"}}>{recap.cilCount}</td>
                  <td style={{...TD,textAlign:"center"}}>${recap.cilRate.toFixed(4)}</td>
                  <td style={{...TD,textAlign:"right"}}>${recap.cilAmt.toFixed(2)}</td>
                </tr>
              )}
              <tr style={{background:"#0f4c35",color:"#fff",fontWeight:"bold",fontSize:"10pt"}}>
                <td colSpan={3} style={{...TD,color:"#fff"}}>Claim Reimbursement Total</td>
                <td style={{...TD,textAlign:"right",color:"#fff"}}>${recap?.grandTotal.toFixed(2)||"0.00"}</td>
              </tr>
            </tbody>
          </table>
          {recap&&(
            <div style={{marginTop:"1rem",border:"1px solid #aaa",padding:".75rem"}}>
              <div style={{fontWeight:"bold",color:"#1a5276",marginBottom:".5rem"}}>Sponsor Claim Reimbursement Totals</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"4px",fontSize:"9pt"}}>
                <span>Meal Reimbursement</span><span style={{textAlign:"right",fontWeight:"bold"}}>${recap.mealTotal.toFixed(2)}</span>
                <span>CIL Reimbursement</span><span style={{textAlign:"right",fontWeight:"bold"}}>${recap.cilAmt.toFixed(2)}</span>
                <span style={{borderTop:"1px solid #ccc",paddingTop:4,fontWeight:"bold"}}>Current Claim Reimbursement Total</span>
                <span style={{borderTop:"1px solid #ccc",paddingTop:4,textAlign:"right",fontWeight:"bold",color:"#0f4c35",fontSize:"11pt"}}>${recap.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: COST DETAILS ── */}
      {tab==="costs"&&(
        <div style={{background:"#fff",border:"1px solid #ccc",padding:"1rem"}}>
          <div style={{background:"#1a5276",color:"#fff",textAlign:"center",fontWeight:"bold",fontSize:"13pt",padding:"6px 0",marginBottom:8}}>
            Child & Adult Care Food Program — Claim Cost Details
          </div>
          <div style={{fontSize:"9pt",color:"#555",marginBottom:"1rem"}}>
            011269 | Play Academy | 201 Alpha Park, Highland Heights, OH 44143-2225 | FEIN: 26-2255862
          </div>
          <div style={{background:"#fff3cd",border:"1px solid #ffc107",borderRadius:6,padding:".5rem .75rem",fontSize:".8rem",color:"#856404",marginBottom:"1rem"}}>
            📝 Cost Details section — enter monthly budget figures manually. These are submitted with the claim.
          </div>
          {[
            {title:"A. CACFP Operating Expenses", items:[
              "1. Executive Staff Labor","2. Management Staff Labor","3. Staff Labor",
              "4. Fringe Benefits","5. Food (costs for meals/snacks self prepared or vended)",
              "6. Food delivery or transportation","7. Non Food (disposable plates, cups, cleaning supplies)",
              "8. Purchased Services (trash removal, etc)","9. Equipment (rental, lease, purchase)",
              "10. Other (kitchen rent or utilities)",
            ]},
            {title:"B. CACFP Administrative Expenses", items:[
              "1. Executive Staff Labor","2. Management Staff Labor","3. Staff Labor",
              "4. Fringe Benefits","5. Travel/Training","6. Communications (internet, postage, phone)",
              "7. General Office Supplies","8. Contracted Services (accounting fees)",
              "9. Other (office rent, utilities)",
            ]},
            {title:"C. CACFP Income", items:[
              "1. Food Income Received","2. Other Income Received",
            ]},
          ].map((section,si)=>(
            <div key={si} style={{marginBottom:"1.25rem"}}>
              <div style={{fontWeight:"bold",background:"#d6e4f0",padding:"4px 8px",fontSize:"9.5pt",color:"#1a5276",marginBottom:0}}>
                {section.title}
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"8.5pt"}}>
                <thead><tr style={{background:"#eaf2fb"}}>
                  <th style={{...TH,textAlign:"left"}}>Item</th>
                  <th style={TH}>CACFP Funded (Current)</th>
                  <th style={TH}>CACFP Funded (YTD)</th>
                  <th style={TH}>Non-CACFP (Current)</th>
                  <th style={TH}>Annual Budget</th>
                </tr></thead>
                <tbody>
                  {section.items.map((item,ii)=>(
                    <tr key={ii} style={{background:ii%2===0?"#fff":"#f9f9f9"}}>
                      <td style={{...TD,paddingLeft:8}}>{item}</td>
                      <td style={TD}><input style={{...INP,width:80}} placeholder="0.00"/></td>
                      <td style={TD}><input style={{...INP,width:80}} placeholder="0.00"/></td>
                      <td style={TD}><input style={{...INP,width:80}} placeholder="0.00"/></td>
                      <td style={TD}><input style={{...INP,width:80}} placeholder="0.00"/></td>
                    </tr>
                  ))}
                  <tr style={{background:"#fff176",fontWeight:"bold"}}>
                    <td style={{...TD,paddingLeft:8}}>Total {section.title.split(".")[1].trim()}</td>
                    <td style={TD}/><td style={TD}/><td style={TD}/><td style={TD}/>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <style>{`@media print{body>*:not(#claim-report){display:none}#claim-report{border:none}}`}</style>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const SEL:React.CSSProperties={padding:".35rem .6rem",borderRadius:7,border:"1.5px solid #c0d8c0",fontSize:".85rem",fontFamily:"inherit",background:"#fff",cursor:"pointer"};
const INP:React.CSSProperties={width:70,padding:"1px 4px",border:"1px solid #aaa",background:"#fff176",fontFamily:"inherit",fontSize:"10pt",textAlign:"right"};
const BTN_PRI:React.CSSProperties={padding:".4rem .9rem",borderRadius:8,border:"none",background:"#0f4c35",color:"#fff",fontWeight:600,fontSize:".82rem",cursor:"pointer",fontFamily:"inherit"};
const BTN_SEC:React.CSSProperties={padding:".4rem .9rem",borderRadius:8,border:"1.5px solid #0f4c35",background:"#fff",color:"#0f4c35",fontWeight:600,fontSize:".82rem",cursor:"pointer",fontFamily:"inherit"};
const TC:React.CSSProperties={border:"1px solid #ddd",padding:"2px 4px",textAlign:"center"};
const TH:React.CSSProperties={border:"1px solid #aaa",padding:"3px 6px",textAlign:"center",fontWeight:"bold"};
const TD:React.CSSProperties={border:"1px solid #ddd",padding:"2px 6px"};

function Sec({title}:{title:string}){return <div style={{fontWeight:"bold",fontSize:"10pt",borderBottom:"1px solid #555",marginTop:10,marginBottom:2,paddingBottom:1}}>{title}</div>;}
function H2({label}:{label:string}){return <div style={{display:"grid",gridTemplateColumns:"1fr 110px",background:"#d6e4f0",border:"1px solid #aaa",padding:"2px 6px",fontWeight:"bold",fontSize:"10pt"}}><span/><span style={{textAlign:"center"}}>{label}</span></div>;}
function DR2({code,label,value,auto,gray}:{code?:string;label:string;value:any;auto?:boolean;yellow?:boolean;gray?:boolean;}){
  return <div style={{display:"grid",gridTemplateColumns:"30px 1fr 110px",border:"1px solid #aaa",borderTop:"none",padding:"2px 6px",background:gray?"#f5f5f5":"#fff",fontSize:"10pt",alignItems:"center"}}>
    <span style={{color:"#888",fontSize:"9pt"}}>{code}</span>
    <span>{label}</span>
    <span style={{textAlign:"right",fontWeight:auto?"bold":"normal",background:auto?"#fff176":"transparent",padding:"0 4px"}}>{value}</span>
  </div>;
}
function Row2({label,value,yellow}:{label:string;value:any;yellow?:boolean}){
  return <div style={{display:"grid",gridTemplateColumns:"1fr 110px",border:"1px solid #aaa",padding:"2px 6px",marginBottom:2,background:yellow?"#fff176":"#fff",fontSize:"10pt"}}>
    <span style={{fontWeight:"bold"}}>{label}</span><span style={{textAlign:"right"}}>{value}</span>
  </div>;
}
