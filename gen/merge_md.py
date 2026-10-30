"""把 extract_md.py 產生的 frames_md.json（P4／P5）併入 src/frames.js。"""
import json, re
p = '../src/frames.js'
s = open(p, encoding='utf-8').read()
m = re.search(r'root\.UWU\.FRAMES = (\{.*\});', s, re.S)
fr = json.loads(m.group(1))
md = json.load(open('frames_md.json', encoding='utf-8'))
n = 0
for k, v in md.items():
    if v.get('same') or not v['pos']:
        continue
    fr[k] = {'t': v['t'], 'pos': v['pos'], 'ents': v['ents'], 'marks': v['marks']}
    n += 1
s = s[:m.start(1)] + json.dumps(fr, ensure_ascii=False, separators=(',', ':')) + s[m.end(1):]
open(p, 'w', encoding='utf-8').write(s)
print('added', n, 'total', len(fr))
