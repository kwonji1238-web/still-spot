// OpenAI 코스 설명 호출 (Netlify Function 경유). 실패·지연·검증 실패는 모두 null → 규칙 기반 코스.

import { AI_TIMEOUT_MS } from './settings.js';
import { validateAiCourse, placeInfo } from './course.js';
import { distanceM } from './geo.js';

// pool: 촬영지에서 가까운 관광지·카페 후보. OpenAI가 이 안에서 고르고 순서를 정한다.
export async function fetchAiCourse(spot, pool) {
  if (pool.length === 0) return null;
  const candidates = pool;
  // 촬영지와 후보 사이, 후보끼리의 직선 거리(m). 전체 이동 거리가 짧은 순서를 고르는 근거다.
  const points = [spot, ...candidates.map((c) => c.place)];
  const distances = {};
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) distances[`${points[i].id}~${points[j].id}`] = Math.round(distanceM(points[i], points[j]));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch('/.netlify/functions/course', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        spot: { id: spot.id, name: spot.name, work: spot.work },
        distances,
        candidates: candidates.map((c) => ({
          id: c.place.id,
          name: c.place.name,
          kind: c.place.kind,
          distanceM: Math.round(c.distance),
          info: placeInfo(c.place),
        })),
      }),
    });
    if (!res.ok) return null;
    return validateAiCourse(spot, candidates, await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
