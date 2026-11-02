import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildIndex, adaptRestaurants, spotsAtSamePlace, stripLangNote, isClosedSpot } from '../src/data.js';
import { searchWorks, searchSpots, normalize } from '../src/search.js';
import { distanceM, formatDistance } from '../src/geo.js';
import { previewCandidates, courseCandidates, coursePool } from '../src/candidates.js';
import { ruleCourse, ruleSummary, validateAiCourse, cleanNote, SUMMARY_MAX } from '../src/course.js';
import { FEATURED } from '../src/settings.js';
import { pickFeatured } from '../src/featured.js';
import { slimRows, slimPosters } from '../scripts/slim.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
// 촬영지 목록은 무작위 순서라, 두 결과를 비교하는 테스트에는 같은 값을 내는 난수 함수를 쓴다
const seeded = () => { let x = 12345; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); };
const db = buildIndex({
  cinemap: read('cinemap.json'),
  attractions: read('attractions.json'),
  restaurants: read('restaurants.json'),
});

test('데이터: 촬영지 2,126건(원본 2,193건에서 [폐업] 67건 제외), 좌표 없음 110건, 작품 425개, 모두 region', () => {
  assert.equal(db.spots.length, 2126);
  assert.equal(db.spots.filter((s) => s.lat === null).length, 110);
  assert.equal(db.works.length, 425);
  assert.ok([...db.byId.values()].every((p) => p.region === 'busan'));
});

test('데이터: 좌표 없는 촬영지는 번호 없이 목록 맨 뒤', () => {
  for (const w of db.works) {
    const firstNull = w.spots.findIndex((s) => s.no === null);
    if (firstNull < 0) continue;
    assert.ok(w.spots.slice(firstNull).every((s) => s.lat === null && s.no === null));
    w.spots.slice(0, firstNull).forEach((s, i) => assert.equal(s.no, i + 1));
  }
});

test('데이터: 카페 분류와 휴업 제외', () => {
  const raw = [
    { UC_SEQ: 1, MAIN_TITLE: 'A커피', LAT: 35, LNG: 129, category: 'cafe', closed_notice: false },
    { UC_SEQ: 2, MAIN_TITLE: 'B', LAT: 35, LNG: 129, category: 'cafe_candidate', closed_notice: false },
    { UC_SEQ: 3, MAIN_TITLE: 'C', LAT: 35, LNG: 129, category: 'restaurant', closed_notice: false },
    { UC_SEQ: 4, MAIN_TITLE: 'D', LAT: 35, LNG: 129, category: 'restaurant', closed_notice: true },
  ];
  assert.deepEqual(adaptRestaurants(raw).map((p) => p.kind), ['cafe', 'cafe', 'restaurant']);
});

test('데이터: 식당·카페 사진은 주소가 있을 때만', () => {
  const raw = read('restaurants.json').filter((r) => !r.closed_notice);
  const food = db.places.filter((p) => p.kind === 'restaurant' || p.kind === 'cafe');
  assert.equal(food.filter((p) => p.thumb).length, raw.filter((r) => r.MAIN_IMG_THUMB?.trim()).length);
  assert.ok(food.every((p) => p.photo === p.thumb));
  assert.ok(food.filter((p) => !p.thumb).every((p) => p.photo === null));
});

test('검색 화면 고정 촬영지가 데이터에 있고, 섹션마다 두 곳이 나온다', () => {
  const f = pickFeatured(db.spots, { rand: () => 0.5 });
  FEATURED.trending.forEach((x, i) => assert.equal(f.trending[i].spot.name, x.place));
  FEATURED.photo.forEach((x, i) => assert.equal(f.photo[i].spot.name, x.place));
  FEATURED.photo.forEach((x, i) => assert.equal(f.photo[i].spot.work, x.work));
  assert.equal(f.trending.length, 2);
  assert.equal(f.photo.length, 2);
  const all = [...f.trending, ...f.photo];
  assert.equal(new Set(all.map((c) => c.spot.id)).size, 4);
  assert.ok(all.every((c) => c.spot.lat !== null));
});

