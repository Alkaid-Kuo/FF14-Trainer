import json, re
p='../src/frames.js'
s=open(p,encoding='utf-8').read()
m=re.search(r'root\.UWU\.FRAMES = (\{.*\});', s, re.S)
fr=json.loads(m.group(1))
p3=json.load(open('frames_p3.json',encoding='utf-8'))
n=0
for k,v in p3.items():
    if v.get('same') or not v['pos']: continue
    fr[k]={'t':v['t'],'pos':v['pos'],'ents':v['ents'],'marks':{}}
    n+=1
s=s[:m.start(1)]+json.dumps(fr,ensure_ascii=False,separators=(',',':'))+s[m.end(1):]
open(p,'w',encoding='utf-8').write(s)
print('added',n,'total',len(fr))
