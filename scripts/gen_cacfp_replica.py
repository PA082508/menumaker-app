#!/usr/bin/env python3
# Генератор READ-ONLY реплики CACFP Enrollment из витринного кита.
# Координаты НЕ переписываются руками — они читаются из самого кита, чтобы
# реплика была 1:1 по построению, а не по внимательности.
import re, json, sys, pathlib

SRC = pathlib.Path.home() / 'Downloads/pa082508.github.io/forms/1-data-sources/CACFP_Enrollment_v11.html'
OUT = pathlib.Path('/Users/nikolaykutsenko/Downloads/menumaker-app/public/forms/CACFP_Enrollment_v11_original.html')
h = SRC.read_text()

def attr(s, n):
    m = re.search(n + r'="([^"]*)"', s)
    return m.group(1) if m else None

def px(style, p):
    m = re.search(p + r':([\d.]+)px', style)
    return round(float(m.group(1)), 1) if m else None

fields, boxes = [], []
for tag, attrs in re.findall(r'<(input|textarea|select)\b([^>]*?)>', h):
    i = attr(attrs, 'id')
    if not i:
        continue
    st = attr(attrs, 'style') or ''
    x, y, w, hh = px(st, 'left'), px(st, 'top'), px(st, 'width'), px(st, 'height')
    if x is None or y is None:
        continue
    if i.startswith('f_'):
        fields.append({'id': i[2:], 'x': x, 'y': y, 'w': w, 'h': hh,
                       'date': (attr(attrs, 'type') == 'date')})
    elif i.startswith('cb_'):
        boxes.append({'id': i[3:], 'x': x, 'y': y, 'w': w, 'h': hh})

# подпись — канвас в обёртке, координаты берём с обёртки
m = re.search(r'<div style="position:absolute;z-index:20;left:([\d.]+)px;top:([\d.]+)px;width:([\d.]+)px;height:([\d.]+)px;">\s*<canvas id="f_parent_sig"', h)
sig = {'x': float(m.group(1)), 'y': float(m.group(2)), 'w': float(m.group(3)), 'h': float(m.group(4))} if m else None
if not sig:
    sys.exit('signature box not found — витрина изменилась, реплику собирать нельзя')

print(f'fields={len(fields)} checkboxes={len(boxes)} sig={sig}')