test('검색 화면 사진: 고정 촬영지의 images/ 파일이 실제로 있고, 도모헌에는 출처 문구가 있다', () => {
  const f = pickFeatured(db.spots, { rand: () => 0.5 });
  assert.equal(f.trending[0].credit, '[출처 : 부산시]');
  for (const c of [...f.trending, ...f.photo]) {
    assert.ok(c.image?.startsWith('images/'), c.label);
    assert.ok(existsSync(new URL(`../${c.image}`, import.meta.url)), c.image);
  }
});

test('촬영지: 같은 장소의 작품이 한 번씩, 이 촬영지가 맨 앞', () => {
  const spot = db.spots.find((s) => s.work === '범죄와의 전쟁: 나쁜놈들 전성시대' && s.name === '문화공감수정(정란각)');
  const list = spotsAtSamePlace(spot, db.spots);
  assert.equal(list[0].id, spot.id);
  assert.ok(list.length >= 5);
  assert.equal(new Set(list.map((s) => s.work)).size, list.length);
  assert.ok(list.every((s) => s.name === spot.name && s.address === spot.address));
});

test('촬영지: 장면 설명은 scenes.json에 있는 촬영지에만 붙는다', () => {
  const scenes = read('scenes.json');
  const withScenes = buildIndex({ cinemap: read('cinemap.json'), attractions: [], restaurants: [], scenes });
  const hit = withScenes.spots.filter((s) => s.scene);
  assert.equal(hit.length, Object.keys(scenes).length);
  assert.ok(hit.every((s) => scenes[`${s.work}|${s.name}`] === s.scene));
  assert.ok(db.spots.every((s) => s.scene === null));
});

test('촬영지 썸네일: 도모헌(출처 문구 있음)과 정란각에만 사진이 있다', () => {
  const withPhoto = db.spots.filter((s) => s.photo);
  assert.ok(withPhoto.length >= 2);
  assert.ok(withPhoto.every((s) => ['부산시 열린행사장', '문화공감수정(정란각)'].includes(s.name)));
  assert.ok(withPhoto.filter((s) => s.name === '부산시 열린행사장').every((s) => s.photo === 'images/domoheon.jpg' && s.photoCredit === '[출처 : 부산시]'));
  assert.ok(withPhoto.filter((s) => s.name !== '부산시 열린행사장').every((s) => s.photo === 'images/jeongrangak.jpg'));
  assert.ok(existsSync(new URL('../images/domoheon.jpg', import.meta.url)));
  assert.ok(existsSync(new URL('../images/jeongrangak.jpg', import.meta.url)));
  const jr = withPhoto.find((s) => s.name === '문화공감수정(정란각)');
  assert.equal(jr.photos.length, 2);
  assert.ok(jr.photos.every((p) => existsSync(new URL(`../${p}`, import.meta.url))));
  assert.ok(db.spots.filter((s) => !s.photo).every((s) => s.photos.length === 0));
});

test('검색: 띄어쓰기 무시 부분 일치, 앞부분 일치가 위', () => {
  const r = searchWorks(db.works, '고백의 역사');
  assert.equal(r[0].work.title, '넷플릭스 고백의역사');
  const r2 = searchWorks(db.works, '친구');
  assert.ok(r2[0].work.title.startsWith('친구'));
  assert.deepEqual(searchWorks(db.works, '   '), []);
  assert.deepEqual(searchWorks(db.works, 'zzzz없는작품'), []);
});

test('검색: 굵게 할 구간은 원문 위치 기준, 공백 제외', () => {
  const works = [{ title: '서울의 봄', spots: [] }];
  assert.deepEqual(searchWorks(works, '의봄')[0].ranges, [[2, 3], [4, 5]]);
  assert.equal(normalize(' A b '), 'ab');
});

