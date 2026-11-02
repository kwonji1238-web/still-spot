// 부산 안인지 가리는 대략의 범위(남서·북동 모서리). 본인 위치가 이 안이면 안내 팝업을 띄우지 않는다.
// TODO(열린 결정: 부산 범위) 행정구역 경계가 아니라 사각형 근사값이다.
export const BUSAN_BOUNDS = { south: 34.88, west: 128.75, north: 35.40, east: 129.32 };

// 확정 문구와 [제안]·열린 결정 값을 한 곳에 모은다. 바꿀 때는 이 파일만 고친다.

// 확정 문구 (design.md 5장 "화면별 문구", naming.md)
export const COPY = {
  // 상단 서비스명(영문 워드마크). 한글 이름은 스틸스팟(naming.md), 화면 상단에는 이 표기를 쓴다.
  wordmark: 'STILL-SPOT',
  heroCopy: '영화 속 그 장소로 이어지는 길',
  searchPlaceholder: '국내 영화나 드라마를 검색하세요',
  trendingLabel: '요즘 뜨는 촬영지',
  matchingLabel: '일치하는 작품',
  matchingSpotLabel: '일치하는 촬영지',
  // 검색 결과 없음 문구
  noResult: '일치하는 작품, 촬영지가 없어요',
  noResultHint: '띄어쓰기나 철자를 바꿔 검색해 보세요',
  emptyQuery: '작품 이름을 입력해 주세요',
  photoSpotLabel: '사진 남기기 좋은 촬영지',
  backToMap: '지도로 돌아가기',
  noCoords: '지도에는 표시할 수 없어요. 주소만 안내해요',
  courseLoading: '다음 장면을 고르고 있어요',
  courseDone: '찾았다! 이 근처 코스예요',
  addressOnly: '주소만 표시',
  viewOnMap: '지도로 보기',
  nearbyTitle: '근처에 이런 곳',
  nearbySub: '촬영지에서 가까운 곳',
  courseButton: '이 근처 코스 보기',
  courseTopbar: '근처 코스',
  copyAddress: '주소 복사',
  // S3(촬영지 바텀시트)
  worksHereTitle: '이 장소에서 촬영된 작품',
  reviewsTitle: '다녀온 후기',
  reviewsSoon: '준비 중이에요',
  intro: '소개',
  cancel: '취소',
  source:
    '촬영지 정보는 부산광역시가 제공한 공공데이터를 바탕으로 합니다. 지도 위치는 주소를 변환한 값이라 실제와 다를 수 있습니다.',
  // TMDB 고지 원문(홈 맨 아래에만). 말투를 바꾸지 않는다. 포스터가 하나라도 있을 때만 보인다.
  tmdbCredit: '© TMDB - All movie-related data and images. (This product uses the TMDB API but is not endorsed or certified by TMDB.)',
  // TODO(열린 결정: S5 출처 문구) 관광지·식당 데이터 제공처를 확인한 뒤 정한다. 비어 있으면 화면에 칸을 만들지 않는다.
  placeSource: '',
  // TODO(열린 결정: 토스트 문구와 표시 시간) design.md 5장의 예시 문구. 확정 아님.
  copiedToast: '주소를 복사했어요',
  // TODO(열린 결정: 오류 문구) design.md 5장의 예시 문구. 확정 아님.
  loadError: '정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요',
  retry: '다시 시도',
  // "본인 위치" 버튼과 안내 팝업. 위치는 저장하지 않고 서버로 보내지 않는다. 부산 밖이면 부산으로 옮길지 묻고, 위치를 못 받으면 닫기만 있는 안내를 띄운다.
  // TODO(열린 결정: 본인 위치 버튼·안내 팝업 문구) 사용자가 정한 내용(부산만 서비스)을 해요체로 옮긴 임시 문구. 화면 문구에는 지역명을 쓰지 않는다는 규칙의 예외라 확인이 필요하다.
  // 상단 서비스명(로고)을 누르면 첫 화면으로. 눈에 보이는 글자는 없고 접근성 이름으로만 쓴다.
  goHome: '스틸스팟 첫 화면으로',
  locate: '본인 위치',
  locateDialog: '현재는 부산 지역만 서비스하고 있어요',
  locateBody: '지도를 부산으로 옮겨 드릴까요?',
  locateGo: '부산으로 이동',
  // 위치를 못 받았을 때(권한 거부·시간 초과·미지원). 부산 밖일 때와 다른 안내다.
  locateFailTitle: '위치를 확인하지 못했어요',
  locateFailBody: '위치 접근을 허용하면 내 위치를 지도에 보여 드려요',
  close: '닫기',
  back: '뒤로 가기',
  searchLabel: '작품 검색',
  searchSubmit: '검색',
  sheetFold: '목록 접기',
  sheetUnfold: '목록 펼치기',
  fitWork: '이 작품의 촬영지 모두 보기',
  // TODO(열린 결정: 테마 전환 버튼의 문구) design.md·naming.md에 없는 안내 문구라 임시로 정했다. 아이콘 버튼의 접근성 이름으로만 쓴다.
  themeToDark: '다크 모드로 전환',
  themeToLight: '라이트 모드로 전환',
};

