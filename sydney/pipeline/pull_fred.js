// Run in Chrome on a page at https://fred.stlouisfed.org/ . Downloads fred_brent_aud.csv (Brent USD/bbl + AUD/USD).
let all = '', info = {};
for (const id of ['DCOILBRENTEU','DEXUSAL']) { const r = await fetch('/graph/fredgraph.csv?id='+id+'&cosd=2018-06-01'); const t = await r.text(); info[id] = [r.status, t.trim().split('\n').at(-1)]; all += '#'+id+'\n'+t+'\n'; }
const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([all],{type:'text/csv'})); a.download = 'fred_brent_aud.csv'; document.body.appendChild(a); a.click();
info