test('거리 표기: 10m 단위 m, 1,000m 이상 km', () => {
  assert.deepEqual(formatDistance(324), { value: '320', unit: 'm' });
  assert.deepEqual(formatDistance(4), { value: '0', unit: 'm' });
  assert.deepEqual(formatDistance(994), { value: '990', unit: 'm' });
  assert.deepEqual(formatDistance(995), { value: '1.0', unit: 'km' });
  assert.deepEqual(formatDistance(1249), { value: '1.2', unit: 'km' });
  assert.deepEqual(formatDistance(12345), { value: '12.3', unit: 'km' });
});

test('거리: 위도 0.01도 ≈ 1.11km', () => {
  const d = distanceM({ lat: 35, lng: 129 }, { lat: 35.01, lng: 129 });
  assert.ok(Math.abs(d - 1112) < 5);
});

const spot = { id: 's', kind: 'spot', lat: 35, lng: 129 };
const at = (id, kind, dLat) => ({ id, kind, name: id, lat: 35 + dLat, lng: 129 });
const places = [
  at('a1', 'attraction', 0.003), at('a2', 'attraction', 0.001), at('a3', 'attraction', 0.002),
  at('r1', 'restaurant', 0.004), at('r2', 'restaurant', 0.0005),
  at('c1', 'cafe', 0.001), at('c2', 'cafe', 0.004), at('c3', 'cafe', 0.005), at('c4', 'cafe', 0.006),
  at('far', 'attraction', 0.5),
];

test('후보: 미리보기는 관광지 2 + 식당 1, 가까운 순, 반경 밖 제외', () => {
  const ids = previewCandidates(spot, places).map((c) => c.place.id);
  assert.deepEqual(ids, ['a2', 'a3', 'r2']);
});

const ids = (list) => list.map((c) => c.place.id);

test('후보: 코스는 관광지 2 + 카페 1(식당 제외), 가까운 순', () => {
  assert.deepEqual(ids(courseCandidates(spot, places)), ['a2', 'a3', 'c1']);
  assert.deepEqual(ids(courseCandidates(spot, [places[0]])), ['a1']);
  assert.deepEqual(courseCandidates({ id: 'x', lat: null, lng: null }, places), []);
});

test('후보: 코스 반경은 5km에서 시작하고, 관광지·카페가 모두 모일 때까지 8km, 12km로 넓힌다', () => {
  const km = (n) => n / 111.2; // 위도 1도 ≈ 111.2km
  // 5km 안에 관광지만 있고 카페는 6km 거리 → 8km로 넓혀 카페까지 모은다
  assert.deepEqual(ids(courseCandidates(spot, [at('a', 'attraction', km(3)), at('c', 'cafe', km(6))])), ['a', 'c']);
  // 카페가 10km 거리 → 12km까지 넓혀서 찾는다
  assert.deepEqual(ids(courseCandidates(spot, [at('a', 'attraction', km(3)), at('c', 'cafe', km(10))])), ['a', 'c']);
  // 카페가 20km 거리 → 12km 안에 없으니 관광지만
  assert.deepEqual(ids(courseCandidates(spot, [at('a', 'attraction', km(3)), at('c', 'cafe', km(20))])), ['a']);
  // 5km 안에 둘 다 있으면 넓히지 않는다(5km 밖의 가까운 관광지는 섞이지 않음)
  assert.deepEqual(ids(courseCandidates(spot, [at('a', 'attraction', km(3)), at('c', 'cafe', km(4)), at('b', 'attraction', km(7))])), ['a', 'c']);
});

test('후보: OpenAI 풀은 관광지 3 + 카페 3이고 코스 후보를 모두 포함한다', () => {
  const pool = ids(coursePool(spot, places));
  assert.deepEqual(pool, ['a2', 'a3', 'a1', 'c1', 'c2', 'c3']);
  assert.ok(ids(courseCandidates(spot, places)).every((id) => pool.includes(id)));
});

