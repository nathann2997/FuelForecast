import numpy as np, pandas as pd, json
A=pd.read_parquet('daily_region.parquet'); T=pd.read_csv('tgp_sydney.csv',parse_dates=['date']).set_index('date')
S=lambda r,f: A[(A.region==r)&(A.fuel==f)].set_index('date')
syd=S('Sydney','U91'); reg=S('Regional NSW','U91'); nsw=S('NSW','U91'); dl=S('NSW','DL'); e10=S('NSW','E10'); p98=S('NSW','P98'); sdl=S('Sydney','DL')
tg=T.tgp_ulp.reindex(syd.index); tgd=T.tgp_dl.reindex(sdl.index)
m=syd['median']-tg; md=sdl['median']-tgd
print('Sydney U91 margin over TGP: mean %.1f, p10 %.1f, p90 %.1f'%(m.mean(),m.quantile(.1),m.quantile(.9)))
print('margin by month\n',m.groupby(m.index.to_period('M')).mean().round(1).to_string())
print('Sydney DL margin by month\n',md.groupby(md.index.to_period('M')).mean().round(1).to_string())
# restorations: Sydney median rises >=8c within 3 days, separated by >=10 days
s=syd['median']; rise=(s-s.shift(3))>=8
starts=[];last=None
for d,v in rise.items():
    if v and (last is None or (d-last).days>=10): starts.append(d)
    if v: last=d
starts=pd.Series(starts); gaps=starts.diff().dt.days
print('restorations',len(starts),list(starts.dt.date)); print('gap days',gaps.describe().round(1).to_dict())
amp=[(s[d:d+pd.Timedelta(days=5)].max()-s[d-pd.Timedelta(days=4):d].min()) for d in starts]
print('amplitude', np.round(amp,1), 'mean', np.mean(amp).round(1))
# position in cycle: cheapest days before restoration
# day of week effect: deviation from centered 7d mean (calm months only)
calm=s[(s.index<'2026-03-01')]
dev=(calm-calm.rolling(7,center=True).mean()).groupby(calm.index.dayofweek).mean()
print('Sydney DOW deviation (calm, Mon=0)\n',dev.round(2).to_string())
# hike dow from panel events
P=pd.read_parquet('panel.parquet',columns=['date','fuel','region','up','down','price','brand','station','postcode','suburb'])
ps=P[(P.fuel=='U91')&(P.region=='Sydney')]
h=ps[ps.up].groupby(ps[ps.up].date.dt.dayofweek).size(); print('Sydney U91 station hikes by DOW\n',(h/h.sum()).round(3).to_string())
# shopping around
print('Sydney median-p10 mean %.1f ; regional %.1f'%((syd['median']-syd.p10).mean(),(reg['median']-reg.p10).mean()))
print('Sydney p90-p10 mean %.1f'%((syd.p90-syd.p10).mean()))
# Sydney vs regional
g=(syd['median']-reg['median']); print('Syd-Reg gap mean %.1f, share days Syd cheaper %.2f'%(g.mean(),(g<0).mean()))
print('Reg volatility (sd daily chg) %.2f vs Syd %.2f'%(reg['median'].diff().std(), s.diff().std()))
# E10/P98 premiums & diesel gap
print('E10 discount vs U91 %.1f ; P98 premium %.1f'%((nsw['median']-e10['median']).mean(),(p98['median']-nsw['median']).mean()))
dg=(dl['median']-nsw['median']); print('Diesel-U91 gap by month\n',dg.groupby(dg.index.to_period('M')).mean().round(1).to_string())
# rockets & feathers: response of Sydney weekly avg retail to weekly TGP change
W=pd.DataFrame({'r':s,'t':tg}).resample('W').mean().diff().dropna()
for k in [0,1,2]:
    pass
up=W[W.t>1]; dn=W[W.t<-1]
X=pd.DataFrame({'r':s,'t':tg})
X['t_ch14']=X.t-X.t.shift(14); X['r_ch14_fwd']=X.r.shift(-7).rolling(7).mean()-X.r.rolling(7).mean().shift(14)
# pass-through after wholesale moves: cum change over 21 days following a TGP move of >=5c in 7 days
ev=[]
tt=T.tgp_ulp
for d in pd.date_range('2025-10-08','2026-08-10'):
    ch=tt.get(d,np.nan)-tt.get(d-pd.Timedelta(days=7),np.nan)
    if abs(ch)>=5:
        r0=s.get(d-pd.Timedelta(days=7)); 
        if r0 is None: continue
        ev.append(dict(date=d,tgp=ch,r7=s.get(d)-r0,r14=s.get(d+pd.Timedelta(days=7),np.nan)-r0,r21=s.get(d+pd.Timedelta(days=14),np.nan)-r0))
E=pd.DataFrame(ev)
for sign,g2 in E.groupby(E.tgp>0):
    print('TGP up' if sign else 'TGP down', len(g2), 'pass-through ratio 0d %.2f 7d %.2f 14d %.2f'%((g2.r7/g2.tgp).median(),(g2.r14/g2.tgp).median(),(g2.r21/g2.tgp).median()))
# excise cut
for d in ['2026-03-31','2026-04-07','2026-04-14','2026-04-21','2026-04-28']:
    print(d, 'syd',round(s[d],1),'tgp',tg[d], 'syd DL', round(sdl['median'][d],1), T.tgp_dl[d])
for d in ['2026-06-30','2026-07-07','2026-07-14','2026-08-02','2026-08-10','2026-08-17']:
    print(d, 'syd',round(s[d],1),'tgp',tg[d])
# brands (last 120 days, Sydney U91 premium vs daily Sydney median)
last=ps[ps.date>=ps.date.max()-pd.Timedelta(days=120)].merge(syd['median'].rename('med'),left_on='date',right_index=True)
last['prem']=last.price-last.med
b=last.groupby('brand').agg(stations=('station','nunique'),prem=('prem','mean')).query('stations>=10').sort_values('prem')
print(b.round(1).to_string())
