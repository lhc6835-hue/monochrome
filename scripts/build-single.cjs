// 단일 HTML 빌드: dist/ 의 JS, CSS, 글꼴, 효과음을 한 파일에 모두 넣는다.
// 사용: npm run build && node scripts/build-single.cjs [출력 경로]
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const out = process.argv[2] || path.join(dist, 'the-monochrome.html');

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const assets = path.join(dist, 'assets');

// CSS: 글꼴 url() 을 data URI 로 바꿔 인라인
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/, (_, f) => {
  let css = fs.readFileSync(path.join(assets, f), 'utf8');
  css = css.replace(/url\(\.?\/?(?:assets\/)?([^)]+\.(woff2?|ttf))\)/g, (m, ff, ext) => {
    const p = path.join(assets, path.basename(ff));
    if (!fs.existsSync(p)) return m;
    const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : 'font/ttf';
    return `url(data:${mime};base64,${fs.readFileSync(p).toString('base64')})`;
  });
  return `<style>${css}</style>`;
});

// 효과음: base64 로 전역 객체에 담는다
const audioDir = path.join(dist, 'audio');
const sounds = {};
for (const f of fs.readdirSync(audioDir)) if (f.endsWith('.mp3')) sounds[f.slice(0, -4)] = fs.readFileSync(path.join(audioDir, f)).toString('base64');
const audioScript = `<script>window.__MONO_AUDIO=${JSON.stringify(sounds)};</script>`;

// JS: 모듈 스크립트를 인라인 (</script> 문자열이 코드 안에 있으면 깨지므로 이스케이프)
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/, (_, f) => {
  const js = fs.readFileSync(path.join(assets, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '';
}).replace('</body>', () => {
  const f = fs.readdirSync(assets).find((x) => /^index-.*\.js$/.test(x));
  const js = fs.readFileSync(path.join(assets, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `${audioScript}\n<script type="module">${js}</script>\n</body>`;
});

fs.writeFileSync(out, html);
console.log(`${out}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB  (효과음 ${Object.keys(sounds).length}개)`);