test('규칙 코스: 촬영지 → 관광지 → 카페, 같은 종류는 이어 가기 가까운 곳부터', () => {
  const c = courseCandidates(spot, places);
  const r = ruleCourse(spot, [...c].reverse());
  assert.deepEqual(r.map((i) => i.place.kind), ['spot', 'attraction', 'attraction', 'cafe']);
  assert.deepEqual(ids(r), ['s', 'a2', 'a3', 'c1']);
  // 남쪽 B(111m)와 북쪽 A(333m): 가까운 B를 먼저 들러야 되돌아가는 길이 짧다
  const B = { place: at('B', 'attraction', -0.001), distance: 111 };
  const A = { place: at('A', 'attraction', 0.003), distance: 333 };
  assert.deepEqual(ids(ruleCourse(spot, [A, B])), ['s', 'B', 'A']);
});

test('AI 검증: 풀 안에서 고른 코스는 통과, 촬영지는 맨 앞', () => {
  const pool = coursePool(spot, places);
  const ok = validateAiCourse(spot, pool, { order: ['a3', 'c2', 'a1'], notes: { c2: '쉬어 가기 좋아요' } });
  assert.deepEqual(ids(ok.items), ['s', 'a3', 'c2', 'a1']);
  assert.equal(ok.items[2].note, '쉬어 가기 좋아요');
  assert.deepEqual(ids(validateAiCourse(spot, pool, { order: ['s', 'a2', 'c1'] }).items), ['s', 'a2', 'c1']);
});

test('AI 검증: 지어낸 장소·중복·종류별 개수 초과·종류 빠짐·모양 오류는 거절', () => {
  const pool = coursePool(spot, places);
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'made-up', 'c1'] }), null);
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'a2', 'c1'] }), null);
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'a3', 'a1', 'c1'] }), null, '관광지는 2곳까지');
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'c1', 'c2'] }), null, '카페는 1곳까지');
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'a3'] }), null, '풀에 카페가 있으면 카페 포함');
  assert.equal(validateAiCourse(spot, pool, { order: ['c1'] }), null, '풀에 관광지가 있으면 관광지 포함');
  assert.equal(validateAiCourse(spot, [...pool, { place: places.find((p) => p.id === 'r2'), distance: 55 }], { order: ['a2', 'r2', 'c1'] }), null, '식당은 코스에 넣지 않음');
  assert.equal(validateAiCourse(spot, pool, { order: [] }), null);
  assert.equal(validateAiCourse(spot, pool, { order: 'a2' }), null);
  assert.equal(validateAiCourse(spot, pool, null), null);
  // 풀에 관광지만 있으면 관광지만 골라도 통과
  const onlyAttr = coursePool(spot, [places[0], places[1]]);
  assert.deepEqual(ids(validateAiCourse(spot, onlyAttr, { order: ['a2'] }).items), ['s', 'a2']);
});

test('AI 설명: 느낌표·이모지·지역명·너무 긴 글은 버림', () => {
  assert.equal(cleanNote('좋아요!'), null);
  assert.equal(cleanNote('바다가 보여요 🌊'), null);
  assert.equal(cleanNote('부산의 명소예요'), null);
  assert.equal(cleanNote('가'.repeat(81)), null);
  assert.equal(cleanNote(' 걷기 좋아요 '), '걷기 좋아요');
});

test('AI 근거 정보: 관광지는 소개, 식당·카페는 대표메뉴(가격 제외), 없으면 빈 글자', async () => {
  const { placeInfo } = await import('../src/course.js');
  const attr = db.places.find((p) => p.kind === 'attraction' && p.intro);
  const info = placeInfo(attr);
  assert.ok(info.length > 0 && info.length <= 300);
  assert.ok(info.includes(attr.intro.slice(0, 10)));
  assert.equal(placeInfo({ kind: 'cafe', menu: '아메리카노 ￦5,000 소금빵 ￦4,000' }), '대표메뉴: 아메리카노 소금빵');
  assert.equal(placeInfo({ kind: 'restaurant', menu: null }), '');
  assert.equal(placeInfo({ kind: 'restaurant', menu: '곤드레밥'.repeat(100) }).length, 120);
});

