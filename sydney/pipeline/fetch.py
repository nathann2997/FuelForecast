"""Headless replacement for the Chrome pulls (pull_nsw.js, pull_fred.js, find_aip.js, pull_history.js). Brent and
AUD/USD come from the US EIA and the RBA rather than FRED (see pull_macro).

usage: python fetch.py BASE INBOX
Writes into INBOX the same files the Chrome pulls download, so run_daily.sh / update.py consume them unchanged:
  nsw_snapshot_YYYYMMDD.json   NSW FuelCheck live prices (Sydney date)          -- required, exits 1 if it fails
  brent_audusd_eia_rba.csv     Brent (US EIA) + AUD/USD (RBA F11.1), FRED ids, + ULSD_NYH (EIA) when available
                               -- optional (replaces the FRED pull)
And straight into BASE/archive/vic/: vic_prices_YYYYMMDD.csv.gz (VIC Servo Saver, once a day; optional, env VIC_API_KEY)
  AIP_TGP_Data_*.xlsx          AIP terminal gate price workbook                -- optional
  syd_events_YYYYMM.csv        NSW monthly history after ctx.history_last       -- optional
Credentials: env NSW_API_KEY / NSW_API_SECRET (GitHub Secrets), else pipeline/credentials.py.
"""
import datetime as dt, io, json, os, re, sys, time, uuid
from zoneinfo import ZoneInfo
import requests
from urllib.parse import urlsplit

BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = sys.argv[2] if len(sys.argv) > 2 else f"{BASE}/inbox"
os.makedirs(INBOX, exist_ok=True)
SYD = ZoneInfo("Australia/Sydney")
TODAY = dt.datetime.now(SYD).strftime("%Y%m%d")       # runners are UTC; the snapshot is filed under the Sydney date
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
from fuels import FUELS
is_syd = lambda pc: (2000 <= pc <= 2234) or (2555 <= pc <= 2574) or (2740 <= pc <= 2786)
log, failed = [], []


# Downloads: https only, from these sites and their subdomains (scraped links included, checked again after redirects),
# and at most MAX_BYTES each. The largest real file is a ~7 MB monthly history workbook.
ALLOWED_DOMAINS = ("nsw.gov.au", "aip.com.au", "eia.gov", "rba.gov.au", "service.vic.gov.au")
MAX_BYTES = 100 * 1024 * 1024


def allowed(url):
    u = urlsplit(url); h = (u.hostname or "").lower()
    return u.scheme == "https" and any(h == d or h.endswith("." + d) for d in ALLOWED_DOMAINS)


def read_capped(r):
    """Read the body, stopping past MAX_BYTES (a declared size over it is refused up front)."""
    try: declared = int(r.headers.get("content-length") or 0)
    except ValueError: declared = 0   # a malformed header: rely on the streamed count below
    if declared > MAX_BYTES: r.close(); raise RuntimeError(f"{urlsplit(r.url).hostname}: download too large")
    buf = bytearray()
    for chunk in r.iter_content(1 << 16):
        buf += chunk
        if len(buf) > MAX_BYTES: r.close(); raise RuntimeError(f"{urlsplit(r.url).hostname}: download too large")
    r._content = bytes(buf)   # r.content / .text / .json() read this as usual


def get(url, tries=4, headers=None, **kw):
    """GET with retries on network errors and 5xx. `headers` may be a callable, rebuilt on every try."""
    if not allowed(url): raise RuntimeError(f"blocked download from {urlsplit(url).scheme}://{urlsplit(url).hostname}")
    for t in range(tries):
        try:
            r = requests.get(url, timeout=90, headers=headers() if callable(headers) else headers, stream=True, **kw)
            if not allowed(r.url): r.close(); raise RuntimeError(f"blocked redirect to {urlsplit(r.url).hostname}")
            if r.status_code < 500 or t == tries - 1:   # the last 5xx is returned as before; callers check r.ok
                read_capped(r)
                return r
            r.close()
        except requests.RequestException:
            if t == tries - 1: raise
        time.sleep(4 * (t + 1))


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
    # No redirects for the NSW calls: they carry the API key, which requests would forward to another host
    tok = get(f"{host}/oauth/client_credential/accesstoken?grant_type=client_credentials", auth=(key, secret), allow_redirects=False).json()["access_token"]
    hdr = lambda: {"Authorization": "Bearer " + tok, "apikey": key, "transactionid": str(uuid.uuid4()),
                   "requesttimestamp": dt.datetime.now(dt.timezone.utc).strftime("%d/%m/%Y %I:%M:%S %p"),
                   "Content-Type": "application/json; charset=utf-8"}
    r = get(f"{host}/FuelPriceCheck/v1/fuel/prices", headers=hdr, allow_redirects=False)
    j = r.json() if r.ok else {}
    if not (j.get("stations") and len(j.get("prices", [])) > 1000):
        raise RuntimeError(f"NSW prices: HTTP {r.status_code}, {len(r.content)} bytes, {len(j.get('prices', []))} prices")
    name = f"nsw_snapshot_{TODAY}.json"
    open(f"{INBOX}/{name}", "wb").write(r.content)
    return f"{name} ({len(j['prices'])} prices)"


