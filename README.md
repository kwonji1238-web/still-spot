# 스틸스팟 (Still Spot)

영화·드라마 속 촬영지를 지도에서 찾고, 원하면 근처 관광지·식당·카페까지 코스로 이어 보는 모바일 우선 웹 서비스입니다.
저장소 이름은 `still-spot`입니다.

> 대표 카피: 영화 속 그 장소로 이어지는 길

## 주요 기능

- **지도로 시작하는 첫 화면**: 부산 전체 지도에 촬영지 핀이 찍혀 있고, 확대하면 핀이 흩어지고 이름이 보입니다. 많이 뭉친 곳만 개수로 묶입니다.
- **작품·촬영지 검색**: 작품 이름이나 촬영지 이름·주소로 찾습니다. 검색 전에는 "요즘 뜨는 촬영지"와 "사진 남기기 좋은 촬영지"를 보여 줍니다.
- **작품 시트**: 작품의 촬영지 목록과 지도를 함께 보고, 포스터를 누르면 모든 촬영지가 한눈에 보이게 지도가 맞춰집니다.
- **촬영지 상세**: 사진(여러 장이면 캐러셀), 장면 설명, 같은 장소에서 촬영된 다른 작품, 근처 관광지·식당·카페 미리보기.
- **근처 코스**: 촬영지 → 관광지 최대 2 → 카페 최대 1을 코스로 묶고, 전체 경로를 지도에 보여 줍니다. 반경 5km에서 찾고(부족하면 8km, 12km로 확대), AI(OpenAI `gpt-4o-mini`)가 가까운 후보 중에서 어울리는 곳을 골라 순서와 추천 이유를 만듭니다. 실패하면 규칙 기반 코스로 대체합니다.
- **장소 상세**: 관광지·식당·카페 상세 페이지, 서비스 안의 지도로 보기.
- 본인 위치 버튼, 주소 복사, 라이트·다크 테마, PC 화면(768px 이상: 목록 패널 + 지도 + 상세 패널).

만들지 않은 것: 후기, 로그인, 저장, 데이터베이스, 구·군 필터.

## 기술 구성

- 정적 HTML + 브라우저 JavaScript(ES modules). 프레임워크와 번들러는 쓰지 않습니다.
- 지도는 카카오맵 JavaScript SDK입니다.
- 데이터는 `data/*.json` 스냅샷을 브라우저가 읽습니다. 검색, 거리 계산, 규칙 기반 코스도 브라우저에서 합니다.
- 서버 코드는 OpenAI를 부르는 Netlify Function 하나(`netlify/functions/course.js`)뿐입니다. 후보에 없는 장소를 지어낸 응답은 버리고 규칙 기반 코스로 대체합니다.
- 배포는 Netlify입니다(`main` 브랜치에 푸시하면 자동 배포).

## 폴더 구조

```
index.html            진입 페이지
src/                  앱 코드 (data, search, geo, candidates, course, api, app, render, map, theme, featured, settings)와 styles.css(디자인 토큰·스타일)
netlify/functions/    OpenAI 코스 설명 함수
data/                 원본 데이터(JSON), 장면 설명(scenes.json)과 출처
images/               촬영지 사진 (출처는 images/CREDITS.md)
icon/                 파비콘, 앱 아이콘, site.webmanifest
scripts/              빌드·개발 서버·데이터 만들기 스크립트
tests/                node --test 테스트
docs/data-schema.md   데이터 구조 설명
DESIGN.md             디자인과 화면 동작 기준
CLAUDE.md             작업 규칙
```

## 실행

필요한 것: Node.js(내장 `node --test`와 `fetch`를 씁니다. 개발과 테스트는 v24에서 했고 다른 버전은 확인하지 못했습니다).

1. 저장소 루트에 `.env`를 만들고 `.env.example`의 이름을 채웁니다. 화면을 띄우는 데 필요한 값은 아래 두 가지입니다.
   - `KAKAO_JS_KEY`: 카카오 JavaScript 키(없으면 지도 없이 목록·상세·코스 카드만 동작)
   - `OPENAI_API_KEY`: 코스 설명용(없으면 규칙 기반 코스만 동작)
