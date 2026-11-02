// OpenAI 코스 설명: 브라우저가 보낸 후보 안에서만 순서와 짧은 설명을 만든다.
// 키는 Netlify 환경변수 OPENAI_API_KEY에만 둔다. 실패하면 4xx/5xx를 돌려주고, 브라우저는 규칙 기반 코스로 대체한다.
// 응답: { order: [후보 id...], summary: string, notes: { [id]: string } }

// 모델은 gpt-4o-mini로 고정한다(환경변수로 바꾸지 않는다). 평균 응답 목표는 2~5초이고, 아래는 넘기면 포기하는 한도다.
// Netlify 함수의 기본 제한 시간이 10초라 그 안에서 정했다(src/settings.js의 AI_TIMEOUT_MS와 함께 바꾼다).
const MODEL = 'gpt-4o-mini';
const MAX_CANDIDATES = 8;
const MAX_PICKS = 3; // 촬영지를 빼고 고르는 장소 수(관광지 2 + 카페 1)
const UPSTREAM_TIMEOUT_MS = 8500;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(503, { error: 'not configured' });

  let input;
  try {
    input = await req.json();
  } catch {
    return json(400, { error: 'body' });
  }
  const spot = { name: str(input?.spot?.name, 80), work: str(input?.spot?.work, 80) };
  const candidates = (Array.isArray(input?.candidates) ? input.candidates : [])
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({
      id: str(c.id, 20),
      name: str(c.name, 80),
      kind: ['attraction', 'cafe'].includes(c.kind) ? c.kind : null,
      distanceM: Number.isFinite(c.distanceM) ? Math.round(c.distanceM) : null,
      info: str(c.info, 400),
    }))
    .filter((c) => c.id && c.name && c.kind);
  if (!spot.name || candidates.length === 0) return json(400, { error: 'input' });

  const kindKo = { attraction: '관광지', cafe: '카페' };
  const distances = {};
  if (input?.distances && typeof input.distances === 'object') {
    for (const [k, v] of Object.entries(input.distances).slice(0, 64)) if (Number.isFinite(v)) distances[str(k, 50)] = Math.round(v);
  }
  const system = [
    '너는 촬영지 근처 나들이 코스를 정리하는 도우미다.',
    '반드시 주어진 후보 id만 쓰고 새 장소를 만들지 않는다. 후보 중에서 관광지 1~2곳과 카페 1곳을 골라 방문 순서대로 order에 나열한다(후보를 전부 쓸 필요는 없다). order에는 촬영지를 넣지 않고 후보 id만 넣는다. 후보에 관광지만 있거나 카페만 있으면 있는 종류만 고른다. 관광지와 카페가 모두 후보에 있으면 둘 다 포함한다.',
    '출발점은 촬영지다. 기본 순서는 촬영지 → 관광지 → 카페다. 거리표(이동_직선거리_m)를 보고 전체 직선 이동 거리가 가장 짧고 되돌아가는 동선이 없는 순서를 고른다. 걸리는 시간은 알 수 없으므로 거리만 근거로 삼는다.',
    '작품·촬영지와 분위기나 주제가 어울리는 후보를 우선 고르되, 후보의 "정보"에 적힌 내용만 근거로 삼는다. 정보가 없거나 비슷하면 가까운 곳을 고른다. 이름이나 성격이 거의 같은 후보를 둘 고르지 않는다.',
    '후보 설명(notes)은 고른 후보의 id만 키로 쓰고, 고르지 않은 후보는 쓰지 않는다. 각 설명은 "정보"에 적힌 내용만 근거로 한 문장, 30자 이내로 쓴다.',
    '정보에 없는 분위기·풍경·맛·가격·영업시간·사진 찍기 좋은지 같은 내용은 쓰지 않는다. 정보에 휴관·공사·폐업·운영 중단 안내가 있어도 최신 정보가 아니므로 쓰지 않고, 다른 사실을 고른다. 정보가 "없음"이면 그 후보의 설명은 빈 문자열("")로 둔다.',
    '장소 이름을 그대로 되풀이하거나 "~할 수 있는 곳이에요" 같은 뻔한 말로 채우지 않는다. 정보에서 눈에 띄는 사실 하나를 고른다.',
    '카페는 대표메뉴에 있는 메뉴 이름만 말하고 가격은 말하지 않는다.',
    '요약(summary)은 지도 위에 한 줄로 보이는 코스 소개다. "무엇을 보고, 어디서 쉬는지"를 한 문장, 25자 안팎(최대 35자)으로 쓴다. 예: "조선통신사 이야기를 보고, 카페에서 쉬어가요". 고른 후보의 정보와 거리 순서 안에서만 말하고, 정보에 없는 활동(사진 찍기, 산책 등)은 쓰지 않는다. 장소 이름을 길게 나열하지 않는다.',
    '문체는 차분한 해요체이고 문장은 "~하고, ~해요"로 끝낸다("~입니다", "~이다"로 끝내지 않는다). 느낌표·이모지·유행어(힐링, 핫플 등)·지역명·과장 표현을 쓰지 않는다.',
    '걸리는 시간이나 실제 이동 거리는 지어내지 않는다.',
    'JSON만 출력한다: {"order":[id...],"summary":"코스 한 줄 소개","notes":{"id":"고른 후보 한 줄 설명 또는 빈 문자열"}}',
  ].join('\n');
  const user = JSON.stringify({
    촬영지: `${spot.work} — ${spot.name}`,
    촬영지_id: str(input?.spot?.id, 20),
    이동_직선거리_m: distances,
    후보: candidates.map((c) => ({
      id: c.id,
      이름: c.name,
      분류: kindKo[c.kind],
      촬영지에서_직선거리_m: c.distanceM,
      정보: c.info || '없음',
    })),
  });

  let data;
  const startedAt = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 400, // 고른 장소 3곳의 설명과 요약만 필요하다. 길게 쓰면 응답이 느려진다.
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 원인 확인용 로그: 상태와 오류 코드만 남긴다(메시지에는 키 일부가 들어갈 수 있어 남기지 않는다).
      const err = await res.json().catch(() => ({}));
      console.error('OpenAI 호출 실패', res.status, err?.error?.code || err?.error?.type || '');
      return json(502, { error: 'upstream' });
    }
    const body = await res.json();
    // 응답 시간 확인용 로그(평균 2~5초가 목표). 글자 수만 남기고 내용은 남기지 않는다.
    console.log('OpenAI 응답', `${Date.now() - startedAt}ms`, `입력 ${body.usage?.prompt_tokens ?? '?'}토큰`, `출력 ${body.usage?.completion_tokens ?? '?'}토큰`);
    data = JSON.parse(body.choices?.[0]?.message?.content || '{}');
  } catch (e) {
    console.error('OpenAI 호출 실패', e?.name || 'error'); // TimeoutError면 시간 초과
    return json(502, { error: 'upstream' });
  }

  // 서버에서도 검증: 후보 안의 id이고 중복이 없으며 1~3곳이 아니면 버린다(브라우저가 종류별 개수까지 다시 검증한다).
  const ids = new Set(candidates.map((c) => c.id));
  const spotId = str(input?.spot?.id, 20);
  const order = Array.isArray(data.order) ? data.order.filter((id) => typeof id === 'string' && id !== spotId) : [];
  if (order.length < 1 || order.length > MAX_PICKS || new Set(order).size !== order.length || !order.every((id) => ids.has(id))) {
    console.error('OpenAI 순서 거절', JSON.stringify(order), '후보', [...ids].join(',')); // 후보 id만 남긴다
    return json(422, { error: 'invalid order' });
  }
  const notes = {};
  for (const id of order) if (typeof data.notes?.[id] === 'string') notes[id] = data.notes[id].slice(0, 120);
  return json(200, { order, summary: str(data.summary, 160), notes });
};
