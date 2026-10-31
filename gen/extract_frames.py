import json, re, sys
SRC=sys.argv[1]   # 攻略的 frames.json
d=json.load(open(SRC,encoding='utf-8'))
R=20.0
JOB={'战':0,'骑':1,'白':2,'学':3,'龙':4,'忍':5,'诗':6,'召':7}
KEY=['MT','OT','H1','H2','D1','D2','D3','D4']
def sec(ts):
    m=re.match(r'(\d+)：(\d+)',ts)
    return int(m.group(1))*60+int(m.group(2)) if m else None
out={}
for page in ('p1','p2a','p2b'):
    frames=[]
    for i,f in enumerate(d[page]):
        ts=[sec(t) for t in f['text'].get('timestamps',[]) if sec(t) is not None]
        pos={}
        for r in f.get('roles',[]):
            k=JOB.get(r.get('text'))
            if k is None: continue
            pos[KEY[k]]=[round(r['pos'][0]*R,1), round(r['pos'][1]*R,1)]
        ents=[{'n':e.get('text'),'p':[round(e['pos'][0]*R,1),round(e['pos'][1]*R,1)]} for e in f.get('entities',[])]
        marks=[{'n':m.get('text'),'p':[round(m['pos'][0]*R,1),round(m['pos'][1]*R,1)]} for m in f.get('marks',[]) if m.get('text') not in ('A','B','C','D','1')]
        frames.append({'id':'%s-F%02d'%(page.upper(),i+1),'ts':ts,'t0':ts[0] if ts else None,'pos':pos,'ents':ents,'marks':marks})
    out[page]=frames
json.dump(out,open('frames_compact.json','w',encoding='utf-8'),ensure_ascii=False)
# print table
for page in ('p1',):
    for fr in out[page]:
        if not fr['pos']: continue
        t=fr['t0']
        s=' '.join('%s(%.1f,%.1f)'%(k,*fr['pos'][k]) for k in KEY if k in fr['pos'])
        e=' | '.join('%s(%.1f,%.1f)'%(x['n'],*x['p']) for x in fr['ents'])
        print(fr['id'], 't=%s'%t, s)
        if e: print('     ents:',e)
