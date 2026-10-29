# Data licence and sources

This covers the fuel price data in this repository (`sydney/store`, `sydney/archive`, the `data` branch) and the JSON API published on GitHub Pages (`/api/v1/`). It does not cover the source code.

## NSW FuelCheck data: CC BY-SA 3.0 AU

Contains NSW Government FuelCheck data © State of New South Wales (NSW Fair Trading, Department of Customer Service), from the FuelCheck API (API.NSW) and the FuelCheck price history on [data.nsw.gov.au](https://data.nsw.gov.au/data/dataset/fuel-check). It is licensed under [Creative Commons Attribution-ShareAlike 3.0 Australia](https://creativecommons.org/licenses/by-sa/3.0/au/).

Bowser adapts this data: it filters it to Sydney, computes medians and percentiles, adds per-station advice and forecasts, and reformats it. As the licence requires, these adapted datasets are released under the same licence, CC BY-SA 3.0 AU, and must be attributed as above. The NSW Government does not endorse Bowser or its forecasts.

## Other sources

| Data | Publisher | Terms |
|---|---|---|
| Terminal gate prices (wholesale) | Australian Institute of Petroleum | © AIP, all rights reserved. **Not licensed under CC BY-SA.** Covers `history.json` `tgp`, `forecast.json` `live[].tgp`, `live[].margin`, `stats.margin_now` and `stats.margin_typ`, and `sydney/store/tgp.csv` |
| Brent crude spot price (RBRTE) | U.S. Energy Information Administration, which cites Refinitiv (an LSEG business) as its source | Subject to [EIA's copyright and reuse policy](https://www.eia.gov/about/copyrights_reuse.php) and the vendor's rights. **Not licensed under CC BY-SA.** Covers `forecast.json` `ctx.brent_usd` and `ctx.brent_aud`, and the `DCOILBRENTEU` column of `store/fred.csv` |
| AUD/USD exchange rate (F11.1, FXRUSD) | Reserve Bank of Australia, which gives WM/Reuters as the source | Third-party data under the [RBA copyright notice](https://www.rba.gov.au/copyright/). **Not licensed under CC BY-SA.** Covers `forecast.json` `ctx.audusd` and the `DEXUSAL` column of `store/fred.csv` |
| NY Harbor ULSD spot price (EER_EPD2DXL0_PF4_Y35NY_DPG) | U.S. Energy Information Administration | Subject to [EIA's copyright and reuse policy](https://www.eia.gov/about/copyrights_reuse.php). **Not licensed under CC BY-SA.** Used only as a model input for diesel (the `ULSD_NYH` column of `store/fred.csv`); not published |
| Victorian fuel prices (Servo Saver Open Data API, 24 hours delayed) | © State of Victoria, accessed via the Victorian Government Service Victoria Platform | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and the Servo Saver Public API Terms and Acceptable Use Policy. Credit Service Victoria as the source, don't imply endorsement, and don't alter the data before presenting it. Archived daily on the `data` branch (`archive/vic/`); not used by the model or published |

The forecasts are model outputs trained partly on the AIP, Brent, AUD/USD and (for diesel) ULSD series. Neither the RBA nor any other publisher endorses this use.

The GitHub Actions pipeline (`sydney/pipeline/fetch.py`) takes Brent and AUD/USD from the EIA and the RBA. The Claude scheduled task's Chrome pull (`pull_fred.js`) still downloads them from FRED, so `main`'s `sydney/store/fred.csv` holds FRED-sourced values. Despite its name, the `data` branch's `store/fred.csv` holds EIA and RBA values from the first pipeline run after this change.

Forecasts are estimates for planning, not financial advice. All data is provided as is, without warranty.