export const KIND_LABEL = { spot: '촬영지', attraction: '관광지', restaurant: '식당', cafe: '카페' };

// 검색 화면의 고정 촬영지. 섹션마다 두 곳을 보이고, 고정이 모자란 자리는 무작위로 채운다. 순위가 아니다.
// work·place는 데이터(cinemap.json)의 작품명·장소명 그대로이고, label은 카드에 보일 이름이다. 데이터에 없으면 그 곳은 빠진다.
// 사진: image는 images/에 둔 파일이다(데이터에 촬영지 사진이 없어서, 출처는 images/CREDITS.md). credit이 있으면 카드에 그 문구를 그대로 보인다.
// TODO(열린 결정: 카드를 눌렀을 때 이동 대상) 지금은 그 촬영지의 지도 화면(S2)에서 핀을 강조한다. 촬영지 바텀시트를 고칠 때 함께 정한다.
const DOMOHEON_PHOTO = { image: 'images/domoheon.jpg', credit: '[출처 : 부산시]' };

// 촬영지 상세(S3) 맨 위 이미지 영역의 사진(images 배열이면 여러 장이 캐러셀로 보인다). 키는 촬영지 이름이고 같은 이름의 촬영지(모든 작품)에 붙는다. 없는 촬영지는 서비스 로고.
// 데이터에 촬영지 사진이 없어서 images/에 둔 파일만 쓴다.
export const SPOT_PHOTOS = {
  '부산시 열린행사장': DOMOHEON_PHOTO,
  '문화공감수정(정란각)': { image: 'images/jeongrangak.jpg', images: ['images/jeongrangak.jpg', 'images/jeongrangak-inside.jpg'] },
};

export const FEATURED = {
  trending: [
    // 도모헌 사진은 직접 넣은 파일이고, 출처 문구는 카드에 그대로 보인다.
    { work: 'JTBC 재벌집 막내아들', place: '부산시 열린행사장', label: '부산시장 관사(현 도모헌)', image: DOMOHEON_PHOTO.image, credit: DOMOHEON_PHOTO.credit },
    // 흰여울문화마을을 찍은 작품은 6편이다(효심이네 각자도생, 도라이버, 암수살인, 변호인 등). 그중 하나를 골랐다.
    { work: '변호인', place: '흰여울문화마을', image: 'images/huinnyeoul.jpg' },
  ],
  photo: [
    { work: '범죄와의 전쟁: 나쁜놈들 전성시대', place: '문화공감수정(정란각)', label: '정란각', image: 'images/jeongrangak.jpg' },
    // 바닷가에 있는 촬영지. 광안리해수욕장을 찍은 작품은 6편이다(블랙 팬서, 라켓소년단, 챔피언 등).
    { work: '블랙 팬서', place: '광안리해수욕장', image: 'images/gwangalli.jpg' },
  ],
};

// TODO(열린 결정: 코스 후보 반경) PRD 6장. 1·2·3km 채움 비율을 계산한 뒤 정한다. 지금 값은 임시.
export const NEARBY_RADIUS_M = 3000;

// 근처 미리보기(S3)와 근처 장소 핀(S2): 관광지 최대 2 + 식당 최대 1
export const PREVIEW_LIMITS = { attraction: 2, restaurant: 1 };
// 코스(S4): 관광지 최대 2 + 식당 최대 1 + 카페 최대 1
export const COURSE_LIMITS = { attraction: 2, restaurant: 1, cafe: 1 };
// TODO(열린 결정: 코스 표시 순서) 와이어프레임의 가정(촬영지 → 관광지 → 식당 → 카페)을 쓴다. 가까운 순 정렬은 미정.
export const COURSE_KIND_ORDER = ['spot', 'attraction', 'restaurant', 'cafe'];

// TODO(열린 결정: OpenAI 대기 시간 기준) PRD 5장 미정. 넘으면 규칙 기반 코스로 대체한다.
export const AI_TIMEOUT_MS = 9500; // 서버 함수의 대기 한도(netlify/functions/course.js, 8.5초)보다 길게 둔다

// [제안] 토스트 표시 시간
export const TOAST_MS = 2000;


// TODO(열린 결정: 경로 지도 높이) PRD 6장 제안 약 200px. styles.css의 --route-map-h와 같이 바꾼다.
