import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildIndex, adaptRestaurants, spotsAtSamePlace, stripLangNote, isClosedSpot } from '../src/data.js';
import { searchWorks, searchSpots, normalize } from '../src/search.js';
import { distanceM, formatDistance } from '../src/geo.js';
import { previewCandidates, courseCandidates } from '../src/candidates.js';
import { ruleCourse, validateAiCourse, cleanNote } from '../src/course.js';
import { FEATURED } from '../src/settings.js';
import { pickFeatured } from '../src/featured.js';
import { slimRows, slimPosters } from '../scripts/slim.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
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
  at('c1', 'cafe', 0.001), at('far', 'attraction', 0.5),
];

test('후보: 미리보기는 관광지 2 + 식당 1, 가까운 순, 반경 밖 제외', () => {
  const ids = previewCandidates(spot, places).map((c) => c.place.id);
  assert.deepEqual(ids, ['a2', 'a3', 'r2']);
});

test('후보: 코스는 카페 1까지, 모자라면 있는 것만', () => {
  assert.deepEqual(courseCandidates(spot, places).map((c) => c.place.id), ['a2', 'a3', 'r2', 'c1']);
  assert.deepEqual(courseCandidates(spot, [places[0]]).map((c) => c.place.id), ['a1']);
  assert.deepEqual(courseCandidates({ id: 'x', lat: null, lng: null }, places), []);
});

test('규칙 코스: 촬영지 → 관광지 → 식당 → 카페', () => {
  const c = courseCandidates(spot, places);
  const kinds = ruleCourse(spot, [...c].reverse()).map((i) => i.place.kind ?? 'spot');
  assert.deepEqual(kinds, ['spot', 'attraction', 'attraction', 'restaurant', 'cafe']);
});

test('AI 검증: 후보와 같은 집합이면 통과, 촬영지는 맨 앞', () => {
  const c = courseCandidates(spot, places);
  const ok = validateAiCourse(spot, c, { order: ['c1', 'r2', 'a3', 'a2'], notes: { c1: '쉬어 가기 좋아요' } });
  assert.deepEqual(ok.items.map((i) => i.place.id), ['s', 'c1', 'r2', 'a3', 'a2']);
  assert.equal(ok.items[1].note, '쉬어 가기 좋아요');
});

test('AI 검증: 지어낸 장소·빠짐·중복·모양 오류는 거절', () => {
  const c = courseCandidates(spot, places);
  assert.equal(validateAiCourse(spot, c, { order: ['a2', 'a3', 'r2', 'made-up'] }), null);
  assert.equal(validateAiCourse(spot, c, { order: ['a2', 'a3', 'r2'] }), null);
  assert.equal(validateAiCourse(spot, c, { order: ['a2', 'a2', 'r2', 'c1'] }), null);
  assert.equal(validateAiCourse(spot, c, { order: 'a2' }), null);
  assert.equal(validateAiCourse(spot, c, null), null);
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
  const full = buildIndex({ cinemap: read('cinemap.json'), attractions: read('attractions.json'), restaurants: read('restaurants.json'), posters, scenes: read('scenes.json') });
  const slim = buildIndex({
    cinemap: slimRows(read('cinemap.json'), 'cinemap'),
    attractions: slimRows(read('attractions.json'), 'attractions'),
    restaurants: slimRows(read('restaurants.json'), 'restaurants'),
    posters: slimPosters(posters),
    scenes: read('scenes.json'),
  });
  assert.deepEqual(slim.spots, full.spots);
  assert.deepEqual(slim.places, full.places);
  assert.deepEqual(slim.works.map((w) => [w.title, w.poster, w.info]), full.works.map((w) => [w.title, w.poster, w.info]));
});
