"""Load NSW FuelCheck monthly price-change history into one clean event table."""
import glob, re, json
import pandas as pd

SRC = "/mnt/user-data/uploads/Downloads"
FUELS = ["U91", "E10", "P95", "P98", "DL", "PDL", "LPG"]

frames = []
for f in sorted(glob.glob(f"{SRC}/nswfuel_*pricehistory*") + glob.glob(f"{SRC}/nswfuel_price_history*")):
    if f.endswith(".csv"):
        d = pd.read_csv(f, encoding="utf-8-sig", dtype=str)
    else:
        d = pd.read_excel(f, dtype={"Postcode": str}, engine="openpyxl")
    d.columns = [c.strip() for c in d.columns]
    t = d["PriceUpdatedDate"]
    if not pd.api.types.is_datetime64_any_dtype(t):
        t = t.astype(str)
        iso = t.str.match(r"^\d{4}-")
        out = pd.Series(pd.NaT, index=t.index)
        out[iso] = pd.to_datetime(t[iso], errors="coerce")
        out[~iso] = pd.to_datetime(t[~iso], dayfirst=True, errors="coerce")
        t = out
    d["ts"] = t
    d["src"] = re.sub(r".*/|\s*\(\d\)", "", f)
    frames.append(d)
    print(d["src"].iloc[0], len(d), d.ts.min(), d.ts.max())

ev = pd.concat(frames, ignore_index=True)
ev = ev.rename(columns={"ServiceStationName": "name", "Address": "address", "Suburb": "suburb",
                        "Postcode": "postcode", "Brand": "brand", "FuelCode": "fuel", "Price": "price"})
ev["price"] = pd.to_numeric(ev.price, errors="coerce")
ev["postcode"] = pd.to_numeric(ev.postcode, errors="coerce").astype("Int64")
ev = ev[ev.fuel.isin(FUELS) & ev.ts.notna() & ev.price.between(50, 600)]
ev["station"] = ev.address.str.upper().str.replace(r"\s+", " ", regex=True).str.strip()
ev = ev.drop_duplicates(["station", "fuel", "ts", "price"]).sort_values(["station", "fuel", "ts"])


def region(pc):
    if pc is pd.NA or pd.isna(pc):
        return "REG"
    pc = int(pc)
    if 2000 <= pc <= 2234 or 2555 <= pc <= 2574 or 2740 <= pc <= 2786:
        return "Sydney"
    if 2250 <= pc <= 2263:
        return "Central Coast"
    if 2264 <= pc <= 2327:
        return "Newcastle & Hunter"
    if 2500 <= pc <= 2533:
        return "Illawarra"
    return "Regional NSW"


ev["region"] = ev.postcode.map(region)
ev["brand"] = ev.brand.fillna("Independent").str.strip()
ev[["station", "name", "suburb", "postcode", "brand", "region", "fuel", "ts", "price", "src"]].to_parquet(
    "/home/claude/fuel/events.parquet", index=False)
print("events", len(ev), "stations", ev.station.nunique(), ev.ts.min(), ev.ts.max())
print(ev.groupby(ev.ts.dt.to_period("M")).size())
