// 작품 검색: 띄어쓰기를 무시한 부분 일치 [제안], 앞부분 일치를 위로.

import { representativeSpot } from './data.js';

export const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();

// 원문 글자 위치 ↔ 정규화 글자 위치 대응표
function indexMap(text) {
  const map = [];
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) map.push(i);
  return map;
}

// 결과: [{ work, ranges: [[start, end)] }] — ranges는 원문 기준으로 굵게 할 구간
export function searchWorks(works, query, limit = 30) {
  const q = normalize(query);
  if (!q) return [];
  const hits = [];
  for (const work of works) {
    const n = normalize(work.title);
    const at = n.indexOf(q);
    if (at < 0) continue;
    hits.push({ work, at, len: n.length });
  }
  hits.sort((a, b) => a.at - b.at || a.len - b.len || a.work.title.localeCompare(b.work.title, 'ko'));
  return hits.slice(0, limit).map(({ work, at }) => {
    const map = indexMap(work.title);
    return { work, ranges: toRanges(map.slice(at, at + q.length)) };
  });
}

// 연속된 원문 위치를 구간으로 묶는다 (사이에 낀 공백은 굵게 하지 않음)
function toRanges(positions) {
  const ranges = [];
  for (const p of positions) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === p) last[1] = p + 1;
    else ranges.push([p, p + 1]);
  }
  return ranges;
}

// 촬영지 검색: 장소 이름·주소에 부분 일치. 같은 이름·주소의 촬영지(여러 작품)는 한 번만 나온다. 이름 일치가 위.
// 결과: [{ spot, ranges }] — ranges는 이름에서 굵게 할 구간(주소에서만 맞으면 빈 배열)
export function searchSpots(spots, query, limit = 10) {
  const q = normalize(query);
  if (!q) return [];
  const groups = new Map();
  for (const spot of spots) {
    const key = `${spot.name}|${spot.address}`;
    const inName = normalize(spot.name).indexOf(q);
    const inAddr = normalize(spot.address || '').indexOf(q);
    if (inName < 0 && inAddr < 0) continue;
    if (!groups.has(key)) groups.set(key, { list: [], at: inName >= 0 ? inName : 1e6 + inAddr, len: spot.name.length });
    groups.get(key).list.push(spot);
  }
  // 같은 장소를 찍은 촬영지가 여럿이면 장면 설명이 있는 것을 대표로 보인다
  const hits = [...groups.values()].map((g) => ({ spot: representativeSpot(g.list), at: g.at, len: g.len }));
  hits.sort((a, b) => a.at - b.at || a.len - b.len || a.spot.name.localeCompare(b.spot.name, 'ko'));
  return hits.slice(0, limit).map(({ spot, at }) => ({
    spot,
    ranges: at < 1e6 ? toRanges(indexMap(spot.name).slice(at, at + q.length)) : [],
  }));
}
