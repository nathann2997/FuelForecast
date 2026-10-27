"""The fuels the pipeline tracks, in display order. Every pipeline script imports this list. Own copies to change
with it: pull_history.js, station_profile.py (petrol list), template.html, share.html, and in app/src: lib/types.ts, format.ts,
settings.ts, fills.ts, components/ui.tsx, app/savings.tsx, app/station/[id].tsx, widget/logic.ts.
E85, LPG, PDL and B20 are in the NSW feed but left out (E85: 17 Sydney stations, too few to forecast).
"""
FUELS = ["U91", "E10", "P95", "P98", "DL"]
