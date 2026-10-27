// Run in Chrome on a page at https://data.nsw.gov.au/ (e.g. /robots.txt), with a first line the caller adds:
//   const HIST_LAST = 'YYYY-MM-DD';   // ctx.history_last from store/forecast.json
// Finds NSW FuelCheck monthly history files for months after HIST_LAST, keeps Sydney rows only,
// and downloads each as syd_events_YYYYMM.csv (key,fuel,ymd,hhmm,price). Returns what it did.
const MON = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const last = new Date(HIST_LAST + 'T00:00:00'); const lastK = last.getFullYear()*12 + last.getMonth();
let res = null;
for (let t=0; t<5 && !res; t++) { try { const r = await fetch('https://data.nsw.gov.au/data/api/3/action/package_search?q=fuel%20check%20history&rows=1'); if (r.ok) res = (await r.json()).result.results[0].resources; } catch(e) {} if (!res) await new Promise(s=>setTimeout(s,4000)); }
if (!res) { 'catalogue unavailable (data.nsw.gov.au) - try again tomorrow' } else {
const want = [];
for (const x of res) { const m = x.name.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(20\d\d)/); if (!m || !/\.(xlsx|csv)(\?|$)/i.test(x.url)) continue;
  const k = +m[2]*12 + MON[m[1]]; if (k > lastK && !want.find(w=>w.k===k)) want.push({k, url:x.url}); }
want.sort((a,b)=>a.k-b.k);
if (!want.length) { 'no new monthly file yet (latest published month ends ' + HIST_LAST + ')' } else {
if (!window.XLSX) await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=ok;s.onerror=no;document.head.appendChild(s)});
const FUELS = {U91:1,E10:1,P95:1,P98:1,DL:1};
const isSyd = pc => (pc>=2000&&pc<=2234)||(pc>=2555&&pc<=2574)||(pc>=2740&&pc<=2786);
function csvRows(txt){const out=[];let row=[],f='',q=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(q){if(c=='"'){if(txt[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else{if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'){row.push(f);out.push(row);row=[];f=''}else if(c!='\r')f+=c}}if(f||row.length){row.push(f);out.push(row)}return out}
function pdate(t){if(t instanceof Date)return t;if(typeof t==='number')return new Date(Math.round((t-25569)*864e5)+new Date().getTimezoneOffset()*6e4);const s=String(t).trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);if(m)return new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5]);m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);if(m){let h=+(m[4]||0);if(m[6]){if(/pm/i.test(m[6])&&h<12)h+=12;if(/am/i.test(m[6])&&h==12)h=0}return new Date(+m[3],m[2]-1,+m[1],h,+(m[5]||0))}return null}
const done = [];
for (const w of want.slice(0,2)) {
  const r = await fetch(w.url + '?cb=' + Date.now(), {cache:'no-store'}); if (!r.ok) { done.push('fetch failed ' + r.status); continue; }
  const buf = await r.arrayBuffer(); let rows;
  if (/\.csv/i.test(w.url)) rows = csvRows(new TextDecoder().decode(buf)); else { const wb = XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true}); rows=[]; for (const sn of wb.SheetNames) rows = rows.concat(XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:''})); }
  const hi = rows.findIndex(r=>r&&r.some(c=>String(c).trim()==='FuelCode')); const h = rows[hi].map(x=>String(x).replace(/^﻿/,'').trim()); const I = k=>h.indexOf(k);
  const iA=I('Address'),iN=I('ServiceStationName'),iP=I('Postcode'),iF=I('FuelCode'),iT=I('PriceUpdatedDate'),iPr=I('Price');
  const out = ['key,fuel,ymd,hhmm,price']; let lA='',lP='';
  for (let i=hi+1;i<rows.length;i++){ const x=rows[i]; if(!x) continue; const a=x[iA]!==''&&x[iA]!=null?x[iA]:lA; const p=x[iP]!==''&&x[iP]!=null?x[iP]:lP; lA=a; lP=p;
    const f=String(x[iF]||'').trim(); if(!FUELS[f]||!isSyd(+p)) continue; const pr=+x[iPr]; if(!(pr>50&&pr<600)) continue; const d=pdate(x[iT]); if(!d||isNaN(d)) continue;
    out.push(String(a||x[iN]).toUpperCase().replace(/\s+/g,' ').replace(/,/g,' ').trim()+','+f+','+(d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate())+','+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+','+pr); }
  const name = 'syd_events_' + Math.floor(w.k/12) + String(w.k%12+1).padStart(2,'0') + '.csv';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.join('\n')],{type:'text/csv'})); a.download = name; document.body.appendChild(a); a.click();
  done.push(name + ' rows ' + (out.length-1)); await new Promise(s=>setTimeout(s,1500)); }
done }}
