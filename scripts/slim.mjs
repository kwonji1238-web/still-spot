// 배포용 데이터: 화면과 AI 코스 설명이 쓰는 필드만 남긴다. data/의 원본 파일은 그대로 두고, dist/data/에만 줄인 사본을 만든다.
// 나중에 다른 필드(예: 작품 줄거리 overview, 출연 cast)가 필요하면 아래 목록에 이름을 더하고 다시 빌드하면 된다.
export const FIELDS = {
  cinemap: ['opusNm', 'plcNm', 'roadNmAddr', 'lat', 'lng', '변환상태'],
  attractions: ['UC_SEQ', 'MAIN_TITLE', 'ADDR1', 'LAT', 'LNG', 'MAIN_IMG_NORMAL', 'MAIN_IMG_THUMB', 'ITEMCNTNTS', 'TITLE', 'SUBTITLE'],
  restaurants: ['UC_SEQ', 'MAIN_TITLE', 'ADDR1', 'LAT', 'LNG', 'RPRSNTV_MENU', 'MAIN_IMG_THUMB', 'category', 'closed_notice'],
  // 포스터 파일은 { 작품명: {...} } 모양이다
  posters: ['path', 'year', 'genres'],
};

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export const slimRows = (rows, kind) => rows.map((r) => pick(r, FIELDS[kind]));
export const slimPosters = (posters) => Object.fromEntries(Object.entries(posters).map(([title, p]) => [title, pick(p, FIELDS.posters)]));
