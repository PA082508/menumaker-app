// src/components/meal-count/FiveDayReconciliation.tsx
// Five-Day Reconciliation — CACFP inspection tool

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { format, subDays } from "date-fns";
import { useOrg } from "@/contexts/OrgContext";
const DAY_KEYS = ["mon","tue","wed","thu","fri"];
const SLOT_KEYS = ["b","as","l","ps","su","es"];
const SLOT_LABEL: Record<string,string> = {
  b:"Breakfast", as:"AM Snack", l:"Lunch", ps:"PM Snack", su:"Supper", es:"Eve Snack"
};
const PRIORITY: Record<string,number> = {b:1,as:2,l:3,ps:5,su:4,es:6};
const MEAL_SLOTS  = ["b","l","su"];
const SNACK_SLOTS = ["as","ps","es"];

interface DayTotal {
  date:    string;
  label:   string;
  isToday: boolean;
  totals:  Record<string,number>;
  count:   number;
  status:  "approved"|"draft"|"no_data";
}

interface ClassRecon {
  classroom_id:   string;
  classroom_name: string;
  days:           DayTotal[];
  activeSlots:    string[];
}

function getExcluded(dayVals:Record<string,number>):string|null {
  const cm=MEAL_SLOTS.filter(s=>dayVals[s]>0);
  const cs=SNACK_SLOTS.filter(s=>dayVals[s]>0);
  if(cm.length+cs.length<=3) return null;
  if(cm.length>2) return cm.sort((a,b)=>PRIORITY[a]-PRIORITY[b])[0];
  if(cs.length>1) return cs.sort((a,b)=>PRIORITY[a]-PRIORITY[b])[0];
  return null;
}

function getWorkingDays(fromDate:Date, count:number):Date[] {
  const days:Date[] = [];
  let d = new Date(fromDate);
  while(days.length < count) {
    if(d.getDay()>=1 && d.getDay()<=5) days.push(new Date(d));
    d = subDays(d,1);
  }
  return days;
}

function mondayOf(d:Date):Date {
  const day = new Date(d);
  const dow = day.getDay();
  day.setDate(day.getDate() + (dow===0?-6:1-dow));
  return day;
}

