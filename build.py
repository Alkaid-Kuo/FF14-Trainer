"""把 src/ 與 vendor/three.min.js 打包成單一 HTML（server/public/index.html）：python3 build.py [另存路徑]"""
import os, sys
root = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(root, *p), encoding='utf-8').read()
html = rd('src', 'index.template.html')
parts = [('/*__CSS__*/', rd('src', 'style.css')), ('/*__THREE__*/', rd('vendor', 'three.min.js'))]
scripts = ''.join('<script>\n%s\n</script>\n' % rd('src', f) for f in ['core.js', 'skills.js', 'frames.js', 'p1.js', 'p2.js', 'p3.js', 'audio.js', 'icons.js', 'models.js', 'render2d.js', 'render3d.js', 'net.js', 'ui.js'])
for key, val in parts:
    assert html.count(key) == 1, key
    html = html.replace(key, val)
# 以 <!--__SCRIPTS__--> 取代原本的 script 區塊
start = html.index('<script>\n/*__SIM__*/')
end = html.index('</body>')
html = html[:start] + '<!--__SCRIPTS__-->\n' + html[end:]
html = html.replace('<!--__SCRIPTS__-->\n', scripts, 1)
# 網頁放在伺服器的 public/（部署到 Cloudflare 後用網址開）；另外指定路徑時再多存一份
os.makedirs(os.path.join(root, 'server', 'public'), exist_ok=True)
open(os.path.join(root, 'server', 'public', 'index.html'), 'w', encoding='utf-8').write(html)
if len(sys.argv) > 1: open(sys.argv[1], 'w', encoding='utf-8').write(html)
print('built server/public/index.html', len(html) // 1024, 'KB' + ('（另存 %s）' % sys.argv[1] if len(sys.argv) > 1 else ''))