# ---- Brent USD/bbl and AUD/USD, in place of FRED (pull_fred.js), whose terms bar using FRED content to train models.
# The same series from their publishers: Brent spot from the US EIA (FRED's DCOILBRENTEU is this EIA series; EIA cites
# Refinitiv, an LSEG business, as its source) and A$1=USD from the RBA's F11.1 table (source WM/Reuters). Neither is
# relicensed by this repo: see DATA-LICENSE.md. Columns keep FRED's ids
# (DCOILBRENTEU, DEXUSAL) so update.py and model.py read them unchanged; update.py replaces store/fred.csv with it.
EIA_BRENT = "https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls"
EIA_ULSD = "https://www.eia.gov/dnav/pet/hist_xls/EER_EPD2DXL0_PF4_Y35NY_DPGd.xls"   # NY Harbor ULSD spot, USD/gal (diesel crack)
RBA_FX = ["https://www.rba.gov.au/statistics/tables/xls-hist/2018-2022.xls",   # closed years (the file never changes)
          "https://www.rba.gov.au/statistics/tables/csv/f11.1-data.csv"]      # 2023 to date


def rba_usd(t):
    """The FXRUSD (A$1=USD) column of an F11.1 table read with header=None, as a date-indexed Series."""
    import pandas as pd
    first = t.iloc[:, 0].astype(str).str.strip()
    hdr = first[first == "Series ID"].index[0]
    col = next(c for c in t.columns if str(t.at[hdr, c]).strip() == "FXRUSD")
    body = t.loc[hdr + 1:, [t.columns[0], col]]
    raw = body.iloc[:, 0]
    dates = pd.to_datetime(raw.where(raw.map(lambda v: not isinstance(v, str))), errors="coerce")   # xls: datetimes
    dates = dates.fillna(pd.to_datetime(raw.where(raw.map(lambda v: isinstance(v, str))), format="%d-%b-%Y", errors="coerce"))
    s = pd.Series(pd.to_numeric(body.iloc[:, 1], errors="coerce").values, index=dates.values)
    return s[s.index.notna()].dropna()


def pull_macro():
    import pandas as pd
    b = pd.read_excel(io.BytesIO(get(EIA_BRENT, headers=UA).content), sheet_name="Data 1", header=2)
    brent = pd.Series(pd.to_numeric(b.iloc[:, 1], errors="coerce").values, index=pd.to_datetime(b.iloc[:, 0], errors="coerce")).dropna()
    parts = []
    for url in RBA_FX:
        body = get(url, headers=UA).content
        t = (pd.read_excel(io.BytesIO(body), sheet_name=0, header=None) if url.endswith(".xls")
             else pd.read_csv(io.BytesIO(body), header=None, names=range(40), encoding="utf-8-sig", dtype=str))
        parts.append(rba_usd(t))
    aud = pd.concat(parts).sort_index()
    aud = aud[~aud.index.duplicated(keep="last")]
    # Best effort: without it model.py's diesel crack features go blank and diesel falls back to the other features
    ulsd, note = None, ""
    try:
        u = pd.read_excel(io.BytesIO(get(EIA_ULSD, headers=UA).content), sheet_name="Data 1", header=2)
        ulsd = pd.Series(pd.to_numeric(u.iloc[:, 1], errors="coerce").values, index=pd.to_datetime(u.iloc[:, 0], errors="coerce")).dropna()
        ulsd = ulsd[~ulsd.index.duplicated(keep="last")]
        if not 0.5 < ulsd.iloc[-1] < 15: raise RuntimeError(f"implausible {ulsd.iloc[-1]}")
        note = f"; ulsd (EIA) to {ulsd.index[-1].date()} {ulsd.iloc[-1]:g}"
    except Exception as e:
        ulsd, note = None, f"; ulsd skipped: {type(e).__name__}: {str(e)[:100]}"
    F = pd.concat({"DCOILBRENTEU": brent, "DEXUSAL": aud, **({"ULSD_NYH": ulsd} if ulsd is not None else {})}, axis=1).sort_index()
    F = F[F.index >= "2018-06-01"]
    # Don't feed the model a broken parse: plausible ranges, recent data, and the full history back to 2018
    lb, la = brent[brent.index >= "2018-06-01"], aud[aud.index >= "2018-06-01"]
    now = pd.Timestamp.now().normalize()
    if not (20 < lb.iloc[-1] < 400 and 0.3 < la.iloc[-1] < 1.5 and len(lb) > 1500 and len(la) > 1500):
        raise RuntimeError(f"implausible series: brent {lb.iloc[-1]} ({len(lb)} days), aud {la.iloc[-1]} ({len(la)} days)")
    if (now - lb.index[-1]).days > 30 or (now - la.index[-1]).days > 30:
        raise RuntimeError(f"stale series: brent to {lb.index[-1].date()}, aud to {la.index[-1].date()}")
    F.to_csv(f"{INBOX}/brent_audusd_eia_rba.csv", index_label="date")
    return f"brent (EIA) to {lb.index[-1].date()} {lb.iloc[-1]:g}; aud (RBA) to {la.index[-1].date()} {la.iloc[-1]:g}{note}"


