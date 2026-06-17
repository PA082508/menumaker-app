// src/components/settings/MealCountSettings.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface MealCountConfig {
  center_id: string;
  active_slots: string[];
  milk_slots: string[];
  is_locked: boolean;
  approved_slots: string[] | null;
  approved_date: string | null;
  approved_by: string | null;
  approval_expires: string | null;
}

const ALL_SLOTS = [
  { key: "breakfast",     label: "Breakfast",     type: "meal"  },
  { key: "am_snack",      label: "AM Snack",      type: "snack" },
  { key: "lunch",         label: "Lunch",         type: "meal"  },
  { key: "pm_snack",      label: "PM Snack",      type: "snack" },
  { key: "supper",        label: "Supper",        type: "meal"  },
  { key: "evening_snack", label: "Evening Snack", type: "snack" },
];
const MILK_ELIGIBLE = ["breakfast", "lunch", "supper"];

interface Center { id: string; name: string; }

export default function MealCountSettings() {
  const [centers, setCenters]   = useState<Center[]>([]);
  const [configs, setConfigs]   = useState<Record<string, MealCountConfig>>({});
  const [saving, setSaving]     = useState<string | null>(null);
  const [saved, setSaved]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lockModal, setLockModal] = useState<string | null>(null); // center_id
  const [lockForm, setLockForm]   = useState({ approved_by: "", approved_date: new Date().toISOString().slice(0,10), approval_expires: "" });

  useEffect(() => {
    (async () => {
      const { data: ctrs } = await supabase.schema("menumaker").from("centers").select("id,name").order("name");
      const { data: cfgs } = await supabase.schema("menumaker").from("meal_count_settings")
        .select("center_id,active_slots,milk_slots,is_locked,approved_slots,approved_date,approved_by,approval_expires");
      if (ctrs) setCenters(ctrs as Center[]);
      const map: Record<string, MealCountConfig> = {};
      for (const ctr of ctrs ?? []) {
        const cfg = (cfgs ?? []).find((c: any) => c.center_id === ctr.id);
        map[ctr.id] = cfg ?? { center_id: ctr.id, active_slots: ["breakfast","am_snack","lunch","supper"], milk_slots: ["breakfast","lunch","supper"], is_locked: false, approved_slots: null, approved_date: null, approved_by: null, approval_expires: null };
      }
      setConfigs(map);
      setLoading(false);
    })();
  }, []);

  async function toggleSlot(centerId: string, slotKey: string) {
    const cfg = configs[centerId];
    if (cfg.is_locked) return; // locked — no changes
    const isActive = cfg.active_slots.includes(slotKey);
    const newActive = isActive
      ? cfg.active_slots.filter(s => s !== slotKey)
      : [...cfg.active_slots, slotKey].sort((a,b) => ALL_SLOTS.findIndex(s=>s.key===a) - ALL_SLOTS.findIndex(s=>s.key===b));
    const newMilk = newActive.filter(s => MILK_ELIGIBLE.includes(s));
    setConfigs(prev => ({ ...prev, [centerId]: { ...cfg, active_slots: newActive, milk_slots: newMilk } }));
    setSaving(centerId);
    await supabase.schema("menumaker").from("meal_count_settings")
      .upsert({ center_id: centerId, active_slots: newActive, milk_slots: newMilk }, { onConflict: "center_id" });
    setSaving(null); setSaved(centerId);
    setTimeout(() => setSaved(null), 1500);
  }

  async function lockSlots(centerId: string) {
    const cfg = configs[centerId];
    const update = {
      center_id: centerId,
      active_slots: cfg.active_slots,
      milk_slots: cfg.milk_slots,
      is_locked: true,
      approved_slots: cfg.active_slots,
      approved_date: lockForm.approved_date,
      approved_by: lockForm.approved_by,
      approval_expires: lockForm.approval_expires || null,
    };
    await supabase.schema("menumaker").from("meal_count_settings").upsert(update, { onConflict: "center_id" });
    setConfigs(prev => ({ ...prev, [centerId]: { ...prev[centerId], ...update } }));
    setLockModal(null);
  }

  async function unlock(centerId: string) {
    await supabase.schema("menumaker").from("meal_count_settings")
      .update({ is_locked: false }).eq("center_id", centerId);
    setConfigs(prev => ({ ...prev, [centerId]: { ...prev[centerId], is_locked: false } }));
  }

  if (loading) return <div style={{padding:"2rem",color:"#666"}}>Loading…</div>;

  return (
    <div style={{padding:"1.5rem",maxWidth:680}}>
      <h2 style={{fontSize:"1.1rem",fontWeight:700,color:"#0f4c35",margin:"0 0 .4rem"}}>🍽️ Meal Count Slots</h2>

      {/* Instructions */}
      <div style={{fontSize:".8rem",background:"#e8f4e8",border:"1px solid #c0d8c0",borderRadius:8,padding:".6rem .85rem",marginBottom:"1rem",lineHeight:1.6}}>
        <b>Как настраивать:</b> Нажмите на слот чтобы включить/выключить. Изменения сохраняются автоматически.<br/>
        <b>Логика CACFP:</b> Максимально допустимо <b>3 приёма пищи</b> (meals) и <b>2 перекуса</b> (snacks) в день.
        Молоко засчитывается только на Завтрак, Обед и Ужин.<br/>
        <b>🔒 Lock:</b> После утверждения органом — зафиксируйте конфигурацию. До следующего утверждения слоты нельзя изменить.
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:"1rem",marginBottom:"1rem",flexWrap:"wrap",fontSize:".78rem",color:"#555"}}>
        {ALL_SLOTS.map(s => (
          <span key={s.key} style={{display:"flex",alignItems:"center",gap:".3rem"}}>
            <span style={{width:8,height:8,borderRadius:"50%",display:"inline-block",background:s.type==="meal"?"#0f4c35":"#e6a817"}}/>
            {s.label} <span style={{color:"#aaa",fontSize:".7rem"}}>({s.type})</span>
          </span>
        ))}
      </div>

      {centers.map(ctr => {
        const cfg = configs[ctr.id];
        if (!cfg) return null;
        const meals  = cfg.active_slots.filter(s => ALL_SLOTS.find(x=>x.key===s)?.type==="meal").length;
        const snacks = cfg.active_slots.filter(s => ALL_SLOTS.find(x=>x.key===s)?.type==="snack").length;
        const valid  = meals<=3 && snacks<=2;
        const isExpired = cfg.approval_expires && new Date(cfg.approval_expires) < new Date();

        return (
          <div key={ctr.id} style={{background:"#fff",border:`1.5px solid ${cfg.is_locked?"#0f4c35":"#e0ebe0"}`,borderRadius:12,padding:"1rem 1.25rem",marginBottom:"1rem"}}>

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".75rem"}}>
              <span style={{fontWeight:700,color:"#0a3320",fontSize:"1rem"}}>{ctr.name}</span>
              <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                {saving===ctr.id && <span style={{fontSize:".75rem",color:"#888"}}>Saving…</span>}
                {saved===ctr.id  && <span style={{fontSize:".75rem",color:"#0f4c35",fontWeight:600}}>✓ Saved</span>}
                {!valid && !cfg.is_locked && (
                  <span style={{fontSize:".72rem",background:"#fff3cd",color:"#856404",padding:".2rem .5rem",borderRadius:6}}>
                    ⚠️ Exceeds CACFP max: 3 meals, 2 snacks
                  </span>
                )}
                {cfg.is_locked ? (
                  <button onClick={() => unlock(ctr.id)} style={{
                    padding:".3rem .7rem",borderRadius:6,border:"1.5px solid #dc3545",
                    background:"#fff5f5",color:"#dc3545",fontSize:".75rem",fontWeight:600,
                    cursor:"pointer",fontFamily:"inherit"
                  }}>🔓 Unlock</button>
                ) : (
                  <button onClick={() => { setLockModal(ctr.id); setLockForm({approved_by:"",approved_date:new Date().toISOString().slice(0,10),approval_expires:""}); }} style={{
                    padding:".3rem .7rem",borderRadius:6,border:"1.5px solid #0f4c35",
                    background:"#f4fdf7",color:"#0f4c35",fontSize:".75rem",fontWeight:600,
                    cursor:"pointer",fontFamily:"inherit"
                  }}>🔒 Lock (Approve)</button>
                )}
              </div>
            </div>

            {/* Approval badge */}
            {cfg.is_locked && cfg.approved_date && (
              <div style={{
                display:"flex",alignItems:"center",gap:".75rem",
                background: isExpired ? "#fff3cd" : "#e8f4e8",
                border:`1px solid ${isExpired?"#ffc107":"#c0d8c0"}`,
                borderRadius:8,padding:".4rem .75rem",marginBottom:".75rem",
                fontSize:".75rem",color:isExpired?"#856404":"#0f4c35"
              }}>
                <span>{isExpired?"⚠️":"✅"} CACFP Approved</span>
                {cfg.approved_by && <span>by <b>{cfg.approved_by}</b></span>}
                <span>on <b>{new Date(cfg.approved_date).toLocaleDateString()}</b></span>
                {cfg.approval_expires && (
                  <span style={{marginLeft:"auto"}}>
                    {isExpired ? "⚠️ Expired:" : "Expires:"} <b>{new Date(cfg.approval_expires).toLocaleDateString()}</b>
                  </span>
                )}
              </div>
            )}

            {/* Slot buttons */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:".4rem",opacity:cfg.is_locked?0.75:1}}>
              {ALL_SLOTS.map(slot => {
                const isActive = cfg.active_slots.includes(slot.key);
                const isMilk   = MILK_ELIGIBLE.includes(slot.key) && isActive;
                return (
                  <button key={slot.key}
                    onClick={() => toggleSlot(ctr.id, slot.key)}
                    disabled={cfg.is_locked}
                    style={{
                      padding:".4rem .3rem",borderRadius:8,textAlign:"center",
                      fontSize:".78rem",fontWeight:600,position:"relative",
                      fontFamily:"inherit",transition:"all .15s",
                      cursor:cfg.is_locked?"not-allowed":"pointer",
                      border:`2px solid ${isActive ? slot.type==="meal"?"#0f4c35":"#e6a817" : "#e0e0e0"}`,
                      background:isActive ? slot.type==="meal"?"#0f4c35":"#e6a817" : "#f9f9f9",
                      color:isActive ? slot.type==="meal"?"#fff":"#3a2800" : "#aaa",
                    }}>
                    {slot.label}
                    {isMilk && <span style={{position:"absolute",top:-5,right:-5,fontSize:".6rem",
                      background:"#7ee8b0",color:"#0a3320",borderRadius:"50%",width:14,height:14,
                      display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>🥛</span>}
                  </button>
                );
              })}
            </div>

            {/* Stats */}
            <div style={{marginTop:".6rem",fontSize:".75rem",color:"#666"}}>
              Active: <b style={{color:"#0f4c35"}}>{cfg.active_slots.length}</b> &nbsp;·&nbsp;
              Meals: <b>{meals}</b> &nbsp;·&nbsp;
              Snacks: <b>{snacks}</b> &nbsp;·&nbsp;
              Milk: <b style={{color:"#0f4c35"}}>{cfg.milk_slots.join(", ")}</b>
            </div>
          </div>
        );
      })}

      {/* Lock modal */}
      {lockModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:1000}}
          onClick={() => setLockModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,
            padding:"1.5rem",maxWidth:420,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
            <h3 style={{margin:"0 0 .5rem",color:"#0a3320",fontSize:"1rem"}}>🔒 Lock CACFP Configuration</h3>
            <p style={{fontSize:".82rem",color:"#666",margin:"0 0 1rem",lineHeight:1.5}}>
              Once locked, meal slots cannot be changed until unlocked by an administrator.
              This reflects your CACFP-approved meal pattern.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:".75rem",marginBottom:"1rem"}}>
              <label style={{fontSize:".8rem",fontWeight:600,color:"#555"}}>
                Approved by (agency/officer name)
                <input value={lockForm.approved_by}
                  onChange={e=>setLockForm(f=>({...f,approved_by:e.target.value}))}
                  placeholder="e.g. Ohio DCY / Jane Smith"
                  style={{display:"block",width:"100%",marginTop:3,padding:".45rem .6rem",
                    border:"1.5px solid #c0d8c0",borderRadius:7,fontSize:".85rem",fontFamily:"inherit"}}/>
              </label>
              <label style={{fontSize:".8rem",fontWeight:600,color:"#555"}}>
                Approval date
                <input type="date" value={lockForm.approved_date}
                  onChange={e=>setLockForm(f=>({...f,approved_date:e.target.value}))}
                  style={{display:"block",width:"100%",marginTop:3,padding:".45rem .6rem",
                    border:"1.5px solid #c0d8c0",borderRadius:7,fontSize:".85rem",fontFamily:"inherit"}}/>
              </label>
              <label style={{fontSize:".8rem",fontWeight:600,color:"#555"}}>
                Expires (optional — next renewal date)
                <input type="date" value={lockForm.approval_expires}
                  onChange={e=>setLockForm(f=>({...f,approval_expires:e.target.value}))}
                  style={{display:"block",width:"100%",marginTop:3,padding:".45rem .6rem",
                    border:"1.5px solid #c0d8c0",borderRadius:7,fontSize:".85rem",fontFamily:"inherit"}}/>
              </label>
            </div>
            <div style={{display:"flex",gap:".5rem",justifyContent:"flex-end"}}>
              <button onClick={()=>setLockModal(null)} style={{padding:".5rem 1rem",borderRadius:8,
                border:"1px solid #ddd",background:"#fff",color:"#666",cursor:"pointer",fontFamily:"inherit"}}>
                Cancel
              </button>
              <button onClick={()=>lockSlots(lockModal!)}
                disabled={!lockForm.approved_by.trim()}
                style={{padding:".5rem 1rem",borderRadius:8,border:"none",
                  background:lockForm.approved_by.trim()?"#0f4c35":"#ccc",
                  color:"#fff",fontWeight:600,cursor:lockForm.approved_by.trim()?"pointer":"not-allowed",
                  fontFamily:"inherit"}}>
                🔒 Lock & Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{fontSize:".72rem",color:"#888",padding:".5rem .75rem",background:"#f4f7f4",borderRadius:8}}>
        🥛 Milk icon = counts toward milk totals (Breakfast, Lunch, Supper per CACFP only).
      </div>
    </div>
  );
}