2. `npm run dev`를 실행하면 `dist/`를 만들고 `http://localhost:8000`에서 띄웁니다. 카카오 개발자 사이트의 JavaScript SDK 도메인에 `http://localhost:8000`이 등록되어 있어야 지도가 보입니다.

```
npm run build   # dist/ 만들기 (배포와 같은 빌드)
npm test        # 테스트
```

`.env`와 `config.js`는 저장소에 올라가지 않습니다. `OPENAI_API_KEY`와 `DATA_GO_KR_KEY`는 브라우저 코드와 저장소에 넣지 않습니다.

## 배포 (Netlify)

- Build command: `node scripts/build.mjs`, Publish directory: `dist`, Functions: `netlify/functions` (`netlify.toml`에 있음)
- 환경변수: `KAKAO_JS_KEY`(빌드 때 `config.js`로 들어감), `OPENAI_API_KEY`(코스 설명은 `gpt-4o-mini`로 고정이라 모델 환경변수는 쓰지 않음)
- 배포 주소가 나오면 카카오 개발자 사이트의 JavaScript SDK 도메인에 그 주소를 등록해야 지도가 보입니다.
- 배포본의 `dist/data/`에는 화면이 쓰는 필드만 남긴 데이터가 들어갑니다(`scripts/slim.mjs`). 원본은 `data/`에 그대로 있고, 다른 필드가 필요하면 `scripts/slim.mjs`의 목록에 이름을 더하고 다시 빌드합니다.

## 데이터와 출처

| 자료 | 출처 | 파일 |
|---|---|---|
| 촬영지(작품명·장소명·주소) | 부산광역시가 제공한 공공데이터(씨네맵). 주소를 카카오로 변환해 좌표를 만듦 | `data/cinemap.json` |
| 관광지 | 부산광역시 공공데이터(부산명소) | `data/attractions.json` |
| 식당·카페 | 부산광역시 공공데이터(맛집정보) + 직접 붙인 분류 | `data/restaurants.json` |
| 작품 포스터·개봉연도·장르 | TMDB (이 서비스는 TMDB API를 쓰지만 TMDB의 보증을 받지 않습니다) | `data/posters.json` |
| 촬영지 장면 설명 | 직접 조사해 작성(출처는 `data/scenes-sources.md`) | `data/scenes.json` |
| 촬영지 사진 | 위키미디어 커먼즈 등(출처는 `images/CREDITS.md`) | `images/` |

- 지도 위치는 주소를 변환한 값이라 실제와 다를 수 있습니다. 좌표가 없는 촬영지(111건)는 지도에 핀이 없고 "주소만 표시"로 보입니다.
- 이름 앞에 "[폐업]"이 붙은 촬영지 67건은 화면에 내지 않습니다(원본 파일에는 그대로 있음).
- 데이터 구조는 [docs/data-schema.md](docs/data-schema.md)에 있습니다.

## 데이터 다시 만들기 (필요할 때만)

| 스크립트 | 하는 일 | 필요한 키(`.env`) |
|---|---|---|
| `scripts/cinemap.py` | 촬영지·관광지를 받아 `data/`에 저장하고 주소를 좌표로 변환 | `DATA_GO_KR_KEY`, `KAKAO_REST_KEY` |
| `scripts/restaurants.py` | 식당·카페를 받아 분류 | `DATA_GO_KR_KEY` |
| `scripts/posters.mjs` | 작품 포스터·정보를 TMDB에서 받음 | `TMDB_API_KEY` |

스크립트를 다시 돌리면 `data/`에 점검용 파일(`geocode-failures.json`, `restaurants-issues.json`, `restaurants-review-sample.md`)도 함께 생기는데, 서비스는 읽지 않아서 `.gitignore`로 제외했습니다.

## 문서

- [DESIGN.md](DESIGN.md): 화면 구성·동작, 색, 서체, 컴포넌트, 모션, 말투
- [CLAUDE.md](CLAUDE.md): 이 저장소에서 작업할 때의 규칙
- [docs/data-schema.md](docs/data-schema.md): 데이터 필드와 처리 규칙

정리 전의 기획 문서와 점검 보고서 등은 `archive/dev` 브랜치에 남아 있습니다.
