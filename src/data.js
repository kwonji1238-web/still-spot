// 데이터 어댑터: data/*.json 원본을 Place 모양으로 바꾼다. 원본 파일은 고치지 않는다.
//
// Place = {
//   id, kind: 'spot'|'attraction'|'restaurant'|'cafe', region, name, address,
//   lat, lng            // 없으면 null (촬영지 111건)
//   work?               // 촬영지만: 작품명
//   photo?, thumb?      // 관광지·식당·카페: 사진 주소(있을 때만)
//   intro?, title?, subtitle?  // 관광지만: 소개글, 소개 제목·부제
//   menu?               // 식당·카페만: 대표메뉴(화면에는 쓰지 않고 AI 설명의 근거로만 씀)
//   geocodeStatus?      // 촬영지만: 원본 '변환상태' (성공 / 키워드검색성공 / 실패)
// }
import { SPOT_PHOTOS } from './settings.js';


const REGION = 'busan';

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// 촬영지 이름 앞에 "[폐업]"(오타 "[페업]" 포함)이 붙은 곳은 화면에 내지 않는다. data/cinemap.json에서는 지우지 않는다(2026-11-02 사용자 요청).
// "[철거]"는 사용자가 정하지 않아 그대로 둔다. id는 원본 순서 번호라 거르기 전에 정해서 바뀌지 않게 한다.
export const isClosedSpot = (name) => /^\s*\[\s*(?:폐업|페업)\s*\]/.test(name);

export function adaptSpots(raw) {
  return raw.map((r, i) => {
    const lat = num(r.lat);
    const lng = num(r.lng);
    const hasCoords = lat !== null && lng !== null;
    return {
      id: `s${i}`,
      kind: 'spot',
      region: REGION,
      work: clean(r.opusNm),
      name: clean(r.plcNm),
      address: clean(r.roadNmAddr),
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      // 위치 정확도 3단계(design.md 4-11)에 쓸 수 있는 필드지만, 지금은 "주소만 표시"(빈 고리)만 쓴다.
      geocodeStatus: clean(r['변환상태']),
    };
  }).filter((s) => !isClosedSpot(s.name));
}

// 관광지 이름 뒤에 붙은 지원 언어 표기 "(한,영,중간,중번,일)"는 이름이 아니라서 뗀다(2026-11-02 사용자 요청)
const LANG_NOTE = /\s*\(\s*(?:(?:한|영|중간|중번|중|일)\s*,?\s*)+\)/g;
export const stripLangNote = (name) => name.replace(LANG_NOTE, '').trim();

export function adaptAttractions(raw) {
  return raw.map((r) => ({
    id: `a${r.UC_SEQ}`,
    kind: 'attraction',
    region: REGION,
    name: stripLangNote(clean(r.MAIN_TITLE)),
    address: clean(r.ADDR1),
    lat: num(r.LAT),
    lng: num(r.LNG),
    photo: clean(r.MAIN_IMG_NORMAL) || null,
    thumb: clean(r.MAIN_IMG_THUMB) || null,
    intro: clean(r.ITEMCNTNTS) || null,
    title: clean(r.TITLE) || null, // 소개 제목·부제는 화면에 쓰지 않고 AI 설명의 근거로만 씀
    subtitle: clean(r.SUBTITLE) || null,
  }));
}

// 카페 분류: restaurants.json의 category를 쓴다(상호명 규칙은 수집 스크립트에서 이미 적용됨).
// cafe_candidate 20곳은 data/cafe-candidates-review.md에서 사람이 전부 "카페"로 판정했으므로 카페로 둔다.
// 휴업·폐업 안내가 있는 곳(closed_notice)은 코스 후보에서 뺀다.
// 식당·카페는 작은 사진 주소(MAIN_IMG_THUMB, 417×320)만 있어 S5 상단 사진에도 같은 주소를 쓴다.
export function adaptRestaurants(raw) {
  return raw
    .filter((r) => !r.closed_notice)
    .map((r) => ({
      id: `r${r.UC_SEQ}`,
      kind: r.category === 'cafe' || r.category === 'cafe_candidate' ? 'cafe' : 'restaurant',
      region: REGION,
      name: clean(r.MAIN_TITLE),
      address: clean(r.ADDR1),
      lat: num(r.LAT),
      lng: num(r.LNG),
      photo: clean(r.MAIN_IMG_THUMB) || null,
      thumb: clean(r.MAIN_IMG_THUMB) || null,
      menu: clean(r.RPRSNTV_MENU).replace(/\s+/g, ' ') || null,
    }))
    .filter((p) => p.lat !== null && p.lng !== null);
}

