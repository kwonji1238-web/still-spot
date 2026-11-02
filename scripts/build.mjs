// Netlify 빌드: 배포에 필요한 파일만 dist/로 복사하고 config.js를 만든다.
// 저장소 루트를 그대로 배포하면 .env, scripts/geocode-cache.json 같은 파일이 같이 올라가므로 이렇게 나눈다.
// 번들러가 아니라 복사만 한다.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { slimRows, slimPosters } from './slim.mjs';

const OUT = 'dist';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/data`, { recursive: true });

cpSync('index.html', `${OUT}/index.html`);
// 화면에서 쓰는 아이콘만 복사한다(icon/에는 락업·심볼 같은 원본도 있다). favicon.ico는 루트에도 둔다(옛 도구가 /favicon.ico를 찾는다).
mkdirSync(`${OUT}/icon`, { recursive: true });
for (const f of ['site.webmanifest', 'favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
  cpSync(`icon/${f}`, `${OUT}/icon/${f}`);
}
cpSync('icon/favicon.ico', `${OUT}/favicon.ico`);
cpSync('src', `${OUT}/src`, { recursive: true });
// 검색 화면의 고정 촬영지 사진(src/settings.js의 FEATURED). 이미지 출처 문서(CREDITS.md)는 배포하지 않는다.
if (existsSync('images')) cpSync('images', `${OUT}/images`, { recursive: true, filter: (f) => !f.endsWith('CREDITS.md') });
// 배포용 데이터는 화면에서 쓰는 필드만 남긴 사본이다(scripts/slim.mjs). 원본은 data/에 그대로 있다.
const readJson = (f) => JSON.parse(readFileSync(`data/${f}`, 'utf8'));
const writeJson = (f, v) => writeFileSync(`${OUT}/data/${f}`, JSON.stringify(v));
for (const kind of ['cinemap', 'attractions', 'restaurants']) writeJson(`${kind}.json`, slimRows(readJson(`${kind}.json`), kind));
// 포스터 주소 파일은 scripts/posters.mjs를 돌린 뒤에만 있다(없어도 동작한다)
if (existsSync('data/posters.json')) writeJson('posters.json', slimPosters(readJson('posters.json')));
// 촬영지 장면 설명(data/scenes.json)도 있을 때만 복사한다
if (existsSync('data/scenes.json')) cpSync('data/scenes.json', `${OUT}/data/scenes.json`);

// 카카오 JavaScript 키는 브라우저에서 쓰는 공개 키라 config.js에 들어간다.
// 값은 Netlify 환경변수 KAKAO_JS_KEY에서 읽고, 저장소에는 넣지 않는다.
// 로컬 빌드에서는 .env(.gitignore에 있음)의 KAKAO_JS_KEY를 읽는다. dist/도 .gitignore에 있다.
const fromDotenv = () => {
  if (!existsSync('.env')) return '';
  const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('KAKAO_JS_KEY='));
  return line ? line.slice('KAKAO_JS_KEY='.length).trim().replace(/^["']|["']$/g, '') : '';
};
const key = process.env.KAKAO_JS_KEY || fromDotenv();
writeFileSync(`${OUT}/config.js`, `window.STILLSPOT_CONFIG = ${JSON.stringify({ kakaoJsKey: key, dataVersion: Date.now().toString(36) })};\n`);
console.log(`dist/ 준비 완료 (KAKAO_JS_KEY ${key ? '있음' : '없음 — 지도 없이 동작'})`);
