"""從攻略的結構化 Markdown 擷取 P4／P5 的站位（上傳的 frames.json 只有 P1～P3）。
用法：python3 extract_md.py 攻略.md   → 寫出 frames_md.json（格式同 frames_p3.json），再用 merge_md.py 併入 src/frames.js。
座標：1.0 = 場地半徑 = 20 yalm；x 東、z 南。集中的人群有「個別」座標就用個別座標，否則用中心。"""
import json, re, sys
SRC = sys.argv[1]
R = 20.0
JOB = {'战': 'MT', '骑': 'OT', '白': 'H1', '学': 'H2', '龙': 'M1', '忍': 'M2', '诗': 'R', '召': 'C'}
PAGES = ('P4A', 'P4B', 'P4C', 'P4D', 'P5')
NUM = r'([+-]?\d+\.\d+)'
XY = re.compile(r'\(' + NUM + ',' + NUM + r'\)')

def sec(ts):
    m = re.search(r'(\d+)：(\d+)', ts)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None

def xy(m):
    return [round(float(m.group(1)) * R, 1), round(float(m.group(2)) * R, 1)]

out = {}
cur = None
block = None
for line in open(SRC, encoding='utf-8'):
    line = line.rstrip('\n')
    h = re.match(r'## (P[45][A-D]?-F\d+)\s*(.*)', line)
    if h:
        fid = h.group(1)
        cur = None
        if fid.split('-')[0] in PAGES:
            cur = {'t': sec(h.group(2)), 'pos': {}, 'ents': {}, 'marks': {}, 'same': False}
            out[fid] = cur
        block = None
        continue
    if line.startswith('# '):
        cur = None
        continue
    if cur is None:
        continue
    if line.startswith('_（與上一張圖同一列'):
        cur['same'] = True
    if line.startswith('**'):
        block = 'roles' if line.startswith('**角色站位') else 'ents' if line.startswith('**BOSS') else 'marks' if line.startswith('**標點') else None
        if block == 'marks':
            for k, x, z in re.findall(r'([A-D1-9]) \(' + NUM + ',' + NUM + r'\)', line):
                cur['marks'][k] = [round(float(x) * R, 1), round(float(z) * R, 1)]
        continue
    if not line.startswith('- '):
        continue
    body = line[2:]
    if block == 'roles':
        m = re.match(r'〔集中 \d+ 人〕(.*?)：中心 ' + XY.pattern, body)
        if m:
            jobs = re.findall(r'(.)\([THD]\)', m.group(1))
            center = [round(float(m.group(2)) * R, 1), round(float(m.group(3)) * R, 1)]
            indiv = {}
            if '個別：' in body:
                for j, x, z in re.findall(r'(.)\(' + NUM + ',' + NUM + r'\)', body.split('個別：', 1)[1]):
                    indiv[j] = [round(float(x) * R, 1), round(float(z) * R, 1)]
            for j in jobs:
                if j in JOB:
                    cur['pos'][JOB[j]] = indiv.get(j, center)
            continue
        m = re.match(r'(.)\([THD]\)：' + XY.pattern, body)
        if m and m.group(1) in JOB:
            cur['pos'][JOB[m.group(1)]] = [round(float(m.group(2)) * R, 1), round(float(m.group(3)) * R, 1)]
    elif block == 'ents':
        m = re.match(r'(.+?)：' + XY.pattern, body)
        if m:
            n = m.group(1)
            k, i = n, 2
            while k in cur['ents']:
                k = '%s#%d' % (n, i); i += 1
            cur['ents'][k] = [round(float(m.group(2)) * R, 1), round(float(m.group(3)) * R, 1)]

json.dump(out, open('frames_md.json', 'w', encoding='utf-8'), ensure_ascii=False)
KEY = ['MT', 'OT', 'H1', 'H2', 'M1', 'M2', 'R', 'C']
for fid, fr in out.items():
    s = ' '.join('%s(%.1f,%.1f)' % (k, *fr['pos'][k]) for k in KEY if k in fr['pos'])
    e = ' | '.join('%s(%.1f,%.1f)' % (k, *v) for k, v in fr['ents'].items())
    print(fid, 't=%s' % fr['t'], 'same' if fr['same'] else '', ('marks=' + json.dumps(fr['marks'], ensure_ascii=False)) if fr['marks'] else '', '\n   ', s, '\n    ents:', e)