// 작품 목록: 작품명 → 촬영지 배열. 촬영지 순서는 원본 순서를 지키고 좌표 없는 곳은 맨 뒤.
// TODO(열린 결정: 촬영지 목록 정렬 기준) 지금은 원본 순서.
export function buildWorks(spots) {
  const map = new Map();
  for (const s of spots) {
    if (!s.work) continue;
    if (!map.has(s.work)) map.set(s.work, []);
    map.get(s.work).push(s);
  }
  const works = [];
  for (const [title, list] of map) {
    const withCoords = list.filter((s) => s.lat !== null);
    const without = list.filter((s) => s.lat === null);
    withCoords.forEach((s, i) => (s.no = i + 1));
    without.forEach((s) => (s.no = null));
    works.push({ title, spots: [...withCoords, ...without] });
  }
  return works;
}

// 같은 장소(이름·주소가 같음)에서 촬영된 작품들의 촬영지. 이 촬영지가 맨 앞이고, 작품은 한 번씩만 나온다.
export function spotsAtSamePlace(spot, spots) {
  const seen = new Set();
  return [spot, ...spots.filter((s) => s.name === spot.name && s.address === spot.address)].filter((s) => {
    if (seen.has(s.work)) return false;
    seen.add(s.work);
    return true;
  });
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/w185';

export function buildIndex({ cinemap, attractions, restaurants, posters = {}, scenes = {} }) {
  const spots = adaptSpots(cinemap);
  // 장면 설명은 data/scenes.json("작품명|장소명" → 글)에 있는 촬영지에만 붙는다. 없으면 그 줄이 화면에서 빠진다.
  for (const s of spots) {
    s.scene = scenes[`${s.work}|${s.name}`] || null;
    s.photo = SPOT_PHOTOS[s.name]?.image || null;
    s.photoCredit = SPOT_PHOTOS[s.name]?.credit || null;
    const sp = SPOT_PHOTOS[s.name];
    s.photos = sp?.images || (sp?.image ? [sp.image] : []);
  }
  const works = buildWorks(spots);
  // 포스터는 data/posters.json(scripts/posters.mjs가 만든다)에 있는 작품만 붙는다. 없으면 빈 프레임.
  // 같은 파일에 개봉연도·장르·출연진·줄거리도 있다. 있는 값만 붙고, 없으면 그 줄이 화면에서 빠진다.
  for (const w of works) {
    const p = posters[w.title];
    w.poster = p?.path ? POSTER_BASE + p.path : null;
    w.info = { year: p?.year || null, genres: p?.genres?.slice(0, 3) || [], cast: p?.cast || [], overview: p?.overview || null };
  }
  const places = [...adaptAttractions(attractions), ...adaptRestaurants(restaurants)];
  const byId = new Map();
  for (const p of [...spots, ...places]) byId.set(p.id, p);
  const workByTitle = new Map(works.map((w) => [w.title, w]));
  const hasPosters = works.some((w) => w.poster);
  return { spots, works, places, byId, workByTitle, hasPosters };
}

export async function loadData(base = 'data/') {
  const get = async (f) => {
    const res = await fetch(base + f);
    if (!res.ok) throw new Error(`${f} ${res.status}`);
    return res.json();
  };
  // 포스터 파일은 없어도 된다(없으면 포스터 없이 동작)
  const posters = await get('posters.json').catch(() => ({}));
  const scenes = await get('scenes.json').catch(() => ({}));
  const [cinemap, attractions, restaurants] = await Promise.all([
    get('cinemap.json'),
    get('attractions.json'),
    get('restaurants.json'),
  ]);
  return buildIndex({ cinemap, attractions, restaurants, posters, scenes });
}
