// Run in Chrome on a page at https://api.onegov.nsw.gov.au/ (e.g. /FuelPriceCheck/v1/fuel/lovs).
// Downloads nsw_snapshot_YYYYMMDD.json (Sydney date) to the Downloads folder and returns a short status.
const AUTH = 'Basic ' + btoa('YOUR_NSW_API_KEY:YOUR_NSW_API_SECRET');
const KEY = 'YOUR_NSW_API_KEY';
const tj = await (await fetch('/oauth/client_credential/accesstoken?grant_type=client_credentials', {headers:{Authorization:AUTH}})).json();
const p = n => String(n).padStart(2,'0'); const d = new Date(); let h = d.getUTCHours(); const ap = h>=12?'PM':'AM'; h = h%12||12;
const ts = `${p(d.getUTCDate())}/${p(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${p(h)}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${ap}`;
const r = await fetch('/FuelPriceCheck/v1/fuel/prices', {headers:{Authorization:'Bearer '+tj.access_token, apikey:KEY, transactionid:crypto.randomUUID(), requesttimestamp:ts, 'Content-Type':'application/json; charset=utf-8'}});
const t = await r.text();
const syd = new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney'}).format(new Date()).replace(/-/g,'');
let ok = false; try { const j = JSON.parse(t); ok = j.stations && j.prices && j.prices.length > 1000; } catch(e) {}
if (ok) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t],{type:'application/json'})); a.download = 'nsw_snapshot_'+syd+'.json'; document.body.appendChild(a); a.click(); }
({status:r.status, ok, bytes:t.length, file: ok ? 'nsw_snapshot_'+syd+'.json' : null})
