"""Headless replacement for the Chrome pulls (pull_nsw.js, pull_fred.js, find_aip.js, pull_history.js).

usage: python fetch.py BASE INBOX
Writes into INBOX the same files the Chrome pulls download, so run_daily.sh / update.py consume them unchanged:
  nsw_snapshot_YYYYMMDD.json   NSW FuelCheck live prices (Sydney date)          -- required, exits 1 if it fails
  fred_brent_aud.csv           FRED DCOILBRENTEU + DEXUSAL ('#'-block format)   -- optional
  AIP_TGP_Data_*.xlsx          AIP terminal gate price workbook                -- optional
  syd_events_YYYYMM.csv        NSW monthly history after ctx.history_last       -- optional
Credentials: env NSW_API_KEY / NSW_API_SECRET (GitHub Secrets), else pipeline/credentials.py.
"""
import datetime as dt, io, json, os, re, sys, time, uuid
from zoneinfo import ZoneInfo
import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = sys.argv[2] if len(sys.argv) > 2 else f"{BASE}/inbox"
os.makedirs(INBOX, exist_ok=True)
SYD = ZoneInfo("Australia/Sydney")
TODAY = dt.datetime.now(SYD).strftime("%Y%m%d")       # runners are UTC; the snapshot is filed under the Sydney date
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
FUELS = {"U91", "E10", "P98", "DL"}
is_syd = lambda pc: (2000 <= pc <= 2234) or (2555 <= pc <= 2574) or (2740 <= pc <= 2786)
log, failed = [], []


def get(url, tries=4, headers=None, **kw):
    """GET with retries on network errors and 5xx. `headers` may be a callable, rebuilt on every try."""
    for t in range(tries):
        try:
            r = requests.get(url, timeout=90, headers=headers() if callable(headers) else headers, **kw)
            if r.status_code < 500: return r
        except requests.RequestException:
            if t == tries - 1: raise
        if t < tries - 1: time.sleep(4 * (t + 1))
    return r


def creds():
    k, s = os.environ.get("NSW_API_KEY"), os.environ.get("NSW_API_SECRET")
    if not (k and s):
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try: import credentials as c
        except ImportError: raise RuntimeError("no NSW credentials: set NSW_API_KEY / NSW_API_SECRET or create pipeline/credentials.py")
        k, s = c.NSW_API_KEY, c.NSW_API_SECRET
    return k, s


# ---- NSW FuelCheck live prices (pull_nsw.js)
def pull_nsw():
    key, secret = creds(); host = "https://api.onegov.nsw.gov.au"
    tok = get(f"{host}/oauth/client_credential/accesstoken?grant_type=client_credentials", auth=(key, secret)).json()["access_token"]
    hdr = lambda: {"Authorization": "Bearer " + tok, "apikey": key, "transactionid": str(uuid.uuid4()),
                   "requesttimestamp": dt.datetime.now(dt.timezone.utc).strftime("%d/%m/%Y %I:%M:%S %p"),
                   "Content-Type": "application/json; charset=utf-8"}
    r = get(f"{host}/FuelPriceCheck/v1/fuel/prices", headers=hdr)
    j = r.json() if r.ok else {}
    if not (j.get("stations") and len(j.get("prices", [])) > 1000):
        raise RuntimeError(f"NSW prices: HTTP {r.status_code}, {len(r.content)} bytes, {len(j.get('prices', []))} prices")
    name = f"nsw_snapshot_{TODAY}.json"
    open(f"{INBOX}/{name}", "wb").write(r.content)
    return f"{name} ({len(j['prices'])} prices)"


# ---- FRED Brent USD/bbl + AUD/USD (pull_fred.js)
def pull_fred():
    out, info = "", {}
    for sid in ["DCOILBRENTEU", "DEXUSAL"]:
        r = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd=2018-06-01")   # FRED rejects a spoofed browser UA
        r.raise_for_status()
        t = r.text
        if not (t.startswith("observation_date") and sid in t.split("\n", 1)[0]):   # e.g. an HTML block/challenge page
            raise RuntimeError(f"{sid}: not a FRED CSV ({t[:60]!r})")
        info[sid] = t.strip().split("\n")[-1]
        out += f"#{sid}\n{t}\n"
    open(f"{INBOX}/fred_brent_aud.csv", "w").write(out)
    return f"fred {info}"


