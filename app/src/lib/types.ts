// Shapes of the static API published by the daily GitHub Actions run (sydney/pipeline/export_api.py).

export type Fuel = 'U91' | 'E10' | 'P98' | 'DL';

export type Meta = {
  schema: number;
  generated_at: string;
  license?: { name: string; url: string; attribution: string; excluded: string; sources: { name: string; publisher: string; terms: string; url: string }[] };
  asof: string;
  stations_asof: string;
  tgp_last: string | null;
  fred_last: string | null;     // Brent and AUD/USD (EIA and RBA since 0.6.0; the key keeps its FRED-era name)
  history_last: string | null;
  live_model: string | null;
  snapshot_days: number | null;
  warnings: string[];
  files: Record<string, number>;
};

/** Added to every API file by export_api.py from 0.6.0 (absent in older files): when it was built, UTC ISO time */
export type Stamp = { generated_at?: string; attribution?: string; license_note?: string };

export type VerdictCls = 'up' | 'down' | 'flat';

export type LiveRow = {
  fuel: Fuel;
  now: number;
  p10: number;
  p90: number;
  tgp: number;
  margin: number;
  d1: number; lo1: number; hi1: number;
  d3: number; lo3: number; hi3: number;
  d7: number; lo7: number; hi7: number;
  d14: number; lo14: number; hi14: number;
  p_jump7: number;
  verdict: { cls: VerdictCls; head: string };
};

export type Ctx = {
  asof: string;
  tgp_last: string | null;
  fred_last: string | null;
  brent_aud: number | null;
  brent_usd: number | null;
  audusd: number | null;
  history_last: string | null;
  live_model: string | null;
  snapshot_days: number | null;
};

export type Stats = {
  cycles_by_year: { year: number | null; n: number | null; gap: number | null; amp: number | null }[];
  cycle_gap_calm: number | null;
  cycle_amp_calm: number | null;
  last_restore: string | null;
  dow: (number | null)[];
  shop_around: number | null;
  p98_prem: number | null;
  e10_disc: number | null;
  dl_gap_now: number | null;
  dl_gap_2019_25: number | null;
  margin_now: number | null;
  margin_typ: number | null;
  low_2019: number | null;
  high_all: number | null;
  high_date: string | null;
};

export type BacktestRow = Record<string, number> & { naive: number; naive_shock: number; model_shock: number; dir: number };

export type Backtest = {
  summary: Record<string, BacktestRow>;   // key "U91|7"
  auc: Record<Fuel, number>;
  prod: string;                            // key into BacktestRow for the production model's MAE
  test_from: string;
  test_to: string;
  bt7: { dates: string[]; actual: number[]; pred: number[] };
};

export type Forecast = Stamp & {
  schema: number;
  asof: string;
  live: LiveRow[];
  ctx: Ctx;
  stats: Stats;
  brands: { brand: string; n: number; prem: number }[];
  bt: Backtest;
};

export type AdviceCode = 'now' | 'by' | 'ok' | 'wait' | 'hi' | 'any' | 'chk';
// [price c/L, days since update, advice code, advice label, advice reason]
export type StationPrice = [number, number | null, AdviceCode, string, string, number?];   // [5]: 7-day forecast price c/L (fc.now + fc.d7), absent if the station files failed

export type Station = {
  id: string;     // NSW FuelCheck station code, stable across days (key for pins and station/{id}.json)
  n: string;      // name
  b: string;      // brand
  s: string;      // suburb
  pc: number;     // postcode
  la: number;
  lo: number;
  m: 0 | 1;       // members only
  p: Partial<Record<Fuel, StationPrice>>;
};

export type Suburb = { s: string; pc: number; la: number; lo: number; n: number };

export type Stations = Stamp & {
  schema: number;
  asof: string;
  stations: Station[];
  suburbs: Suburb[];
};

export type Series = (number | null)[];

export type History = Stamp & {
  schema: number;
  start: string;
  hist: Record<Fuel, { med: Series; p10: Series; p90: Series }>;
  tgp: { ulp: Series; dl: Series };
};

// ---- station/{id}.json: one station's price history and its own forecast (the "ticker" page and the widget)
export type StationForecast = {
  now: number;                    // today's price at this station, c/L
  d1: number; lo1: number; hi1: number;     // expected change vs now (c/L) and 80% range, as LiveRow but for this station
  d3: number; lo3: number; hi3: number;
  d7: number; lo7: number; hi7: number;
  d14: number; lo14: number; hi14: number;
  rise: string | null;            // ISO date this station is likely to rise from (Sydney rise date shifted by its lag), null if none in 14 days
  adv: [AdviceCode, string, string];        // same advice as stations.json [code, label, reason]
};

export type StationProfile = {
  typ: Partial<Record<Fuel, number>>;       // typical premium vs the Sydney median, last 365 days (c/L, negative = cheaper)
  lag: number | null;             // median hours after a price-jump wave starts before this station hikes
  part: number | null;            // share of jump waves it joined (0..1; low = steady pricer)
  n: number;                      // waves observed
};

export type StationDetail = Stamp & {
  schema: number;
  asof: string;
  id: string;
  n: string; b: string; s: string; pc: number; la: number; lo: number; m: 0 | 1;
  addr: string | null;
  start: string;                  // ISO date of hist[*][0]
  hist: Partial<Record<Fuel, Series>>;      // end-of-day price c/L per day from start to asof, null = not sold / unknown
  profile: StationProfile | null;
  fc: Partial<Record<Fuel, StationForecast>>;
};
