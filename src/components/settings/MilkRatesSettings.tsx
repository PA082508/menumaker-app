// src/components/settings/MilkRatesSettings.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

interface MilkRate {
  id: string;
  age_group: string;
  label: string;
  milk_type: string;
  rate_oz: number;
  sort_order: number;
}

const MILK_TYPES = [
  { value: "formula", label: "Formula" },
  { value: "red",     label: "Red (Whole)" },
  { value: "1pct",    label: "1% Milk" },
  { value: "none",    label: "None" },
];

export default function MilkRatesSettings() {
  const { currentCenter, centers, setCurrentCenter } = useOrg();
  const [rates, setRates]     = useState<MilkRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState<string | null>(null);
  const [saved, setSaved]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .schema("menumaker")
        .from("milk_rates")
        .select("*")
        .order("sort_order");
      console.log("milk_rates:", data, error);
      if (error) setError(error.message);
      if (data) setRates(data as MilkRate[]);
      setLoading(false);
    })();
  }, []);

  async function updateRate(id: string, field: "milk_type" | "rate_oz", value: string | number) {
    setRates(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setSaving(id);
    await supabase
      .schema("menumaker")
      .from("milk_rates")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSaving(null);
    setSaved(id);
    setTimeout(() => setSaved(null), 1500);
  }

  if (loading) return <div style={{padding:"2rem",color:"#666"}}>Loading…</div>;
  if (error)   return <div style={{padding:"2rem",color:"red"}}>Error: {error}</div>;
  if (!rates.length) return <div style={{padding:"2rem",color:"#666"}}>No data found.</div>;

  return (
    <div style={{padding:"1.5rem",maxWidth:560}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:".5rem",flexWrap:"wrap",marginBottom:".4rem"}}>
        <h2 style={{fontSize:"1.1rem",fontWeight:700,color:"#0f4c35",margin:0}}>🥛 Milk Norms by Age</h2>
        {centers.length > 1 && (
          <select
            value={currentCenter?.id ?? ""}
            onChange={e => { const v = e.target.value; setCurrentCenter(v ? (centers.find(c => c.id === v) ?? null) : null); }}
            style={{padding:".4rem .6rem",borderRadius:6,border:"1.5px solid #c0d8c0",fontSize:".85rem",fontFamily:"inherit",background:"#fff",color:"#0f4c35",cursor:"pointer",outline:"none"}}>
            <option value="">🏢 Organization (all centers)</option>
            {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <p style={{fontSize:".85rem",color:"#666",margin:"0 0 1.25rem",lineHeight:1.5}}>
        Controls how much milk is counted per serving. Children under 12 months receive formula and are excluded from milk totals.
      </p>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:".88rem"}}>
        <thead>
          <tr>
            {["Age Group","Milk Type","Rate (oz)",""].map(h => (
              <th key={h} style={{background:"#0f4c35",color:"#fff",padding:".5rem .75rem",textAlign:"left",fontWeight:600}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rates.map(rate => {
            const isFormula = rate.milk_type === "formula" || rate.milk_type === "none";
            return (
              <tr key={rate.id} style={{background:isFormula?"#fafff5":"#fff"}}>
                <td style={{padding:".5rem .75rem",borderBottom:"1px solid #e0ebe0",fontWeight:600,color:isFormula?"#999":"#1a2e1a"}}>{rate.label}</td>
                <td style={{padding:".5rem .75rem",borderBottom:"1px solid #e0ebe0"}}>
                  <select value={rate.milk_type} onChange={e => updateRate(rate.id,"milk_type",e.target.value)}
                    style={{border:"1.5px solid #c0d8c0",borderRadius:6,padding:".3rem .5rem",fontSize:".85rem",fontFamily:"inherit",background:"#fff",cursor:"pointer",outline:"none"}}>
                    {MILK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td style={{padding:".5rem .75rem",borderBottom:"1px solid #e0ebe0"}}>
                  {isFormula ? <span style={{color:"#bbb"}}>—</span> : (
                    <input type="number" value={rate.rate_oz} min={0} max={16} step={0.5}
                      onChange={e => updateRate(rate.id,"rate_oz",parseFloat(e.target.value))}
                      style={{width:60,border:"1.5px solid #c0d8c0",borderRadius:6,padding:".3rem .5rem",fontSize:".85rem",fontFamily:"inherit",textAlign:"center",outline:"none"}}/>
                  )}
                </td>
                <td style={{padding:".5rem .75rem",borderBottom:"1px solid #e0ebe0",width:70,fontSize:".78rem"}}>
                  {saving===rate.id && <span style={{color:"#888"}}>Saving…</span>}
                  {saved===rate.id  && <span style={{color:"#0f4c35",fontWeight:600}}>✓ Saved</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{marginTop:"1rem",fontSize:".78rem",color:"#888",padding:".6rem .75rem",background:"#f4f7f4",borderRadius:8}}>
        <b>CACFP defaults:</b> 0-11m = Formula · 1y = Red 4oz · 2y = 1% 4oz · 3-5y = 1% 6oz · 6-12y = 1% 8oz
      </div>
    </div>
  );
}