# ---- AIP terminal gate prices (find_aip.js)
def pull_aip():
    page = get("https://www.aip.com.au/historical-ulp-and-diesel-tgp-data", headers=UA)
    page.raise_for_status()
    m = re.search(r'href="([^"]*AIP_TGP_Data_[^"]*\.xlsx)"', page.text, re.I)
    if not m: raise RuntimeError("no AIP_TGP_Data_*.xlsx link on the AIP page")
    url = requests.compat.urljoin(page.url, m.group(1))
    r = get(url, headers=UA); r.raise_for_status()
    if not r.content.startswith(b"PK"): raise RuntimeError(f"AIP download is not an xlsx ({r.content[:60]!r})")
    name = os.path.basename(requests.utils.unquote(url.split("?")[0]))
    open(f"{INBOX}/{name}", "wb").write(r.content)
    return name


# ---- NSW monthly price-change history (pull_history.js)
MON = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def pdate(t):
    if isinstance(t, dt.datetime): return t
    if isinstance(t, (int, float)) and not isinstance(t, bool): return dt.datetime(1899, 12, 30) + dt.timedelta(seconds=round(float(t) * 86400))   # round: serials carry float error
    s = str(t).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})", s)
    if m: return dt.datetime(*map(int, m.groups()))
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?", s, re.I)
    if m:
        h = int(m.group(4) or 0); ap = (m.group(6) or "").lower()
        if ap == "pm" and h < 12: h += 12
        if ap == "am" and h == 12: h = 0
        return dt.datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), h, int(m.group(5) or 0))
    return None


def rows_of(url, content):
    if re.search(r"\.csv", url, re.I):
        import csv
        return list(csv.reader(io.StringIO(content.decode("utf-8-sig", errors="replace"))))
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    out = []
    for ws in wb.worksheets:
        out += [["" if c is None else c for c in row] for row in ws.iter_rows(values_only=True)]
    return out


def pull_history():
    fc = json.load(open(f"{BASE}/store/forecast.json"))
    hl = dt.date.fromisoformat(fc["ctx"]["history_last"]); last_k = hl.year * 12 + hl.month - 1
    r = get("https://data.nsw.gov.au/data/api/3/action/package_search?q=fuel%20check%20history&rows=1", tries=5)
    r.raise_for_status()
    want = {}
    for x in r.json()["result"]["results"][0]["resources"]:
        m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(20\d\d)", x["name"].lower())
        if not m or not re.search(r"\.(xlsx|csv)(\?|$)", x["url"], re.I): continue
        k = int(m.group(2)) * 12 + MON[m.group(1)]
        if k > last_k and k not in want: want[k] = x["url"]
    if not want: return f"no new monthly file after {hl}"
    done = []
    for k in sorted(want)[:2]:
        url = want[k]; r = get(f"{url}?cb={int(time.time())}")
        if not r.ok: done.append(f"fetch failed {r.status_code}"); continue
        rows = rows_of(url, r.content)
        hi = next(i for i, row in enumerate(rows) if any(str(c).strip() == "FuelCode" for c in row))
        h = [str(c).replace("﻿", "").strip() for c in rows[hi]]
        iA, iN, iP, iF, iT, iPr = (h.index(c) for c in ["Address", "ServiceStationName", "Postcode", "FuelCode", "PriceUpdatedDate", "Price"])
        out, lA, lP = ["key,fuel,ymd,hhmm,price"], "", ""
        for x in rows[hi + 1:]:
            if not x or len(x) <= max(iA, iN, iP, iF, iT, iPr): continue
            a = x[iA] if x[iA] not in ("", None) else lA       # merged cells: address/postcode only on the first row
            p = x[iP] if x[iP] not in ("", None) else lP
            lA, lP = a, p
            f = str(x[iF] or "").strip()
            try: pc, pr = int(float(p)), float(x[iPr])
            except (TypeError, ValueError): continue
            if f not in FUELS or not is_syd(pc) or not (50 < pr < 600): continue
            d = pdate(x[iT])
            if d is None: continue
            key = re.sub(r"\s+", " ", str(a or x[iN]).upper()).replace(",", " ").strip()   # same order as pull_history.js
            out.append(f"{key},{f},{d:%Y%m%d},{d:%H%M},{pr:g}")
        name = f"syd_events_{k // 12}{k % 12 + 1:02d}.csv"
        if len(out) < 10000:   # a real Sydney month has ~40-50k rows; don't feed a partial/empty file into the store
            done.append(f"{name} skipped, only {len(out) - 1} rows"); continue
        open(f"{INBOX}/{name}", "w").write("\n".join(out))
        done.append(f"{name} rows {len(out) - 1}")
    return "; ".join(done)


for name, fn, required in [("nsw", pull_nsw, True), ("fred", pull_fred, False), ("aip", pull_aip, False), ("history", pull_history, False)]:
    try:
        log.append(f"{name}: {fn()}")
    except Exception as e:
        log.append(f"{name}: FAILED {type(e).__name__}: {str(e)[:200]}")
        if required: failed.append(name)
print("\n".join(log))
sys.exit(1 if failed else 0)