test('데이터: 대표메뉴는 식당·카페에만, 소개 제목은 관광지에만', () => {
  const food = db.places.filter((p) => p.kind === 'restaurant' || p.kind === 'cafe');
  assert.ok(food.some((p) => p.menu));
  assert.ok(food.every((p) => !('intro' in p)));
  assert.ok(db.places.filter((p) => p.kind === 'attraction').every((p) => p.title));
});

test('촬영지 검색: 이름·주소 부분 일치, 같은 장소는 한 번, 이름 일치가 위', () => {
  const r = searchSpots(db.spots, '정란각');
  assert.ok(r.length >= 1);
  assert.equal(new Set(r.map((h) => `${h.spot.name}|${h.spot.address}`)).size, r.length);
  assert.ok(r[0].spot.name.includes('정란각'));
  assert.ok(r[0].ranges.length > 0);
  const byAddr = searchSpots(db.spots, '범일로90번길');
  assert.ok(byAddr.length >= 1 && byAddr.every((h) => h.spot.address.includes('범일로90번길') || h.spot.name.includes('범일로90번길')));
  assert.deepEqual(searchSpots(db.spots, '  '), []);
  assert.deepEqual(searchSpots(db.spots, 'zzzz없는곳'), []);
  assert.ok(searchSpots(db.spots, '부산', 5).length <= 5);
});

test('관광지 이름: 끝의 지원 언어 표기만 떼고 다른 괄호는 둔다', () => {
  assert.equal(stripLangNote('이중섭문화거리(한,영,중간,중번,일)'), '이중섭문화거리');
  assert.equal(stripLangNote('해동용궁사 (한,영,중간,중번,일)'), '해동용궁사');
  assert.equal(stripLangNote('어딘가(한, 영, 중간, 중번)'), '어딘가');
  assert.equal(stripLangNote('어딘가(한)'), '어딘가');
  assert.equal(stripLangNote('부네치아(부네치아)'), '부네치아(부네치아)');
  assert.equal(stripLangNote('구 대신공원(구 대신공원)'), '구 대신공원(구 대신공원)');
  assert.ok(db.places.filter((p) => p.kind === 'attraction').every((p) => !/\(\s*한/.test(p.name)));
});

test('폐업: 이름 앞에 [폐업]·[페업]이 붙은 촬영지는 내지 않고, 원본 파일은 그대로 둔다', () => {
  const raw = read('cinemap.json');
  const closed = raw.filter((r) => isClosedSpot(r.plcNm));
  assert.equal(closed.length, 67);
  assert.equal(raw.length, 2193);
  assert.ok(db.spots.every((s) => !isClosedSpot(s.name)));
  assert.equal(db.spots.length, raw.length - closed.length);
  assert.ok(db.spots.some((s) => s.name.startsWith('[철거]')));
  assert.ok(new Set(db.spots.map((s) => s.id)).size === db.spots.length);
  assert.ok(db.spots.every((s) => Number(s.id.slice(1)) < raw.length));
  assert.equal(db.byId.get('s0')?.name, raw[0].plcNm.trim());
});

test('배포용 데이터: 줄인 사본으로 만든 결과가 원본으로 만든 결과와 같다', () => {
  const posters = read('posters.json');
  const full = buildIndex({ cinemap: read('cinemap.json'), attractions: read('attractions.json'), restaurants: read('restaurants.json'), posters, scenes: read('scenes.json'), rand: seeded() });
  const slim = buildIndex({
    cinemap: slimRows(read('cinemap.json'), 'cinemap'),
    attractions: slimRows(read('attractions.json'), 'attractions'),
    restaurants: slimRows(read('restaurants.json'), 'restaurants'),
    posters: slimPosters(posters),
    scenes: read('scenes.json'),
    rand: seeded(),
  });
  assert.deepEqual(slim.spots, full.spots);
  assert.deepEqual(slim.places, full.places);
  assert.deepEqual(slim.works.map((w) => [w.title, w.poster, w.info]), full.works.map((w) => [w.title, w.poster, w.info]));
});

test('후보: 촬영지와 같은 이름의 장소는 빼고, 같은 이름은 가까운 하나만', () => {
  const spotN = { id: 's', kind: 'spot', name: '광안리 해수욕장', lat: 35, lng: 129 };
  const named = (id, kind, name, dLat) => ({ id, kind, name, lat: 35 + dLat, lng: 129 });
  const list = [
    named('a1', 'attraction', '광안리해수욕장', 0.0005), // 촬영지 자신(띄어쓰기만 다름)
    named('a2', 'attraction', '광안리 골방', 0.004),
    named('c1', 'cafe', '베르크로스터스', 0.01),
    named('c2', 'cafe', '베르크로스터스', 0.011), // 같은 이름은 먼 쪽을 뺀다
    named('c3', 'cafe', '블랙업커피', 0.012),
  ];
  assert.deepEqual(ids(courseCandidates(spotN, list)), ['a2', 'c1']);
  assert.deepEqual(ids(previewCandidates(spotN, list)), ['a2']);
  assert.deepEqual(ids(coursePool(spotN, list)), ['a2', 'c1', 'c3']);
});

test('코스 한 줄 요약: AI 요약은 40자 이내·문구 규칙을 지킬 때만 쓰고, 아니면 종류로 만든 문장을 쓴다', () => {
  const pool = coursePool(spot, places);
  const ok = validateAiCourse(spot, pool, { order: ['a2', 'c1'], summary: '조선통신사 이야기를 보고, 카페에서 쉬어가요' });
  assert.equal(ok.summary, '조선통신사 이야기를 보고, 카페에서 쉬어가요');
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'c1'], summary: '가'.repeat(SUMMARY_MAX + 1) }).summary, null);
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'c1'], summary: '부산의 전망을 보고 쉬어가요' }).summary, null);
  assert.equal(validateAiCourse(spot, pool, { order: ['a2', 'c1'], summary: '좋은 코스예요!' }).summary, null);
  const kind = (k) => ({ place: { kind: k } });
  assert.equal(ruleSummary([kind('spot'), kind('attraction'), kind('cafe')]), '근처 관광지를 둘러보고, 카페에서 쉬어가요');
  assert.equal(ruleSummary([kind('spot'), kind('attraction')]), '근처 관광지를 둘러봐요');
  assert.equal(ruleSummary([kind('spot'), kind('cafe')]), '근처 카페에서 쉬어가요');
  assert.equal(ruleSummary([kind('spot')]), null);
  assert.ok([ruleSummary([kind('attraction'), kind('cafe')])].every((t) => t.length <= SUMMARY_MAX && !t.includes('!')));
});