# ---- Victoria: Service Victoria Servo Saver Open Data API (24h delayed, no history endpoint), archived once a day to
# archive/vic/ so a Melbourne vs Sydney comparison can be tested later. Not used by the model or published. Licence and
# attribution: DATA-LICENSE.md. Key: env VIC_API_KEY (GitHub secret), else pipeline/credentials.py; limit 10 calls/min.
VIC_API = "https://api.fuel.service.vic.gov.au/open-data/v1/fuel/prices"


def pull_vic():
    import csv, gzip
    key = os.environ.get("VIC_API_KEY")
    if not key:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try: import credentials as c; key = getattr(c, "VIC_API_KEY", None) or getattr(c, "VIC_CONSUMER_ID", None)
        except ImportError: pass
    if not key: return "skipped (no VIC_API_KEY)"
    out = f"{BASE}/archive/vic"; path = f"{out}/vic_prices_{TODAY}.csv.gz"
    if os.path.exists(path): return "already archived today"
    r = get(VIC_API, tries=2, headers=lambda: {"User-Agent": "Bowser/1.0 (FuelForecast)", "x-consumer-id": key,
                                            "x-transactionid": str(uuid.uuid4())}, allow_redirects=False)
    if not r.ok: raise RuntimeError(f"HTTP {r.status_code}")
    d = r.json().get("fuelPriceDetails", [])
    if len(d) < 1000: raise RuntimeError(f"only {len(d)} stations")
    os.makedirs(out, exist_ok=True)
    st = [s.get("fuelStation") or {} for s in d]
    def write(name, header, rows):   # temp file then rename: a failed write must not leave a file that blocks the day
        tmp = f"{out}/{name}.tmp"
        with open(tmp, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz, io.TextIOWrapper(gz, newline="") as fh:
            w = csv.writer(fh); w.writerow(header); w.writerows(rows)   # mtime=0: an unchanged station list is byte-identical
        os.replace(tmp, f"{out}/{name}")
    write("vic_stations.csv.gz", ["station_id", "name", "brand_id", "address", "lat", "lon"],   # latest list, overwritten
          [[s.get(k) for k in ["id", "name", "brandId", "address"]] + [(s.get("location") or {}).get(k) for k in ["latitude", "longitude"]]
           for s in st if s.get("id")])
    write(os.path.basename(path), ["station_id", "fuel", "price", "available", "updated_at"],
          [[s.get("id"), p.get("fuelType"), p.get("price"), int(bool(p.get("isAvailable"))), p.get("updatedAt")]
           for s, x in zip(st, d) if s.get("id") for p in x.get("fuelPrices") or []])
    return f"{len(d)} stations -> {os.path.basename(path)}"


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


def lacks_fuel(k):
    """A stored monthly extract made before a fuel joined FUELS (P95 in 2026-10): pull that month again."""
    fn = f"{BASE}/store/events/syd_events_{k // 12}{k % 12 + 1:02d}.csv"
    if not os.path.exists(fn): return False
    with open(fn) as fh: have = {line.split(",")[1] for line in fh if line.count(",") == 4}
    return not set(FUELS) <= have


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
        # recent months only, so a month NSW really published without a fuel isn't fetched again forever
        if (k > last_k or (k > last_k - 3 and lacks_fuel(k))) and k not in want: want[k] = x["url"]
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


for name, fn, required in [("nsw", pull_nsw, True), ("macro", pull_macro, False), ("aip", pull_aip, False), ("history", pull_history, False),
                           ("vic", pull_vic, False)]:
    try:
        log.append(f"{name}: {fn()}")
    except Exception as e:
        log.append(f"{name}: FAILED {type(e).__name__}: {str(e)[:200]}")
        if required: failed.append(name)
print("\n".join(log))
sys.exit(1 if failed else 0)
