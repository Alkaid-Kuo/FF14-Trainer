import json, re, sys
SRC=sys.argv[1]   # 攻略的 frames.json
d=json.load(open(SRC,encoding='utf-8'))
R=20.0
JOB={'战':0,'骑':1,'白':2,'学':3,'龙':4,'忍':5,'诗':6,'召':7}
KEY=['MT','OT','H1','H2','M1','M2','R','C']
def sec(ts):
    m=re.match(r'(\d+)：(\d+)',ts)
    return int(m.group(1))*60+int(m.group(2)) if m else None
out={}
for page in ('p3a','p3b'):
    for i,f in enumerate(d[page]):
        fid='%s-F%02d'%(page.upper(),i+1)
        ts=[sec(t) for t in f['text'].get('timestamps',[]) if sec(t) is not None]
        pos={}
        for r in f.get('roles',[]):
            k=JOB.get(r.get('text'))
            if k is None: continue
            pos[KEY[k]]=[round(r['pos'][0]*R,1), round(r['pos'][1]*R,1)]
        ents={}
        for e in f.get('entities',[]):
            n=e.get('text') or '?'
            k=n; j=2
            while k in ents: k='%s#%d'%(n,j); j+=1
            ents[k]=[round(e['pos'][0]*R,1), round(e['pos'][1]*R,1)]
        out[fid]={'t':ts[0] if ts else None,'pos':pos,'ents':ents,'marks':{}, 'arena': (f.get('arena') or {}).get('img'), 'same': bool(f.get('same_band_as_previous'))}
json.dump(out,open('frames_p3.json','w',encoding='utf-8'),ensure_ascii=False)
for fid,fr in out.items():
    s=' '.join('%s(%.1f,%.1f)'%(k,*fr['pos'][k]) for k in KEY if k in fr['pos'])
    e=' | '.join('%s(%.1f,%.1f)'%(k,*v) for k,v in fr['ents'].items())
    print(fid,'t=%s'%fr['t'],'same' if fr['same'] else '',fr['arena'],'\n   ',s,'\n    ents:',e)
