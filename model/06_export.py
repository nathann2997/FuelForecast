import json, numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score
A=pd.read_parquet('daily_region.parquet'); T=pd.read_csv('tgp_sydney.csv',parse_dates=['date']).set_index('date')
L=pd.read_csv('live_forecast.csv'); R=pd.read_csv('backtest_v2.csv'); BP=pd.read_parquet('backtest_preds.parquet'); C=pd.read_parquet('backtest_cls.parquet')
SP=pd.read_parquet('snapshot_prices.parquet'); P=pd.read_parquet('panel.parquet',columns=['date','fuel','region','price','station','postcode','brand'])
r1=lambda v: None if pd.isna(v) else round(float(v),1)
out={}
# history
hist={}
for r,f in [('Sydney','U91'),('Regional NSW','U91'),('NSW','U91'),('Sydney','DL'),('NSW','DL'),('Regional NSW','DL'),('Sydney','E10'),('Sydney','P98'),('NSW','E10'),('NSW','P98'),('Newcastle & Hunter','U91'),('Illawarra','U91'),('Central Coast','U91'),('Newcastle & Hunter','DL')]:
    s=A[(A.region==r)&(A.fuel==f)].set_index('date')
    hist[f'{r}|{f}']={'med':[r1(v) for v in s['median']],'p10':[r1(v) for v in s.p10],'p90':[r1(v) for v in s.p90]}
d0=A.date.min(); dates=pd.date_range(d0,A.date.max())
out['hist_start']=str(d0.date()); out['hist']=hist
tg=T.loc['2025-10-01':'2026-10-09']
out['tgp']={'start':'2025-10-01','ulp':[r1(v) for v in tg.tgp_ulp],'dl':[r1(v) for v in tg.tgp_dl]}
out['live']=L.to_dict(orient='records'); out['asof']='2026-10-13'
# backtest Sydney U91 h7
b=BP[(BP.series=='Sydney|U91')&(BP.h==7)].sort_values('date')
out['bt']={'dates':[str(d.date()) for d in b.date],'actual':[r1(v) for v in b.actual],'pred':[r1(v) for v in b.pA],'lo':[r1(v) for v in b.lo],'hi':[r1(v) for v in b.hi]}
w=lambda d,c: float(np.average(d[c].fillna(d['naive']),weights=d.n))
out['bt_all']=[{'h':int(h),'naive':round(w(d,'naive'),2),'ridge':round(w(d,'ridge'),2),'model':round(w(d,'A'),2),'momentum':round(w(d,'B'),2),'dir':round(float(np.nanmean(d.dirA)),2),'cover':round(float(np.average(d.cover,weights=d.n)),2)} for h,d in R.groupby('h')]
out['bt_syd']=[{'h':int(h),'naive':round(d.naive.mean(),2),'model':round(d.A.mean(),2),'dir':round(float(np.nanmean(d.dirA)),2)} for h,d in R[R.series=='Sydney|U91'].groupby('h')]
out['bt_month']=[{'m':m,'naive':round(w(d,'naive'),2),'model':round(w(d,'A'),2)} for m,d in R[R.h==7].groupby('month')]
c=C.dropna(subset=['y']); cs=c[c.series=='Sydney|U91']
out['auc']={'all':round(roc_auc_score(c.y,c.p),2),'syd':round(roc_auc_score(cs.y,cs.p),2)}
# brands Sydney U91 last 120d
syd=A[(A.region=='Sydney')&(A.fuel=='U91')].set_index('date')['median']
ps=P[(P.fuel=='U91')&(P.region=='Sydney')&(P.date>=P.date.max()-pd.Timedelta(days=120))].merge(syd.rename('med'),left_on='date',right_index=True)
ps['prem']=ps.price-ps.med
b=ps.groupby('brand').agg(stations=('station','nunique'),prem=('prem','mean')).query('stations>=10').sort_values('prem')
out['brands']=[{'brand':k,'stations':int(v.stations),'prem':r1(v.prem)} for k,v in b.iterrows()]
# suburbs today
sub=[]
for (pc),g in SP[SP.fueltype=='U91'].groupby('postcode'):
    g=g.sort_values('price'); dl=SP[(SP.fueltype=='DL')&(SP.postcode==pc)].sort_values('price')
    sub.append({'pc':int(pc),'sub':str(g.suburb.mode().iloc[0]).title() if g.suburb.notna().any() else '','reg':g.region.iloc[0],'n':int(len(g)),
      'med':r1(g.price.median()),'min':r1(g.price.iloc[0]),'minName':g.name.iloc[0],'minAge':int(g.age.iloc[0]),
      'dlmin':r1(dl.price.iloc[0]) if len(dl) else None,'dlName':dl.name.iloc[0] if len(dl) else None})
out['suburbs']=sub
json.dump(out,open('dash_data.json','w'),separators=(',',':'))
print(len(json.dumps(out))//1024,'KB', len(sub),'postcodes')
