// 화면 마크업. 상태를 갖지 않고 HTML 문자열만 만든다. 이벤트는 data-action으로 app.js가 받는다.

import { COPY, KIND_LABEL } from './settings.js';
import { formatDistance } from './geo.js';
import { themeButton } from './theme.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ── 아이콘 (선 아이콘, currentColor) ──
const svg = (d, size = 20, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const icon = {
  back: () => svg('<path d="M15 5l-7 7 7 7"/>'),
  close: () => svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: () => svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  chev: () => svg('<path d="M9 5l7 7-7 7"/>', 18),
  up: () => svg('<path d="M5 15l7-7 7 7"/>'),
  down: () => svg('<path d="M5 9l7 7 7-7"/>'),
  locate: () => svg('<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.75"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>'),
  // 지도 핀 안의 식당(포크·나이프)·카페(컵) 아이콘
  food: (size = 14) => svg('<path d="M6 3v6a2 2 0 004 0V3M8 3v18M17 21V3c-2.2 1.2-3 4-3 7h3"/>', size),
  cafe: (size = 14) => svg('<path d="M4.5 9h11v4a5 5 0 01-5 5h-1a5 5 0 01-5-5V9zM15.5 10.5h1.5a2 2 0 010 4h-1.5M8 3.5v2.5M12 3.5v2.5"/>', size),
  pin: () => svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.25"/>', 16),
  warn: () =>
    `<svg class="warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v4.5M12 17.25v.01" stroke-linecap="round"/></svg>`,
};

// ── 필름 코너 마크: 모서리마다 가로·세로 선 1개씩, 모두 8개 ──
export function corners(len, sw = 1.5) {
  const s = len, h = sw / 2;
  const c = (pos, d) =>
    `<svg class="fc fc-${pos}" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}"/></svg>`;
  return (
    c('tl', `M${h} ${s}V${h}H${s}`) + c('tr', `M0 ${h}H${s - h}V${s}`) +
    c('bl', `M${h} 0V${s - h}H${s}`) + c('br', `M0 ${s - h}H${s - h}V0`)
  );
}

// 로고 심볼(브랜드 마크). 좌표는 icon/ 폴더의 원본 벡터와 같고, 색은 currentColor라 ink 토큰을 따른다.
export const logoMark = () =>
  `<svg class="logo-mark" viewBox="3.75 3.75 56.5 56.5" aria-hidden="true"><path d="M6 24V6H24M40 6H58V24M58 40V58H40M24 58H6V40" fill="none" stroke="currentColor" stroke-width="4.5" stroke-miterlimit="10"/><circle cx="32" cy="32" r="8" fill="currentColor"/></svg>`;

export const numBadge = (no) =>
  no == null
    ? `<span class="badge framed is-none" aria-hidden="true">${corners(7)}<span class="n">–</span></span>`
    : `<span class="badge framed" aria-hidden="true">${corners(7)}<span class="n">${no}</span></span>`;

const emptyTile = () => `<span class="tile framed" aria-hidden="true">${corners(10)}</span>`;
const thumbTile = (place) =>
  place.thumb
    ? `<span class="tile"><img src="${esc(place.thumb)}" alt="" loading="lazy" data-fallback="tile"></span>`
    : emptyTile();

const count = (n) => `촬영지 <span class="num">${n}</span>곳`;
const dist = (m) => {
  const d = formatDistance(m);
  return `<span class="num">${d.value}</span>${d.unit}`;
};
const kindDist = (kind, m) => `${KIND_LABEL[kind]} · 직선 ${dist(m)}`;
const source = () => `<p class="source">${esc(COPY.source)}</p>`;
// 바텀시트가 올라와 있어도 맨 위의 서비스명 줄(로고·테마 버튼)은 그대로 둔다. 홈의 상단 메뉴와 같은 모양.
const topBrand = () =>
  `<header class="home-top"><button class="brand-lock" type="button" data-action="home" aria-label="${esc(COPY.goHome)}">${logoMark()}<span class="wordmark" lang="en">${esc(COPY.wordmark)}</span></button>${themeButton()}</header>`;
const backBtn = () => `<button class="btn-icon" data-action="back" aria-label="${esc(COPY.back)}">${icon.back()}</button>`;
const chev = () => `<span class="chev">${icon.chev()}</span>`;

// ── S1·E1·E2 ──
export function homeScreen(q, { credit = false } = {}) {
  return `
  <div class="home" id="home">
    <header class="home-top">
      <button class="btn-icon is-bare home-back" type="button" data-action="search-cancel" aria-label="${esc(COPY.backToMap)}">${icon.back()}</button>
      <button class="brand-lock" type="button" data-action="home" aria-label="${esc(COPY.goHome)}">${logoMark()}<span class="wordmark" lang="en">${esc(COPY.wordmark)}</span></button>${themeButton()}
    </header>
    <h1 class="sr-only">${esc(COPY.heroCopy)}</h1>
    <form class="search-row" role="search" data-action="search-submit">
      <label class="search">
        <span class="sr-only">${esc(COPY.searchLabel)}</span>
        <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(COPY.searchPlaceholder)}" value="${esc(q)}">
        <button class="btn-icon" type="submit" aria-label="${esc(COPY.searchSubmit)}">${icon.search()}</button>
      </label>
    </form>
    <div class="search-panel" id="search-panel">
      <div class="notice is-error" id="search-hint" role="alert" hidden>${icon.warn()}<p>${esc(COPY.emptyQuery)}</p></div>
      <div class="results" id="results"></div>
      ${credit ? `<p class="source home-credit">${esc(COPY.tmdbCredit)}</p>` : ''}
    </div>
  </div>`;
}

// 본인 위치 버튼과 안내 팝업. 화면이 바뀌어도 남도록 #screen 밖(body)에 한 번만 둔다.
export const locateControls = () => `
  <button class="btn-icon locate" type="button" data-action="locate" aria-label="${esc(COPY.locate)}">${icon.locate()}</button>
  <div class="dialog-back" id="locate-dialog" hidden>
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="locate-dialog-title" aria-describedby="locate-dialog-body">
      <button class="btn-icon is-bare dialog-x" type="button" data-action="close-dialog" aria-label="${esc(COPY.close)}">${icon.close()}</button>
      <h2 class="t-title" id="locate-dialog-title">${esc(COPY.locateDialog)}</h2>
      <p class="t-body c-sub" id="locate-dialog-body">${esc(COPY.locateBody)}</p>
      <button class="btn btn-fill" id="locate-dialog-btn" type="button" data-action="locate-go">${esc(COPY.locateGo)}</button>
    </section>
  </div>`;

const workRow = (work, label, strong = true) => `
  <li><button class="row" data-action="open-work" data-title="${esc(work.title)}">
    <span class="grow"><span class="${strong ? 't-strong ' : ''}clamp2">${label ?? esc(work.title)}</span><span class="t-sub">${count(work.spots.length)}</span></span>
    ${chev()}
  </button></li>`;

// 검색 전·결과 없음: 섹션마다 촬영지 사진 카드 두 개. 사진이 없으면 빈 프레임.
const spotCard = (c) => `
  <li><button class="photo-card" data-action="pick-spot-card" data-id="${c.spot.id}">
    ${c.image
      ? `<span class="photo-card-img"><img src="${esc(c.image)}" alt="" loading="lazy" data-fallback="tile"></span>`
      : `<span class="photo-card-img framed" aria-hidden="true">${corners(14)}</span>`}
    <span class="t-strong clamp1">${esc(c.label)}</span><span class="t-sub c-sub clamp1">${esc(c.work)}</span>${c.credit ? `<span class="t-micro c-sub">${esc(c.credit)}</span>` : ''}
  </button></li>`;

const featuredSection = (title, cards) =>
  cards.length ? `<section class="stack-12"><h2 class="section-title">${esc(title)}</h2><ul class="photo-grid">${cards.map(spotCard).join('')}</ul></section>` : '';

export function featuredBlock({ trending, photo }) {
  return featuredSection(COPY.trendingLabel, trending) + featuredSection(COPY.photoSpotLabel, photo);
}

function highlight(title, ranges) {
  let out = '', i = 0;
  for (const [a, b] of ranges) {
    out += esc(title.slice(i, a)) + `<b>${esc(title.slice(a, b))}</b>`;
    i = b;
  }
  return out + esc(title.slice(i));
}

export function matchBlock(hits, spotHits = []) {
  const works = hits.length
    ? `<section class="stack-8"><h2 class="section-title">${esc(COPY.matchingLabel)}</h2>
    <ul class="list">${hits
      .map((h) => workRow(h.work, `<span class="match">${highlight(h.work.title, h.ranges)}</span>`, false))
      .join('')}</ul></section>`
    : '';
  // 촬영지 검색 결과: 누르면 그 촬영지로 간다(첫 화면 핀을 누른 것과 같다)
  const spots = spotHits.length
    ? `<section class="stack-8"><h2 class="section-title">${esc(COPY.matchingSpotLabel)}</h2>
    <ul class="list">${spotHits
      .map(
        (h) => `<li><button class="row" data-action="pick-spot-hit" data-id="${h.spot.id}">
      <span class="grow"><span class="clamp2"><span class="match">${highlight(h.spot.name, h.ranges)}</span></span><span class="t-sub c-sub clamp2">${esc(h.spot.address)}</span></span>${chev()}</button></li>`,
      )
      .join('')}</ul></section>`
    : '';
  return works + spots;
}

export function noResultBlock(featured) {
  return `<section class="empty-msg" aria-live="polite"><h2 class="t-title">${esc(COPY.noResult)}</h2><p class="t-sub c-sub">${esc(COPY.noResultHint)}</p></section>${featuredBlock(featured)}`;
}

// ── S2 시트 · PC 목록 패널 ──
function spotRow(spot, selectedId) {
  const chip = spot.no == null ? `<span class="chip-kind"><span class="dot-ring" aria-hidden="true"></span>${esc(COPY.addressOnly)}</span>` : '';
  const label = spot.no == null ? '' : `<span class="sr-only">${spot.no}번 </span>`;
  const sel = spot.id === selectedId;
  // 줄 어디를 눌러도 상세(S3·E3)로 간다. 지도에서 그 핀을 보는 것은 핀을 눌러서 한다.
  return `<li><button class="row${sel ? ' is-sel' : ''}" data-action="open-spot" data-id="${spot.id}" id="row-${spot.id}"${sel ? ' aria-current="true"' : ''}>${numBadge(spot.no)}
    <span class="grow"><span class="t-strong clamp2">${label}${esc(spot.name)}</span><span class="t-sub c-sub">${esc(spot.address)}</span>${chip ? `<span class="meta">${chip}</span>` : ''}</span>${chev()}</button></li>`;
}

// 작품 정보. 포스터 옆 칸은 촬영지 N곳 / 작품명 / 개봉연도 | 장르 순이다(줄거리·출연은 보이지 않는다). 있는 줄만 나온다(접힌 시트에서는 CSS가 감춘다).
// 말줄임된 글(data-expand)은 누르면 펼쳐지고 다시 누르면 접힌다.
function workMeta(info) {
  if (!info) return '';
  const yg = [info.year, info.genres.join(', ')].filter(Boolean).join(' | ');
  return yg ? `<p class="t-sub work-meta">${esc(yg)}</p>` : '';
}

// 포스터가 없거나 못 불러오면 서비스 로고를 보인다. 못 불러온 경우는 app.js의 error 처리가 바꾼다.
const posterBox = (work) =>
  work.poster
    ? `<span class="poster"><img src="${esc(work.poster)}" alt="" loading="lazy" data-fallback="poster"></span>`
    : `<span class="poster is-logo" aria-hidden="true">${logoMark()}</span>`;

// fit: 지도가 있을 때 포스터를 누르면 이 작품의 촬영지가 모두 보이게 지도를 줄인다
export function workHead(work, { toggle = null, fit = false } = {}) {
  const btn = toggle
    ? `<button class="btn-icon is-bare" data-action="sheet-toggle" aria-label="${toggle === 'down' ? COPY.sheetFold : COPY.sheetUnfold}">${toggle === 'down' ? icon.down() : icon.up()}</button>`
    : '';
  return `<header class="sheet-head">
    <div class="sheet-head-row">
    ${fit ? `<button class="poster-btn" type="button" data-action="fit-work" aria-label="${esc(COPY.fitWork)}">${posterBox(work)}</button>` : posterBox(work)}
    <div class="grow"><p class="t-sub">${count(work.spots.length)}</p><h1 class="t-title clamp1" data-expand aria-expanded="false">${esc(work.title)}</h1>${workMeta(work.info)}</div>
    ${btn}
    </div>
  </header>`;
}

export function spotList(work, selectedId) {
  return `<ol class="list">${work.spots.map((s) => spotRow(s, selectedId)).join('')}</ol>${source()}`;
}

export function workScreenMobile(work, { mapOn, selectedId, level }) {
  if (!mapOn) {
    return `<div class="map-ctrl is-static" style="padding-left:var(--gutter);padding-right:var(--gutter)">
      ${backBtn()}</div>
      <section class="sheet is-static">${workHead(work)}<div class="sheet-body">${spotList(work, selectedId)}</div></section>`;
  }
  return `
    ${topBrand()}
    <div class="map-ctrl is-below">
      ${backBtn()}
    </div>
    <section class="sheet" id="sheet" data-level="${level}">
      <div class="sheet-grip" data-drag><span></span></div>
      <div data-drag>${workHead(work, { toggle: level === 'expanded' ? 'down' : 'up', fit: true })}</div>
      <div class="sheet-body" id="sheet-body">${spotList(work, selectedId)}</div>
    </section>`;
}

// ── S3 · E3 ──
// 촬영지 바텀시트(모바일)와 상세 패널(PC)이 같은 내용을 쓴다:
// 사진(없으면 로고) + 이름·주소·장면 설명 / 이 장소에서 촬영된 작품 / 근처에 이런 곳 / 코스 보기(얇은 버튼) / 다녀온 후기.
// 촬영지 데이터에는 사진이 없어서 사진 칸은 늘 로고다. 장면 설명은 data/scenes.json에 있는 촬영지에만 나온다.
function spotHead(spot, { toggle = null } = {}) {
  const btn = toggle
    ? `<button class="btn-icon is-bare" data-action="sheet-toggle" aria-label="${toggle === 'down' ? COPY.sheetFold : COPY.sheetUnfold}">${toggle === 'down' ? icon.down() : icon.up()}</button>`
    : '';
  const scene = spot.scene ? `<p class="spot-scene t-sub clamp2" data-expand aria-expanded="false">${esc(spot.scene)}</p>` : '';
  // 맨 위 이미지 영역. 사진이 있는 촬영지(settings.js의 SPOT_PHOTOS)는 그 사진을,
  // 없거나 못 불러오면 서비스 로고를 보인다. 접힌 시트에서는 CSS가 이 영역을 감춘다. PC 패널은 X를 이 영역 위의 별도 줄에 둔다.
  // 사진이 여러 장이면 옆으로 넘기는 캐러셀이다. 왼쪽 여백은 지키고 오른쪽은 화면 끝까지 열어 두 번째 사진이 걸쳐 보인다.
  const slides = spot.photos?.length
    ? spot.photos.map((src) => `<div class="spot-slide"><img src="${esc(src)}" alt="" loading="lazy" data-fallback="hero"></div>`).join('')
    : `<div class="spot-slide is-logo">${logoMark()}</div>`;
  const hero = `<div class="spot-hero${spot.photos?.length > 1 ? ' is-multi' : ''}"><div class="spot-hero-track">${slides}</div></div>`;
  const credit = spot.photoCredit ? `<p class="t-micro c-sub">${esc(spot.photoCredit)}</p>` : '';
  return `<header class="sheet-head spot-head">
    ${hero}
    <div class="sheet-head-row">
    <div class="grow"><h1 class="t-title clamp2" data-expand aria-expanded="false">${esc(spot.name)}</h1><p class="t-sub c-sub">${esc(spot.address)}</p>${scene}${credit}</div>
    ${btn}
    </div>
  </header>`;
}

const workThumb = ({ spot, work }, current) =>
  `<button class="work-thumb" data-action="view-on-map" data-id="${spot.id}"${current ? ' aria-current="true"' : ''}>${posterBox(work)}<span class="t-micro clamp2">${esc(work.title)}</span></button>`;

// works: [{ spot, work }] 이 촬영지의 작품이 맨 앞
function spotBody(spot, { works, preview, hasCourse }) {
  const coords = spot.lat !== null;
  const worksHere = `<section class="stack-8"><h2 class="section-title">${esc(COPY.worksHereTitle)}</h2>
    <div class="hscroll">${works.map((w, i) => workThumb(w, i === 0)).join('')}</div></section>`;

  const nearby = preview.length
    ? `<section class="nearby stack-8">
        <div class="nearby-head"><h2 class="section-title">${esc(COPY.nearbyTitle)}</h2><p class="t-sub c-sub">${esc(COPY.nearbySub)}</p></div>
        <ul class="list">${preview
          .map(
            // 줄을 누르면 장소 상세(S5)로 간다. 뒤로 가기는 이 화면으로 돌아온다.
            (c) => `<li><button class="row" data-action="open-place" data-id="${c.place.id}">${thumbTile(c.place)}
              <span class="grow"><span class="t-strong clamp2">${esc(c.place.name)}</span><span class="t-sub">${kindDist(c.place.kind, c.distance)}</span></span>${chev()}</button></li>`,
          )
          .join('')}</ul>
      </section>`
    : '';

  // 코스는 부가 기능이라 채우지 않은 얇은 줄 버튼이다. 주인공은 촬영지다.
  const course = coords && hasCourse
    ? `<button class="btn-line" data-action="open-course" data-id="${spot.id}"><span>${esc(COPY.courseButton)}</span>${chev()}</button>`
    : '';

  const noCoords = coords
    ? ''
    : `<p class="notice">${esc(COPY.noCoords)}</p>
       <button class="btn btn-ghost" data-action="copy" data-text="${esc(spot.address)}">${esc(COPY.copyAddress)}</button>`;

  // 후기는 아직 만들지 않아 '준비 중' 안내로 막아 둔다
  const reviews = `<section class="stack-8"><h2 class="section-title">${esc(COPY.reviewsTitle)}</h2><p class="notice">${esc(COPY.reviewsSoon)}</p></section>`;

  return `<div class="spot-body page-body">${noCoords}${worksHere}${nearby}${course}${reviews}${source()}</div>`;
}

export function spotScreenMobile(spot, ctx, { mapOn, level }) {
  if (!mapOn) {
    return `<div class="map-ctrl is-static" style="padding-left:var(--gutter);padding-right:var(--gutter)">
      ${backBtn()}</div>
      <section class="sheet is-static">${spotHead(spot)}<div class="sheet-body">${spotBody(spot, ctx)}</div></section>`;
  }
  return `
    ${topBrand()}
    <div class="map-ctrl is-below">
      ${backBtn()}
    </div>
    <section class="sheet" id="sheet" data-level="${level}">
      <div class="sheet-grip" data-drag><span></span></div>
      <div data-drag>${spotHead(spot, { toggle: level === 'expanded' ? 'down' : 'up' })}</div>
      <div class="sheet-body" id="sheet-body">${spotBody(spot, ctx)}</div>
    </section>`;
}

// PC: 지도 위 상세 패널
export function spotDetail(spot, ctx) {
  return `<article class="page">
    <div class="lowbar is-close"><button class="btn-icon" data-action="close-panel" aria-label="${esc(COPY.close)}">${icon.close()}</button></div>
    ${spotHead(spot)}
    ${spotBody(spot, ctx)}
  </article>`;
}

// ── S4 ──
export function courseScreen(spot, { work, pc }) {
  return `<article class="page">
    <div class="topbar">${backBtn()}<span class="t-strong">${esc(COPY.courseTopbar)}</span></div>
    <div class="page-body">
      <h1 class="t-title">${esc(spot.name)} 근처 코스</h1>
      <div id="course-status"></div>
      <div id="course-body"></div>
      <button class="btn btn-ghost" data-action="open-work" data-title="${esc(work.title)}">${esc(work.title)}의 다른 촬영지 보기</button>
      ${source()}
    </div>
  </article>`;
}

export function frameMsg(state) {
  const text = state === 'loading' ? COPY.courseLoading : COPY.courseDone;
  return `<div class="frame-msg framed is-${state}" role="status">${corners(12)}<span>${esc(text)}</span></div>`;
}

export function courseBody(course, { showRouteMap }) {
  const items = course.items;
  const summary = course.summary ? `<p class="t-sub c-sub">${esc(course.summary)}</p>` : '';
  const routeMap = showRouteMap ? `<div class="route-map" id="route-map" aria-hidden="true"></div>` : '';
  const cards = items
    .map((it, i) => {
      const p = it.place;
      const note = it.note ? `<span class="t-sub c-sub">${esc(it.note)}</span>` : '';
      const body =
        p.kind === 'spot'
          ? `<span class="grow"><span class="chip-kind">${KIND_LABEL.spot}</span><span class="t-strong clamp2">${esc(p.name)}</span><span class="t-sub c-sub">${esc(p.work)}</span>${note}</span>`
          : `${thumbTile(p)}
             <span class="grow"><span class="chip-kind">${KIND_LABEL[p.kind]}</span><span class="t-strong clamp2">${esc(p.name)}</span><span class="t-sub">직선 ${dist(it.distance)}</span>${note}</span>`;
      const action = p.kind === 'spot' ? `data-action="open-spot" data-id="${p.id}"` : `data-action="open-place" data-id="${p.id}"`;
      return `<li>${numBadge(i + 1)}<button class="card" ${action}><span class="sr-only">${i + 1}번 </span>${body}${chev()}</button></li>`;
    })
    .join('');
  return `<div class="stack-12">${summary}${routeMap}<ol class="timeline">${cards}</ol></div>`;
}

// ── S5 ──
// 관광지·식당·카페 상세는 바텀시트가 아니라 새 페이지다. X를 누르면 바로 전 화면으로 돌아간다.
// 모바일은 맨 위 줄(서비스명·테마 버튼 자리)을 X 하나로 바꾼다. X는 테두리 없는 아이콘이다.
// PC는 지도 위 패널이라 위 줄이 없고, X는 사진 오른쪽 위(사진이 없으면 낮은 줄의 오른쪽)에 둔다.
export function placeScreen(place, { spot, distance, canMap = false, pc = false }) {
  const closeBtn = (bare) => `<button class="btn-icon${bare ? ' is-bare' : ''}" data-action="back" aria-label="${esc(COPY.close)}">${icon.close()}</button>`;
  const bar = pc ? '' : `<header class="page-top is-close">${closeBtn(true)}</header>`;
  const photoClose = pc ? closeBtn(false) : '';
  const top = place.photo
    ? `<div class="photo-wrap"><img class="photo" src="${esc(place.photo)}" alt="" data-fallback="remove-photo">${photoClose}</div>`
    : pc ? `<div class="lowbar is-close">${closeBtn(false)}</div>` : '';
  const intro = place.intro
    ? `<section class="stack-8"><h2 class="section-title">${esc(COPY.intro)}</h2><p class="clamp4" data-expand aria-expanded="false">${esc(place.intro)}</p></section>`
    : '';
  // TODO(열린 결정: S5 출처 문구) COPY.placeSource가 비어 있으면 칸을 만들지 않는다.
  const src = COPY.placeSource ? `<p class="source">${esc(COPY.placeSource)}</p>` : '';
  return `<article class="page">
    ${bar}
    ${top}
    <div class="page-body">
      <div class="stack-12">
        <p class="meta"><span class="chip-kind">${KIND_LABEL[place.kind]}</span><span class="t-sub">${esc(spot.name)}에서 직선 ${dist(distance)}</span></p>
        <h1 class="t-display">${esc(place.name)}</h1>
        <p class="addr t-sub">${icon.pin()}<span>${esc(place.address)}</span></p>
      </div>
      ${canMap ? `<button class="btn btn-ghost" data-action="view-place-map" data-id="${place.id}" data-spot="${spot.id}">${esc(COPY.viewOnMap)}</button>` : ''}
      ${intro}
      <button class="btn btn-ghost" data-action="open-spot" data-id="${spot.id}">${esc(spot.name)} 보러 가기</button>
      ${src}
    </div>
  </article>`;
}

// ── PC ──
// 장소 지도(모바일): 촬영지 번호 핀과 이 장소 핀을 한 화면에 보여 주는 보기 전용 지도.
export function placeMapScreen(place, { spot, distance }) {
  return `
    <div class="map-ctrl">${backBtn()}</div>
    <section class="map-card" id="map-card">
      <p class="meta"><span class="chip-kind">${KIND_LABEL[place.kind]}</span><span class="t-sub">${esc(spot.name)}에서 직선 ${dist(distance)}</span></p>
      <h1 class="t-title">${esc(place.name)}</h1>
      <p class="addr t-sub">${icon.pin()}<span>${esc(place.address)}</span></p>
    </section>`;
}

export function pcFrame(work, { selectedId, fit = false }) {
  return `
    <header class="pc-top">
      <button class="brand" data-action="home">${logoMark()}<span class="wordmark" lang="en">${esc(COPY.wordmark)}</span></button>
      <div class="pc-search">
        <label class="search"><span class="sr-only">${esc(COPY.searchLabel)}</span>
          <input id="pc-q" type="search" autocomplete="off" placeholder="${esc(COPY.searchPlaceholder)}" value="${esc(work.title)}">
          <span class="btn-icon" aria-hidden="true">${icon.search()}</span>
        </label>
        <button class="btn-text" type="button" data-action="cancel-select">${esc(COPY.cancel)}</button>
      </div>
      ${themeButton()}
    </header>
    <aside class="pc-list" id="pc-list">${workHead(work, { fit })}<div class="sheet-body">${spotList(work, selectedId)}</div></aside>
    <section class="pc-detail" id="pc-detail" hidden></section>`;
}

export function errorScreen() {
  return `<div class="boot-error"><div class="notice is-error" role="alert">${icon.warn()}<p>${esc(COPY.loadError)}</p>
    <button class="btn-text" data-action="retry">${esc(COPY.retry)}</button></div></div>`;
}