HTML = '''<!DOCTYPE html>
<!--
  CACFP_Enrollment_v11_original.html — LOCAL, same-origin, READ-ONLY 1:1 replica of the
  storefront CACFP Enrollment kit, for the in-app "View original form".

  ORIGIN (canon of provenance — "ready-made forms first"):
    source     : pa082508.github.io / forms/1-data-sources/CACFP_Enrollment_v11.html
    background : CACFP_Enrollment_form.png — the SAME 1275x1650 sheet the parent filled in
    generated  : scripts/gen_cacfp_replica.py — coordinates are READ FROM THE KIT, never
                 retyped, so the replica is 1:1 by construction. Re-run it when the kit moves.
    date       : 2026-08-05

  WHAT IT SHOWS. The values as FILED: the payload is the normalized submission shape
  (child_name / birthdate / schedule{day:{in_care,arr1..dep2,meals}} / mailing{} / ...),
  not the kit's raw input ids — the same mapping the kit's own PA_APPLY does, read-only.
  Interactivity (submit / clear / prefill / masks / FKPad) is stripped: nothing here writes.

  Contract (same as the DCY replica):
    parent -> iframe:  postMessage({type:'original-render', formData:{...}, signatures:{...},
                                    signatureDate:'YYYY-MM-DD'}, '*')
    standalone:        ?data=<uri JSON {formData, signatures, signatureDate}>
  Chrome (stamp) lives OUTSIDE the sheet; @media print emits ONLY the page.
-->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CACFP Enrollment — filed original</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#5a6b60;font-family:Arial,Helvetica,sans-serif}
  .doc{padding:14px 0 60px}
  .page{position:relative;width:1275px;height:1650px;margin:0 auto 20px;background:#fff;
    box-shadow:0 6px 24px rgba(0,0,0,.35)}
  .page .bg{position:absolute;top:0;left:0;width:1275px;height:1650px;z-index:0;
    print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .page .layer{position:absolute;top:0;left:0;width:1275px;height:1650px;z-index:1}
  .rv{position:absolute;font-family:Arial,sans-serif;font-size:15px;color:#111;
    background:rgba(255,253,150,0.45);padding:1px 4px;overflow:hidden;white-space:nowrap;
    display:flex;align-items:center;line-height:1.1}
  .rmark{position:absolute;display:flex;align-items:center;justify-content:center;
    font-size:17px;font-weight:800;color:#0f4c35}
  .rsig{position:absolute;object-fit:contain;background:transparent}
  .rtyped{position:absolute;font-family:'Brush Script MT','Segoe Script',cursive;font-size:26px;
    color:#111;display:flex;align-items:flex-end;line-height:1}
  .rattr{position:absolute;font-family:Arial,sans-serif;font-size:9.5px;font-style:italic;
    color:#0f4c35;white-space:nowrap;line-height:1;background:rgba(255,255,255,0.72);padding:0 2px;border-radius:2px}
  .stamp{position:fixed;top:10px;right:12px;z-index:50;font-family:Inter,Arial,sans-serif;
    font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0f4c35;
    background:#fff;border:1.5px solid #0f4c35;border-radius:6px;padding:4px 9px;box-shadow:0 1px 4px rgba(0,0,0,.2)}
  @media print{
    @page{size:8.5in 11in;margin:0}
    html,body{background:#fff;margin:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .stamp{display:none!important}
    .doc{padding:0;zoom:1}
    .page{zoom:0.64;box-shadow:none;margin:0}
    .rv{background:transparent}
  }
</style>
</head>
<body>
  <div class="stamp">Copy — what was signed</div>
  <div class="doc">
    <div class="page"><img class="bg" src="CACFP_Enrollment_form.png" alt="CACFP Enrollment"><div class="layer" id="layer"></div></div>
  </div>
<script>
/* Геометрия скопирована из витринного кита генератором, а не руками. */
var FIELDS = __FIELDS__;
var BOXES  = __BOXES__;
var SIG    = __SIG__;
var DAYS   = ['mon','tue','wed','thu','fri','sat','sun'];
var MEALS  = ['b','as','l','ps','su','es'];

var L = document.getElementById('layer');
function el(cls, st, txt){ var d=document.createElement('div'); d.className=cls;
  for (var k in st) d.style[k]=st[k]; if(txt!=null) d.textContent=txt; L.appendChild(d); return d; }
function pos(f){ return {left:f.x+'px', top:f.y+'px', width:(f.w||60)+'px', height:(f.h||20)+'px'}; }
function byId(list,id){ for(var i=0;i<list.length;i++) if(list[i].id===id) return list[i]; return null; }

/* Дата с бумаги печатается как на бумаге — M/D/YYYY, и берётся СРЕЗАМИ строки:
   new Date('2017-05-13') в нью-йоркском поясе отдал бы 12 мая. */
function fmtDate(v){ if(!v) return ''; var p=String(v).slice(0,10).split('-');
  return p.length===3 ? (+p[1])+'/'+(+p[2])+'/'+p[0] : String(v); }

function put(id, value, isDate){
  var f = byId(FIELDS, id); if(!f) return;
  var v = value==null ? '' : String(value); if(!v) return;
  el('rv', pos(f), isDate||f.date ? fmtDate(v) : v);
}
function mark(id, on){
  if(!on) return; var b = byId(BOXES, id); if(!b) return;
  el('rmark', {left:b.x+'px', top:b.y+'px', width:(b.w||18)+'px', height:(b.h||18)+'px'}, '\\u2713');
}

function render(fd, sigs, sigDate){
  fd = fd||{}; sigs = sigs||{}; L.innerHTML='';

  put('center', fd.center_name);
  put('child_name', fd.child_name);
  put('age', fd.age);
  put('dob', fd.birthdate, true);

  var sch = fd.schedule||{};
  DAYS.forEach(function(d){
    var x = sch[d]; if(!x) return;
    mark(d, x.in_care);
    put(d+'_arr1', x.arr1); put(d+'_dep1', x.dep1);
    put(d+'_arr2', x.arr2); put(d+'_dep2', x.dep2);
    if(x.meals) MEALS.forEach(function(m){ mark(d+'_'+m, x.meals[m]); });
  });
  mark('varies', fd.schedule_varies);

  put('parent_name', fd.parent_name);
  put('sig_date', sigDate, true);
  put('phone', fd.day_phone);
  var ml = fd.mailing||{};
  put('street', ml.street); put('city', ml.city); put('zip', ml.zip);
  put('parent_dob', fd.parent_birthdate, true);
  put('parent_email', fd.parent_email);

  /* Подпись — как она подана: рисунок рисунком, набранная набранной. Подменять
     одно другим нельзя: это разные способы подписать, и в записи они различены. */
  var img = sigs.parent_sig;
  if (img && String(img).indexOf('data:image/')===0){
    var i = document.createElement('img'); i.className='rsig'; i.src=img;
    i.style.left=SIG.x+'px'; i.style.top=SIG.y+'px'; i.style.width=SIG.w+'px'; i.style.height=SIG.h+'px';
    L.appendChild(i);
  } else if (fd.signature_method==='typed' && fd.signature_typed_value){
    el('rtyped', {left:SIG.x+'px', top:(SIG.y-6)+'px', width:SIG.w+'px', height:(SIG.h+8)+'px'},
       fd.signature_typed_value);
  }

  /* Если у формы есть контрподпись — она названа на самой форме, а не только в базе. */
  var meta = sigs.countersign_meta||{};
  var slots = Object.keys(meta);
  if (slots.length){
    var m0 = meta[slots[0]]||{};
    var line = 'Signed by ' + (m0.name||'—') + (m0.role? ', '+m0.role : '') +
               (m0.at? ', '+fmtDate(m0.at) : '');
    el('rattr', {left:SIG.x+'px', top:(SIG.y+SIG.h+1)+'px', width:(SIG.w+260)+'px', height:'12px'}, line);
  }
}

window.addEventListener('message', function(e){
  var d = e.data;
  if (d && d.type==='original-render') render(d.formData, d.signatures, d.signatureDate);
});
try {
  var q = new URLSearchParams(location.search).get('data');
  if (q){ var j = JSON.parse(decodeURIComponent(q)); render(j.formData, j.signatures, j.signatureDate); }
} catch(_){}
</script>
</body>
</html>
'''

HTML = (HTML.replace('__FIELDS__', json.dumps(fields, separators=(',', ':')))
            .replace('__BOXES__', json.dumps(boxes, separators=(',', ':')))
            .replace('__SIG__', json.dumps(sig, separators=(',', ':'))))
OUT.write_text(HTML)
print('written', OUT, len(HTML), 'bytes')
