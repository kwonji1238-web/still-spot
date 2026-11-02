// 근처 후보 선택: 촬영지 좌표에서 반경 안, 가까운 순으로 분류별 최대 개수만큼.

import { distanceM, hasCoords } from './geo.js';
import { NEARBY_RADIUS_M, PREVIEW_LIMITS, COURSE_LIMITS, COURSE_POOL_LIMITS, COURSE_RADIUS_STEPS_M } from './settings.js';

// 돌려주는 항목: { place, distance } (distance는 촬영지에서의 직선 거리 m)
// 이름은 띄어쓰기·대소문자를 무시하고 비교한다.
const sameName = (a, b) => String(a).replace(/\s+/g, '').toLowerCase() === String(b).replace(/\s+/g, '').toLowerCase();

export function nearby(spot, places, limits, radius = NEARBY_RADIUS_M) {
  if (!hasCoords(spot)) return [];
  const byKind = {};
  for (const place of places) {
    if (!(place.kind in limits) || !hasCoords(place)) continue;
    if (sameName(place.name, spot.name)) continue; // 촬영지와 같은 이름의 장소는 그 촬영지 자신이다
    const d = distanceM(spot, place);
    if (d > radius) continue;
    (byKind[place.kind] ||= []).push({ place, distance: d });
  }
  const out = [];
  for (const kind of Object.keys(limits)) {
    const seen = new Set();
    const list = (byKind[kind] || [])
      .sort((a, b) => a.distance - b.distance)
      .filter((c) => !seen.has(c.place.name.replace(/\s+/g, '')) && seen.add(c.place.name.replace(/\s+/g, ''))); // 같은 이름은 가까운 하나만
    out.push(...list.slice(0, limits[kind]));
  }
  return out;
}

// S3 근처 미리보기, S2 근처 장소 핀: 관광지 최대 2 + 식당 최대 1
export const previewCandidates = (spot, places, radius) => nearby(spot, places, PREVIEW_LIMITS, radius);

// 코스 후보: 반경 5km에서 찾고, 관광지와 카페가 모두 모이지 않으면 반경을 8km, 12km로 넓힌다.
// 가까운 순으로 고르므로 넓혀도 이미 찾은 가까운 후보는 그대로 남는다.
function withExpandingRadius(spot, places, limits) {
  let found = [];
  for (const radius of COURSE_RADIUS_STEPS_M) {
    found = nearby(spot, places, limits, radius);
    const kinds = new Set(found.map((c) => c.place.kind));
    if (kinds.has('attraction') && kinds.has('cafe')) break;
  }
  return found;
}

// S4 코스 후보(규칙 기반 코스의 재료): 관광지 최대 2 + 카페 최대 1
export const courseCandidates = (spot, places) => withExpandingRadius(spot, places, COURSE_LIMITS);

// OpenAI가 고르는 풀: 관광지 최대 3 + 카페 최대 3. 코스 후보를 모두 포함한다.
export const coursePool = (spot, places) => withExpandingRadius(spot, places, COURSE_POOL_LIMITS);
