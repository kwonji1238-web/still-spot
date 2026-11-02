// 코스: 규칙 기반 순서와 OpenAI 응답 검증.
// 코스 항목 = { place, distance, note? } — 첫 항목은 항상 촬영지(distance 0).

import { COURSE_KIND_ORDER, COURSE_LIMITS } from './settings.js';
import { distanceM } from './geo.js';

// AI 설명의 근거로 넘길 글. 없으면 빈 글자(모델은 정보가 없는 후보의 설명을 비운다).
// 관광지는 소개 제목·부제 + 소개글 앞부분, 식당·카페는 대표메뉴(가격 표기는 뺀다).
const INFO_MAX = { attraction: 300, restaurant: 120, cafe: 120 };
export function placeInfo(place) {
  const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  let text = '';
  if (place.kind === 'attraction') text = [place.title, place.subtitle, place.intro].map(squash).filter(Boolean).join(' / ');
  else if (place.menu) text = `대표메뉴: ${squash(place.menu).replace(/￦\s?[\d,.-]+/g, '').replace(/\s+/g, ' ').trim()}`;
  return text.slice(0, INFO_MAX[place.kind] || 0);
}

// 규칙 기반 코스: 촬영지 → 관광지 → 카페. 종류 안에서는 직전 장소에서 가까운 곳부터 이어 가서 되돌아가는 동선을 줄인다.
export function ruleCourse(spot, candidates) {
  const items = [{ place: spot, distance: 0 }];
  const left = [...candidates];
  let from = spot;
  const take = (group) => {
    while (group.length) {
      let best = 0;
      group.forEach((c, i) => {
        if (distanceM(from, c.place) < distanceM(from, group[best].place)) best = i;
      });
      const [pick] = group.splice(best, 1);
      items.push(pick);
      from = pick.place;
    }
  };
  const takeKind = (kind) => {
    const group = left.filter((c) => c.place.kind === kind);
    group.forEach((c) => left.splice(left.indexOf(c), 1));
    take(group);
  };
  COURSE_KIND_ORDER.forEach(takeKind);
  take(left); // 정해진 종류 밖의 후보는 맨 뒤에
  return items;
}

// 코스 한 줄 요약의 길이 한도(지도 위에 한 줄로 보인다)
export const SUMMARY_MAX = 40;

// AI 요약이 없거나 문구 규칙에 걸려 버려졌을 때 쓰는 한 줄 요약. 장소 이름을 쓰지 않고 종류로만 말해 사실과 어긋날 일이 없다.
export function ruleSummary(items) {
  const has = (kind) => items.some((it) => it.place.kind === kind);
  if (has('attraction') && has('cafe')) return '근처 관광지를 둘러보고, 카페에서 쉬어가요';
  if (has('attraction')) return '근처 관광지를 둘러봐요';
  if (has('cafe')) return '근처 카페에서 쉬어가요';
  return null;
}

// 화면 문구 규칙에 어긋나는 설명은 버린다(느낌표·이모지·지역명). 순서는 그대로 쓴다.
const REGION_WORDS = ['부산'];
const EMOJI = /\p{Extended_Pictographic}/u;
export function cleanNote(text, max = 80) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t || t.length > max) return null;
  if (t.includes('!') || EMOJI.test(t) || REGION_WORDS.some((w) => t.includes(w))) return null;
  return t;
}

// OpenAI 응답 검증. 통과하면 코스 배열, 아니면 null(→ 규칙 기반으로 대체).
// 응답 모양: { order: [id...], summary?: string, notes?: { [id]: string } }
// 조건: order는 후보 풀 안의 id이고 중복·지어낸 id가 없으며, 종류별 최대 개수(관광지 2, 카페 1)를 넘지 않는다.
// 풀에 관광지·카페가 있으면 각각 하나 이상 포함한다. 촬영지는 항상 맨 앞에 고정한다.
export function validateAiCourse(spot, pool, ai, limits = COURSE_LIMITS) {
  if (!ai || !Array.isArray(ai.order)) return null;
  const byId = new Map(pool.map((c) => [c.place.id, c]));
  const order = ai.order.filter((id) => id !== spot.id);
  if (order.length === 0 || new Set(order).size !== order.length) return null;
  if (!order.every((id) => byId.has(id))) return null;
  const chosen = order.map((id) => byId.get(id));
  if (chosen.some((c) => !(c.place.kind in limits))) return null;
  for (const [kind, max] of Object.entries(limits)) {
    const n = chosen.filter((c) => c.place.kind === kind).length;
    if (n > max) return null;
    if (n === 0 && pool.some((c) => c.place.kind === kind)) return null;
  }
  const notes = ai.notes && typeof ai.notes === 'object' ? ai.notes : {};
  const items = [{ place: spot, distance: 0 }, ...chosen].map((c) => ({
    ...c,
    note: cleanNote(notes[c.place.id]),
  }));
  return { items, summary: cleanNote(ai.summary, SUMMARY_MAX) };
}