export default function FiveDayReconciliation() {
  const { currentCenter } = useOrg();
  const centerId = currentCenter?.id ?? '';
  const [checkDate, setCheckDate] = useState(format(new Date(),"yyyy-MM-dd"));
  const [data,      setData]      = useState<ClassRecon[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState<string|null>(null);
  const [notes,     setNotes]     = useState<Record<string,string>>({});

  useEffect(()=>{ load(); },[checkDate]);

  async function load() {
    setLoading(true);

    const {data:clsRaw} = await supabase.schema("menumaker").from("classrooms")
      .select("id,name,sort_order").eq("is_active",true)
      .eq("center_id",centerId).order("sort_order");

    const {data:settings} = await supabase.schema("menumaker").from("meal_count_settings")
      .select("active_slots").eq("center_id",centerId).single();

    const slotMap:Record<string,string> = {
      breakfast:"b",am_snack:"as",lunch:"l",pm_snack:"ps",supper:"su",evening_snack:"es"
    };
    const activeSlots: string[] = settings?.active_slots?.map((s:string)=>slotMap[s]||s) || ["b","as","l","su"];

    const today = new Date(checkDate+"T12:00:00");
    const workDays = getWorkingDays(today, 6);

    const mondaySet = new Set<string>();
    workDays.forEach(d=>mondaySet.add(format(mondayOf(d),"yyyy-MM-dd")));

    const {data:recordsRaw} = await supabase.schema("menumaker").from("meal_week_records")
      .select("*")
      .eq("center_id",centerId)
      .in("monday_date",Array.from(mondaySet));
    const records = (recordsRaw ?? []) as any[];

    const clsMap:Record<string,ClassRecon> = {};
    for(const cls of clsRaw||[]) {
      if(cls.name.toLowerCase().includes("staff")) continue;
      clsMap[cls.id] = {classroom_id:cls.id,classroom_name:cls.name,days:[],activeSlots};
    }

    for(const cls of Object.values(clsMap)) {
      cls.days = workDays.map(wd=>{
        const dateStr = format(wd,"yyyy-MM-dd");
        const monday  = format(mondayOf(wd),"yyyy-MM-dd");
        const dk      = DAY_KEYS[wd.getDay()-1];
        const clsRecs = records.filter(r=>r.classroom_id===cls.classroom_id&&r.monday_date===monday);

        if(!clsRecs.length) return {
          date:dateStr, label:format(wd,"EEE MMM d"), isToday:dateStr===checkDate,
          totals:{}, count:0, status:"no_data" as const
        };

        const status = clsRecs.every(r=>r.status==="director_approved")?"approved":"draft";
        const totals:Record<string,number> = {};
        let count = 0;

        for(const rec of clsRecs) {
          const dayVals:Record<string,number> = {};
          SLOT_KEYS.forEach(sk=>dayVals[sk]=rec[`${dk}_${sk}`]??0);
          const excl = getExcluded(dayVals);
          let served = false;
          activeSlots.forEach(sk=>{ if(dayVals[sk]&&sk!==excl){totals[sk]=(totals[sk]||0)+1;served=true;} });
          if(served) count++;
        }

        return {date:dateStr,label:format(wd,"EEE MMM d"),isToday:dateStr===checkDate,totals,count,status};
      });
    }

    setData(Object.values(clsMap));
    setLoading(false);
  }

  function discrepancy(days:DayTotal[], slot:string):boolean {
    const prev = days.filter(d=>!d.isToday&&d.status!=="no_data");
    if(prev.length<2) return false;
    const avg = prev.reduce((s,d)=>s+(d.totals[slot]||0),0)/prev.length;
    const todayVal = days.find(d=>d.isToday)?.totals[slot]||0;
    return avg>0 && Math.abs(todayVal-avg)/avg>0.20;
  }

  function avgPrev(days:DayTotal[], key:"count"|string):string {
    const prev = days.filter(d=>!d.isToday&&d.status!=="no_data");
    if(!prev.length) return "—";
    const sum = prev.reduce((s,d)=>s+(key==="count"?d.count:(d.totals[key]||0)),0);
    return (sum/prev.length).toFixed(1);
  }

  return (
    <div style={{padding:"1rem",fontFamily:"inherit"}}>

      <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <h3 style={{margin:0,fontSize:"1rem",fontWeight:700,color:"#0f4c35"}}>
          📊 Five-Day Reconciliation
        </h3>
        <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
          <label style={{fontSize:".82rem",color:"#666"}}>Check date:</label>
          <input type="date" value={checkDate}
            onChange={e=>setCheckDate(e.target.value)}
            style={{padding:".3rem .5rem",border:"1.5px solid #c0d8c0",borderRadius:7,
              fontSize:".85rem",fontFamily:"inherit"}}/>
        </div>
        {loading && <span style={{fontSize:".82rem",color:"#888"}}>Loading…</span>}
      </div>

      <div style={{background:"#e8f4e8",border:"1px solid #c0d8c0",borderRadius:8,
        padding:".6rem .85rem",marginBottom:"1rem",fontSize:".78rem",color:"#0f4c35",lineHeight:1.5}}>
        <b>CACFP Inspection Tool:</b> Compares today's meal count against previous 5 working days.
        Differences over ±20% from average are flagged <span style={{color:"#dc3545",fontWeight:700}}>⚠️</span>.
        Be ready to explain any discrepancies to the inspector.
      </div>

      {data.map(cls=>{
        const isExp = expanded===cls.classroom_id || data.length===1;
        const hasDisc = cls.activeSlots.some(sk=>discrepancy(cls.days,sk));
        const todayCount = cls.days.find(d=>d.isToday)?.count||0;

        return (
          <div key={cls.classroom_id} style={{marginBottom:".75rem",
            border:`1.5px solid ${hasDisc?"#dc3545":"#e0ebe0"}`,borderRadius:10,overflow:"hidden"}}>

            <div onClick={()=>setExpanded(isExp&&data.length>1?null:cls.classroom_id)}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:".6rem 1rem",background:hasDisc?"#fff5f5":"#f4fdf7",cursor:"pointer"}}>
              <span style={{fontWeight:700,color:hasDisc?"#dc3545":"#0a3320",fontSize:".95rem"}}>
                {cls.classroom_name}{hasDisc?" ⚠️":""}
              </span>
              <div style={{display:"flex",alignItems:"center",gap:".75rem",fontSize:".78rem"}}>
                <span style={{color:"#666"}}>Today: <b style={{color:"#0f4c35"}}>{todayCount}</b> children</span>
                <span style={{color:"#aaa"}}>{isExp?"▲":"▼"}</span>
              </div>
            </div>

            {isExp && (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:".8rem"}}>
                  <thead>
                    <tr style={{background:"#0f4c35",color:"#fff"}}>
                      <th style={{...TH,textAlign:"left",minWidth:110}}>Date</th>
                      <th style={TH}>Status</th>
                      {cls.activeSlots.map(sk=><th key={sk} style={TH}>{SLOT_LABEL[sk]||sk}</th>)}
                      <th style={{...TH,background:"#0a3320"}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cls.days.map((day,i)=>{
                      const bg = day.isToday?"#fffde7":i%2===0?"#fff":"#f9f9f9";
                      return (
                        <tr key={day.date} style={{background:bg,fontWeight:day.isToday?700:400,
                          borderBottom:day.isToday?"2px solid #e6a817":"1px solid #eee"}}>
                          <td style={{...TD,textAlign:"left",paddingLeft:12}}>
                            {day.label}
                            {day.isToday && <span style={{marginLeft:6,fontSize:".68rem",
                              background:"#e6a817",color:"#fff",padding:"1px 5px",borderRadius:4}}>TODAY</span>}
                          </td>
                          <td style={{...TD,textAlign:"center"}}>
                            {day.status==="approved"?"✅":day.status==="draft"?"📝":"—"}
                          </td>
                          {cls.activeSlots.map(sk=>{
                            const val = day.totals[sk]||0;
                            const disc = day.isToday && discrepancy(cls.days,sk);
                            return (
                              <td key={sk} style={{...TD,textAlign:"center",
                                color:disc?"#dc3545":"inherit",fontWeight:disc||day.isToday?700:400,
                                background:disc?"#fff5f5":"inherit"}}>
                                {day.status==="no_data"?"—":val}{disc?" ⚠️":""}
                              </td>
                            );
                          })}
                          <td style={{...TD,textAlign:"center",fontWeight:700,
                            color:day.isToday?"#0f4c35":"#555"}}>
                            {day.status==="no_data"?"—":day.count}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{background:"#e8f4e8",fontWeight:700,fontSize:".78rem"}}>
                      <td style={{...TD,textAlign:"left",paddingLeft:12,color:"#0f4c35"}}>Avg (prev 5)</td>
                      <td style={TD}/>
                      {cls.activeSlots.map(sk=>(
                        <td key={sk} style={{...TD,textAlign:"center",color:"#0f4c35"}}>
                          {avgPrev(cls.days,sk)}
                        </td>
                      ))}
                      <td style={{...TD,textAlign:"center",color:"#0f4c35"}}>{avgPrev(cls.days,"count")}</td>
                    </tr>
                  </tbody>
                </table>

                {hasDisc && (
                  <div style={{padding:".6rem 1rem",background:"#fff5f5",
                    borderTop:"1px solid #dc354533",fontSize:".78rem"}}>
                    <b style={{color:"#dc3545"}}>⚠️ Discrepancy detected.</b>
                    <span style={{color:"#666",marginLeft:6}}>
                      Possible reasons: illness, holiday, fieldtrip, weather closure.
                    </span>
                    <input value={notes[cls.classroom_id]||""}
                      onChange={e=>setNotes(n=>({...n,[cls.classroom_id]:e.target.value}))}
                      placeholder="Enter explanation for your records..."
                      style={{display:"block",width:"100%",marginTop:6,padding:".35rem .5rem",
                        border:"1px solid #ddd",borderRadius:6,fontSize:".78rem",fontFamily:"inherit"}}/>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && data.length===0 && (
        <div style={{textAlign:"center",color:"#ccc",padding:"2rem",fontSize:".9rem"}}>
          No data available for selected date
        </div>
      )}
    </div>
  );
}

const TH:React.CSSProperties = {
  padding:"6px 8px",textAlign:"center",fontWeight:600,
  border:"1px solid rgba(255,255,255,0.2)",fontSize:".78rem"
};
const TD:React.CSSProperties = {
  padding:"5px 8px",border:"1px solid #eee"
};