test('촬영지 목록: 좌표 있는 촬영지는 무작위 순서(번호는 그 순서대로), 좌표 없는 촬영지는 번호 없이 맨 뒤', () => {
  const sorted = buildIndex({ cinemap: read('cinemap.json'), attractions: [], restaurants: [], rand: () => 0.999 });
  const shuffled = buildIndex({ cinemap: read('cinemap.json'), attractions: [], restaurants: [], rand: seeded() });
  const again = buildIndex({ cinemap: read('cinemap.json'), attractions: [], restaurants: [], rand: seeded() });
  const order = (idx) => idx.works.map((w) => w.spots.map((s) => s.id).join(',')).join('|');
  assert.notEqual(order(sorted), order(shuffled), '섞이지 않았다');
  assert.equal(order(shuffled), order(again), '같은 난수면 같은 순서');
  for (const w of shuffled.works) {
    const withNo = w.spots.filter((s) => s.no !== null);
    withNo.forEach((s, i) => assert.equal(s.no, i + 1));
    assert.ok(w.spots.slice(withNo.length).every((s) => s.lat === null && s.no === null));
    assert.deepEqual([...w.spots.map((s) => s.id)].sort(), [...sorted.works.find((x) => x.title === w.title).spots.map((s) => s.id)].sort(), '촬영지가 빠지거나 늘지 않았다');
  }
});
