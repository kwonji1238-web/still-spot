// 라우팅, 화면 전환, 이벤트, 지도 연결.
// 경로: #/ (S1·E1·E2) · #/w/<작품명>[?sel=<촬영지id>] (S2) · #/s/<id> (S3·E3) · #/c/<id> (S4) · #/p/<촬영지id>/<장소id> (S5)
// 뒤로 가기는 브라우저 history를 쓰고, 떠나는 화면의 지도 위치·시트 높이·스크롤을 history.state에 저장해 복원한다.

import { loadData, spotsAtSamePlace } from './data.js';
import { searchWorks, searchSpots } from './search.js';
import { previewCandidates, courseCandidates } from './candidates.js';
import { ruleCourse } from './course.js';
import { fetchAiCourse } from './api.js';
import { distanceM } from './geo.js';
import { TOAST_MS, COPY, BUSAN_BOUNDS } from './settings.js';
import { pickFeatured } from './featured.js';
import * as R from './render.js';
import { loadKakao, MainMap, createRouteMap } from './map.js';
import { toggleTheme } from './theme.js';

const $ = (sel) => document.querySelector(sel);
const screen = $('#screen');
const mq = matchMedia('(min-width: 768px)');

const app = {
  db: null,
  mapOk: false,
  mapChecked: false,
  main: null,
  courses: new Map(), // 촬영지 id → 확정된 코스 (OpenAI 결과 또는 규칙 기반)
  route: null,
  sheetLevel: 'half',
  selectedId: null,
  token: 0, // 화면이 바뀌면 늦게 끝난 비동기 작업을 버린다
  pcWork: null, // PC에서 지금 그려진 목록 패널의 작품
  featured: null,
  placeFocused: false, // PC에서 장소 상세의 "지도로 보기"로 지도를 그 장소에 맞춰 둔 상태(이때 X나 다른 핀을 눌러도 지도를 움직이지 않는다)
  fitWorkOnce: false, // 이번 화면 전환에서는 작품의 모든 촬영지가 보이게 지도를 맞춘다(촬영지 시트의 포스터를 눌렀을 때)
  keepView: false, // 이번 화면 전환에서는 지도를 다시 맞추지 않는다(선택을 풀고 작품 목록으로 돌아올 때)
  carryView: null, // 선택을 풀고 첫 화면으로 돌아갈 때 지도를 그 자리에 두기 위한 값(한 번만 쓴다)
  searching: false, // 첫 화면에서 검색창을 열어 지도 위에 결과를 보이는 중
};

// ── 라우팅 ──
function parse() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const query = new URLSearchParams(qs || '');
  if (parts[0] === 'w' && parts[1]) return { name: 'work', title: parts[1], sel: query.get('sel') };
  if (parts[0] === 's' && parts[1]) return { name: 'spot', id: parts[1] };
  if (parts[0] === 'c' && parts[1]) return { name: 'course', id: parts[1] };
  if (parts[0] === 'p' && parts[2]) return { name: 'place', spotId: parts[1], id: parts[2] };
  if (parts[0] === 'm' && parts[2]) return { name: 'placemap', spotId: parts[1], id: parts[2] };
  return { name: 'home', q: query.get('q') || '' };
}

const href = {
  home: (q) => (q ? `#/?q=${encodeURIComponent(q)}` : '#/'),
  work: (title, sel) => `#/w/${encodeURIComponent(title)}${sel ? `?sel=${sel}` : ''}`,
  spot: (id) => `#/s/${id}`,
  course: (id) => `#/c/${id}`,
  place: (spotId, id) => `#/p/${spotId}/${id}`,
  placeMap: (spotId, id) => `#/m/${spotId}/${id}`,
};

function mapVisible() {
  return document.body.dataset.map === 'on' && app.main;
}

function saveState() {
  const st = { ...(history.state || {}) };
  st.scroll = window.scrollY;
  st.sheet = app.sheetLevel;
  st.sel = app.selectedId;
  const body = $('#sheet-body');
  st.listScroll = body ? body.scrollTop : 0;
  if (mapVisible()) st.view = app.main.getView();
  else delete st.view;
  history.replaceState(st, '');
}

function navigate(h, { replace = false } = {}) {
  saveState();
  const depth = history.state?.depth || 0;
  if (replace) history.replaceState({ depth }, '', h);
  else history.pushState({ depth: depth + 1 }, '', h);
  render(true);
}

// 바로 전 화면으로. 이 사이트 안에서 처음 연 화면이면 위 단계 화면으로 바꾼다.
function goBack(fallback) {
  if ((history.state?.depth || 0) > 0) history.back();
  else navigate(fallback, { replace: true });
}

addEventListener('popstate', () => render(false));
mq.addEventListener('change', () => { saveState(); render(false); });

// ── 렌더 ──
function render(fresh) {
  let r = parse();
  // PC는 S5 패널 뒤에 항상 지도가 있어서 별도 지도 화면이 없다. 장소 상세로 보여 준다.
  if (r.name === 'placemap' && mq.matches) r = { name: 'place', spotId: r.spotId, id: r.id };
  app.prevRoute = app.route;
  app.route = r;
  app.token++;
  const st = fresh ? null : history.state;
  const layout = mq.matches ? 'pc' : 'mobile';
  document.body.dataset.layout = layout;
  document.body.dataset.screen = r.name;
  // 본인 위치 버튼 위치는 화면마다 다시 정한다(바텀시트가 있으면 setSheetLevel이, 검색 화면이면 syncHomeMode가 채운다)
  document.body.style.removeProperty('--locate-b');
  delete document.body.dataset.sheetLevel;
  document.body.classList.remove('is-searching', 'is-sheet-dragging');

  if (r.name === 'home') {
    app.pcWork = null;
    document.body.dataset.map = 'off';
    renderHome(r.q || st?.q || '', fresh && !!r.q);
    drawHomeMap(st);
    return;
  }

  const ctx = resolve(r);
  if (!ctx) return navigate(href.home(), { replace: true });

  if (layout === 'pc') renderPc(r, ctx, st);
  else renderMobile(r, ctx, st);
  app.keepView = false;
  app.fitWorkOnce = false;
  if (r.name !== 'place') app.placeFocused = false;
}

// 경로에서 작품·촬영지·장소를 찾는다. 없으면 null.
function resolve(r) {
  const { byId, workByTitle } = app.db;
  if (r.name === 'work') {
    const work = workByTitle.get(r.title);
    return work ? { work } : null;
  }
  const spot = byId.get(r.name === 'place' || r.name === 'placemap' ? r.spotId : r.id);
  if (!spot || spot.kind !== 'spot') return null;
  const work = workByTitle.get(spot.work);
  if (r.name === 'course' && spot.lat === null) return null;
  if (r.name === 'place' || r.name === 'placemap') {
    const place = byId.get(r.id);
    if (!place || place.kind === 'spot' || spot.lat === null) return null;
    return { work, spot, place };
  }
  return { work, spot };
}

function restoreScroll(st) {
  window.scrollTo(0, st?.scroll || 0);
}

// ── S1·E1·E2 ──
// 검색 화면에 보일 촬영지(고정 + 무작위). 무작위는 방문마다 한 번만 뽑아 입력 중에 바뀌지 않게 한다.
function featured() {
  return (app.featured ||= pickFeatured(app.db.spots));
}

// 첫 화면(v1): 지도 위에 검색창이 떠 있고, 검색창을 열면 결과가 지도를 덮는다.
// 지도가 안 되면 검색창을 연 모습(결과 화면)을 그대로 첫 화면으로 쓴다.
function renderHome(q, focus) {
  screen.innerHTML = R.homeScreen(q, { credit: app.db.hasPosters });
  const input = $('#q');
  app.searching = q.trim().length > 0;
  updateResults(q);
  syncHomeMode();
  input.addEventListener('focus', () => {
    app.searching = true;
    syncHomeMode();
  });
  input.addEventListener('input', () => {
    updateResults(input.value);
    history.replaceState({ ...(history.state || {}), q: input.value }, '');
  });
  if (focus) {
    input.focus();
    input.setSelectionRange(q.length, q.length);
  }
}

function syncHomeMode() {
  const home = $('#home');
  if (!home) return;
  const noMap = app.mapChecked && !app.mapOk;
  // 모바일은 결과 화면이 지도를 덮고, PC는 검색창 아래 패널로 열린다. 지도가 안 될 때는 PC도 결과 화면을 첫 화면으로 쓴다.
  const panel = app.searching && !noMap && document.body.dataset.layout === 'pc';
  home.classList.toggle('is-searching', (app.searching && !panel) || noMap);
  home.classList.toggle('is-panel', panel);
  home.classList.toggle('no-map', noMap);
  document.body.classList.toggle('is-searching', home.classList.contains('is-searching'));
}

// 모든 촬영지 핀을 부산 전체가 보이게 그린다(핀이 한 곳도 안 보이는 일이 없게 좌표 있는 촬영지를 모두 포함).
function drawHomeMap(st) {
  const mapOn = app.mapOk && !!app.main;
  document.body.dataset.map = mapOn ? 'on' : 'off';
  if (!mapOn) return;
  app.main.relayout();
  app.main.clear('course');
  app.main.clear('nearby');
  app.main.setAll(app.db.spots, pickHomePin);
  if (app.carryView) {
    const v = app.carryView;
    app.carryView = null;
    return app.main.restoreCarried(v);
  }
  if (st?.view) return app.main.setView(st.view);
  // 위쪽은 상단 메뉴와 검색창, 아래쪽은 본인 위치 버튼이 가리는 만큼 비운다
  app.main.fit(app.db.spots.filter((s) => s.lat !== null), HOME_PADDING);
}

// 핀을 누르면 그 작품의 지도 화면(S2)에서 이 핀을 강조한다. PC는 상세 패널을 연다. [제안]
// TODO(열린 결정: 첫 화면 핀을 눌렀을 때 이동 대상)
function pickHomePin(spot) {
  app.keepView = true; // 핀을 눌러 들어올 때는 시트만 올라오고 지도는 그 자리에 둔다
  navigate(document.body.dataset.layout === 'pc' ? href.spot(spot.id) : href.work(spot.work, spot.id));
}

function updateResults(q) {
  const searching = q.trim().length > 0;
  const results = $('#results');
  if (!searching) {
    results.innerHTML = R.featuredBlock(featured());
    return;
  }
  $('#search-hint')?.setAttribute('hidden', '');
  const hits = searchWorks(app.db.works, q);
  const spotHits = searchSpots(app.db.spots, q);
  results.innerHTML = hits.length || spotHits.length ? R.matchBlock(hits, spotHits) : R.noResultBlock(featured());
}

// 검색을 닫고 지도로 돌아간다(입력한 글자도 지운다)
function closeSearch() {
  const input = $('#q');
  if (!input) return;
  input.value = '';
  input.blur();
  updateResults('');
  history.replaceState({ ...(history.state || {}), q: '' }, '');
  app.searching = false;
  syncHomeMode();
}

// 본인 위치: 지도를 그 위치로 옮기고 점을 찍는다. 부산 밖이거나 위치를 못 받으면 안내 팝업을 띄운다(이동하기 → 부산 전체).
// X로 닫으면 지도는 그 자리에 그대로 둔다. 위치는 저장하지 않고 서버로 보내지 않는다.
const HOME_PADDING = [152, 24, 136, 24]; // 위쪽은 상단 메뉴와 검색창, 아래쪽은 본인 위치 버튼이 가리는 만큼
const inBusan = (p) => p.lat >= BUSAN_BOUNDS.south && p.lat <= BUSAN_BOUNDS.north && p.lng >= BUSAN_BOUNDS.west && p.lng <= BUSAN_BOUNDS.east;

function locateMe() {
  if (!navigator.geolocation) return openLocateDialog('failed');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const me = { lat: coords.latitude, lng: coords.longitude };
      if (app.main) {
        app.main.showMe(me);
        app.main.focus(me, 5, HOME_PADDING);
      }
      if (!inBusan(me)) openLocateDialog('outside');
    },
    () => openLocateDialog('failed'), // 거부·실패: 지도는 그대로 두고 안내만
    { timeout: 8000, maximumAge: 60000 },
  );
}

function goToBusan() {
  closeLocateDialog();
  if (app.main) app.main.fit(app.db.spots.filter((s) => s.lat !== null), HOME_PADDING);
}

// kind: 'outside'(부산 밖, 부산으로 이동 권유) | 'failed'(위치를 못 받음, 닫기만)
function openLocateDialog(kind = 'outside') {
  const dlg = $('#locate-dialog');
  if (!dlg) return;
  const failed = kind === 'failed';
  $('#locate-dialog-title').textContent = failed ? COPY.locateFailTitle : COPY.locateDialog;
  $('#locate-dialog-body').textContent = failed ? COPY.locateFailBody : COPY.locateBody;
  const btn = $('#locate-dialog-btn');
  btn.textContent = failed ? COPY.close : COPY.locateGo;
  btn.dataset.action = failed ? 'close-dialog' : 'locate-go';
  dlg.hidden = false;
  dlg.querySelector('[data-action="close-dialog"]').focus();
}

function closeLocateDialog() {
  const dlg = $('#locate-dialog');
  if (!dlg || dlg.hidden) return;
  dlg.hidden = true;
  $('.locate')?.focus();
}

// ── 모바일 ──
function renderMobile(r, ctx, st) {
  if (r.name === 'work') return renderWorkMobile(r, ctx, st);
  if (r.name === 'placemap') return renderPlaceMapMobile(ctx, st);
  if (r.name === 'spot') return renderSpotMobile(ctx, st);
  document.body.dataset.map = 'off';
  if (r.name === 'course') {
    screen.innerHTML = R.courseScreen(ctx.spot, { work: ctx.work, pc: false });
    runCourse(ctx.spot, false);
  }
  if (r.name === 'place') screen.innerHTML = placeHtml(ctx, false);
  restoreScroll(st);
}

// 장소 지도(모바일): 촬영지 핀 + 이 장소 핀을 한눈에. 보기 전용이다.
function renderPlaceMapMobile({ spot, place }, st) {
  if (!app.mapChecked) return; // 지도 준비를 기다린다. 준비되면 boot가 다시 그린다
  if (!app.mapOk) return navigate(href.place(spot.id, place.id), { replace: true });
  document.body.dataset.map = 'on';
  app.selectedId = null;
  screen.innerHTML = R.placeMapScreen(place, { spot, distance: distanceM(spot, place) });
  app.main.relayout();
  app.main.clear('course');
  app.main.clear('nearby');
  app.main.clear('spots');
  app.main.add('spots', spot, { no: spot.no, label: spot.name });
  app.main.showPlace(place);
  if (st?.view) return app.main.setView(st.view);
  const card = $('#map-card').getBoundingClientRect().height;
  app.main.fit([spot, place], [88, 72, card + 48, 72]);
}

// 촬영지 상세 내용에 필요한 것: 이 장소의 작품들, 근처 미리보기, 코스 가능 여부
function spotCtx(spot) {
  const { workByTitle, spots, places } = app.db;
  return {
    works: spotsAtSamePlace(spot, spots).map((s) => ({ spot: s, work: workByTitle.get(s.work) })),
    preview: previewCandidates(spot, places),
    hasCourse: courseCandidates(spot, places).length > 0,
  };
}

function spotHtml(spot) {
  return R.spotDetail(spot, spotCtx(spot));
}

function placeHtml({ spot, place }, pc = false) {
  return R.placeScreen(place, { spot, distance: distanceM(spot, place), canMap: app.mapOk && place.lat !== null, pc });
}

// ── S3 (모바일): 지도 위 촬영지 바텀시트. 좌표가 없는 촬영지(E3)나 지도가 안 될 때는 지도 없이 목록형으로 ──
function renderSpotMobile({ spot, work }, st) {
  const mapOn = app.mapOk && spot.lat !== null;
  document.body.dataset.map = mapOn ? 'on' : 'off';
  app.selectedId = spot.id;
  app.sheetLevel = mapOn ? st?.sheet || 'half' : 'half';
  screen.innerHTML = R.spotScreenMobile(spot, spotCtx(spot), { mapOn, level: app.sheetLevel });
  if (!mapOn) return restoreScroll(st);
  setSheetLevel(app.sheetLevel, false);
  bindSheet();
  if (st?.listScroll) $('#sheet-body').scrollTop = st.listScroll;
  app.main.relayout();
  app.main.clear('course');
  drawWorkPins(work);
  if (st?.view) app.main.setView(st.view);
  else if (!app.keepView) fitSelection();
}

// ── S2 (모바일): 지도 + 시트 3단계 ──
function sheetHeights() {
  const h = window.innerHeight;
  // 844px 화면 기준 접힘 136 / 반 열림 404 / 펼침 740(위 104)
  return { collapsed: 136, half: Math.round((h * 404) / 844), expanded: h - Math.round((h * 104) / 844) };
}

function renderWorkMobile(r, { work }, st) {
  const hasPins = work.spots.some((s) => s.lat !== null);
  const mapOn = app.mapOk && hasPins;
  document.body.dataset.map = mapOn ? 'on' : 'off';
  const sel = r.sel || st?.sel;
  app.selectedId = work.spots.some((s) => s.id === sel) ? sel : null;
  // "지도로 보기"로 들어오면 반 열림. 뒤로 가기면 저장한 높이.
  app.sheetLevel = mapOn ? (r.sel ? 'half' : st?.sheet || 'half') : 'half';
  screen.innerHTML = R.workScreenMobile(work, { mapOn, selectedId: app.selectedId, level: app.sheetLevel });

  if (!mapOn) {
    restoreScroll(st);
    return;
  }
  setSheetLevel(app.sheetLevel, false);
  bindSheet();
  const body = $('#sheet-body');
  if (st?.listScroll) body.scrollTop = st.listScroll;
  else if (app.selectedId) scrollRowIntoView(app.selectedId);

  app.main.relayout();
  drawWorkPins(work);
  if (st?.view) app.main.setView(st.view);
  else if (app.fitWorkOnce) fitWork(work); // 포스터를 눌러 들어오면 이 작품의 촬영지가 한눈에 보이게 줄인다
  else if (app.selectedId) { if (!app.keepView) fitSelection(); }
  else if (!app.keepView) fitWork(work);
}

function drawWorkPins(work) {
  app.main.setSpots(work.spots, app.selectedId, pickSpot);
  const sel = app.selectedId && app.db.byId.get(app.selectedId);
  if (sel && sel.lat !== null) {
    // 근처 장소 핀을 누르면 그 장소의 상세(S5). 돌아오면 지금 화면이다.
    app.main.setNearby(previewCandidates(sel, app.db.places), (place) => navigate(href.place(sel.id, place.id)));
  }
  else app.main.clear('nearby');
}

function mapPadding() {
  if (document.body.dataset.layout === 'pc') {
    const panelOpen = !$('#pc-detail')?.hidden;
    return [48, 48, 48, panelOpen ? 432 + 24 : 48];
  }
  return [72, 40, sheetHeights()[app.sheetLevel] + 24, 40];
}

function fitWork(work) {
  app.main.fit(work.spots.filter((s) => s.lat !== null), mapPadding());
}

// 선택한 촬영지와 근처 장소 핀이 함께 보이게 [제안]
// TODO(열린 결정: 근처 핀이 보이게 확대할지) 대안은 확대 수준 유지.
function fitSelection() {
  const sel = app.db.byId.get(app.selectedId);
  if (!sel || sel.lat === null) return;
  const pts = [sel, ...previewCandidates(sel, app.db.places).map((c) => c.place)];
  app.main.fit(pts, mapPadding());
}

// 핀을 누르면: 모바일은 줄 강조 + 근처 핀, PC는 상세 패널을 연다.
// 선택을 풀고 첫 화면(전체 지도)으로. 지도는 지금 보던 자리에 그대로 둔다.
function backToMap() {
  app.carryView = mapVisible() ? app.main.carryView() : null;
  navigate(href.home());
}

// 선택된 핀을 한 번 더 누르면 선택이 풀리고 작품 목록(아무것도 선택 안 된 상태)으로 돌아간다. 작품 시트·목록과 지도 위치는 그대로.
function deselectSpot() {
  const r = app.route;
  if (r.name === 'spot') {
    app.keepView = true;
    return navigate(href.work(app.db.byId.get(r.id).work), { replace: true });
  }
  // 작품 시트에서 선택한 촬영지만 푼다
  const work = app.db.workByTitle.get(r.title);
  app.selectedId = null;
  markSelectedRow(null);
  drawWorkPins(work);
  history.replaceState({ ...(history.state || {}) }, '', href.work(r.title));
  app.route = { ...r, sel: null };
  saveState();
}

function pickSpot(id) {
  // 이미 선택된 핀을 한 번 더 누르면 선택이 풀린다
  if (id === app.selectedId && (app.route.name === 'work' || app.route.name === 'spot')) return deselectSpot();
  if (document.body.dataset.layout === 'pc' || app.route.name === 'spot') {
    app.keepView = true; // 핀을 눌러 선택할 때는 지도를 움직이지 않는다
    return navigate(href.spot(id));
  }
  app.selectedId = id;
  markSelectedRow(id);
  // 접힘에서 핀을 누르면 반 열림까지 올린다 [제안]
  if (app.sheetLevel === 'collapsed') setSheetLevel('half', false);
  scrollRowIntoView(id);
  const work = app.db.workByTitle.get(app.db.byId.get(id).work);
  drawWorkPins(work);
  // 핀을 눌렀을 때는 지도를 움직이지 않고 시트만 올린다. 펼침 시트는 지도가 보이게 반 열림으로 내린다.
  if (app.sheetLevel === 'expanded') setSheetLevel('half', false);
  saveState();
}

// 장소 상세의 "지도로 보기"가 그 장소로 확대할 때 쓰는 카카오 지도 레벨
// TODO(열린 결정: 확대 수준) 지금은 카카오 레벨 4.
const FOCUS_LEVEL = 4;

// 목록에서 선택한 줄 표시(촬영지 줄은 li.row-split 전체에 걸린다)
function markSelectedRow(id) {
  document.querySelectorAll('.row.is-sel').forEach((el) => { el.classList.remove('is-sel'); el.removeAttribute('aria-current'); });
  const row = id && $(`#row-${id}`);
  if (!row) return;
  row.classList.add('is-sel');
  row.setAttribute('aria-current', 'true');
}

function scrollRowIntoView(id) {
  const row = $(`#row-${id}`);
  const body = $('#sheet-body');
  if (!row || !body) return;
  body.scrollTop = row.offsetTop - body.offsetTop - 8;
}

// 바텀시트가 떠 있을 때 지도의 빈 곳을 누르면 시트를 접는다
function collapseSheet() {
  const sheet = $('#sheet');
  if (!sheet || sheet.classList.contains('is-static') || app.sheetLevel === 'collapsed') return;
  setSheetLevel('collapsed');
}

function setSheetLevel(level, save = true) {
  const sheet = $('#sheet');
  if (!sheet) return;
  app.sheetLevel = level;
  sheet.dataset.level = level;
  sheet.style.setProperty('--sheet-h', `${sheetHeights()[level]}px`);
  // 본인 위치 버튼은 시트 바로 위에 둔다. 펼침일 때는 시트가 화면 위까지 올라와 버튼을 숨긴다(CSS)
  document.body.style.setProperty('--locate-b', `calc(${sheetHeights()[level]}px + 0.75rem)`);
  document.body.dataset.sheetLevel = level;
  const btn = sheet.querySelector('[data-action="sheet-toggle"]');
  if (btn) {
    const down = level === 'expanded';
    btn.innerHTML = down ? R.icon.down() : R.icon.up();
    btn.setAttribute('aria-label', down ? COPY.sheetFold : COPY.sheetUnfold);
  }
  if (save) saveState();
}

function bindSheet() {
  const sheet = $('#sheet');
  sheet.querySelectorAll('[data-drag]').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, [data-expand], .spot-hero-track')) return; // 캐러셀은 옆으로 넘긴다
      const startY = e.clientY;
      const startH = sheet.getBoundingClientRect().height;
      const hs = sheetHeights();
      let moved = false;
      handle.setPointerCapture(e.pointerId);
      sheet.classList.add('is-dragging');
      document.body.classList.add('is-sheet-dragging');
      const move = (ev) => {
        const dy = startY - ev.clientY;
        if (Math.abs(dy) > 4) moved = true;
        const h = Math.max(hs.collapsed, Math.min(hs.expanded, startH + dy));
        sheet.style.setProperty('--sheet-h', `${h}px`);
        document.body.style.setProperty('--locate-b', `calc(${h}px + 0.75rem)`);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        sheet.classList.remove('is-dragging');
        document.body.classList.remove('is-sheet-dragging');
        if (!moved) return setSheetLevel(app.sheetLevel);
        const h = sheet.getBoundingClientRect().height;
        const level = Object.entries(hs).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
        setSheetLevel(level);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  });
}

addEventListener('resize', () => {
  if ($('#sheet') && !$('#sheet').classList.contains('is-static')) setSheetLevel(app.sheetLevel, false);
});

// ── S4: 코스 ──
async function runCourse(spot, pc, keepView = false) {
  const token = app.token;
  const status = $('#course-status');
  let course = app.courses.get(spot.id);
  if (!course) {
    const cands = courseCandidates(spot, app.db.places);
    status.innerHTML = R.frameMsg('loading'); // OpenAI 설명을 기다리는 동안만
    const ai = await fetchAiCourse(spot, cands);
    course = ai || { items: ruleCourse(spot, cands), summary: null };
    app.courses.set(spot.id, course);
    if (token !== app.token) return;
  }
  // 순서가 정해진 뒤에 카드 번호·경로 지도를 그린다.
  status.innerHTML = R.frameMsg('done');
  const showRouteMap = !pc && app.mapOk;
  $('#course-body').innerHTML = R.courseBody(course, { showRouteMap });
  if (showRouteMap) createRouteMap($('#route-map'), course.items);
  if (pc && mapVisible()) {
    // TODO(열린 결정: PC에서 코스 핀과 촬영지 번호 핀이 겹칠 때) 지금은 코스를 여는 동안 촬영지 번호 핀을 숨긴다.
    app.main.clear('spots');
    app.main.clear('nearby');
    app.main.setCourse(course.items);
    if (!keepView) app.main.fit(course.items.map((it) => it.place), mapPadding());
  }
}

// ── PC (768px 이상): 목록 패널 + 지도 + 지도 위 상세 패널 ──
function renderPc(r, ctx, st) {
  const { work } = ctx;
  const hasPins = work.spots.some((s) => s.lat !== null);
  const mapOn = app.mapOk && hasPins;
  document.body.dataset.map = mapOn ? 'on' : 'off';
  app.selectedId = r.name === 'work' ? null : ctx.spot.id;

  const sameWork = app.pcWork === work.title && !!$('#pc-list');
  if (!sameWork) {
    screen.innerHTML = R.pcFrame(work, { selectedId: app.selectedId, fit: mapOn });
    app.pcWork = work.title;
    $('#pc-q').addEventListener('input', (e) => navigate(href.home(e.target.value)));
  } else {
    markSelectedRow(app.selectedId);
  }

  const panel = $('#pc-detail');
  panel.hidden = r.name === 'work';
  panel.scrollTop = 0;
  if (r.name === 'spot') panel.innerHTML = spotHtml(ctx.spot);
  if (r.name === 'course') panel.innerHTML = R.courseScreen(ctx.spot, { work, pc: true });
  if (r.name === 'place') panel.innerHTML = placeHtml(ctx, true);

  if (mapOn) {
    app.main.relayout();
    if (r.name === 'work' || r.name === 'spot') {
      app.main.clear('course');
      drawWorkPins(work);
      if (st?.view && !app.keepView) app.main.setView(st.view);
      else if (app.fitWorkOnce) fitWork(work);
      else if (app.selectedId && ctx.spot.lat !== null && !app.keepView) fitSelection();
      // 촬영지·코스·장소 상세 패널을 X로 닫을 때는 그 자리에서 패널만 닫는다(지도를 다시 맞추지 않는다)
      else if (r.name === 'work' && !app.keepView && !(sameWork && ['spot', 'course', 'place'].includes(app.prevRoute?.name))) fitWork(work);
    }
  }
  if (r.name === 'course') {
    // 장소 상세(S5)에서 X로 돌아왔을 때는 지도가 튀지 않게 떠날 때의 위치를 되살린다
    runCourse(ctx.spot, true, !!st?.view || app.keepView);
    if (st?.view && mapOn && !app.keepView) app.main.setView(st.view);
  }
  if (r.name === 'place' && mapOn) {
    // S5에서도 코스 핀·선을 그대로 둔다
    const course = app.courses.get(ctx.spot.id);
    if (course) {
      app.main.clear('spots');
      app.main.clear('nearby');
      app.main.setCourse(course.items);
    }
  }
}

// ── 이벤트 ──
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const dlg = $('#locate-dialog');
  if (dlg && !dlg.hidden) return closeLocateDialog();
  if ($('#home.is-panel')) closeSearch();
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'locate-dialog') return closeLocateDialog(); // 팝업 바깥을 눌러도 닫힌다
  // PC 검색 패널은 패널·검색창·상단 메뉴 밖(지도 등)을 누르면 닫힌다
  if ($('#home.is-panel') && !e.target.closest('.search-row, .search-panel, .home-top, .dialog-back')) closeSearch();
  const ex = e.target.closest('[data-expand]');
  if (ex) {
    const open = ex.classList.toggle('is-open');
    ex.setAttribute('aria-expanded', String(open));
    // 시트 안에서 펼치면 글이 들어갈 자리가 모자라니 시트도 끝까지 올린다
    if (open && ex.closest('#sheet') && !$('#sheet').classList.contains('is-static') && app.sheetLevel !== 'expanded') setSheetLevel('expanded');
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  const { action, id, title } = el.dataset;
  const r = app.route;
  switch (action) {
    case 'open-work': return navigate(href.work(title));
    case 'open-spot': return navigate(href.spot(id));
    case 'open-course': return navigate(href.course(id));
    case 'open-place': return navigate(href.place(r.id, id));
    case 'view-on-map':
      app.fitWorkOnce = true; // 포스터: 그 작품의 촬영지가 모두 보이게 지도를 줄이고, 이 촬영지를 선택해 둔다
      return navigate(href.work(app.db.byId.get(id).work, id));
    case 'home': {
      // 첫 화면에서 누르면 검색을 닫고 지도를 처음 상태(촬영지 전체)로 되돌린다. 다른 화면에서는 첫 화면으로 간다.
      if (app.route.name !== 'home') return navigate(href.home());
      closeSearch();
      if (app.main) app.main.fit(app.db.spots.filter((s) => s.lat !== null), HOME_PADDING);
      return;
    }
    case 'cancel-select': return backToMap();
    case 'search-cancel': return closeSearch();
    case 'pick-spot-card': return pickHomePin(app.db.byId.get(id));
    case 'locate': return locateMe();
    case 'pick-spot-hit': return pickHomePin(app.db.byId.get(el.dataset.id));
    case 'locate-go': return goToBusan();
    case 'close-dialog': return closeLocateDialog();
    case 'fit-work': {
      // 장소 리스트를 보다가 포스터를 누르면 이 작품의 촬영지가 모두 보이게 지도를 줄인다. 선택은 그대로 둔다.
      if (!mapVisible()) return;
      const work = app.db.workByTitle.get(app.pcWork || app.route.title);
      if (!work) return;
      if (app.sheetLevel === 'expanded') setSheetLevel('half', false);
      fitWork(work);
      return;
    }
    case 'sheet-toggle': {
      const next = { collapsed: 'half', half: 'expanded', expanded: 'half' }[app.sheetLevel];
      return setSheetLevel(next);
    }
    case 'toggle-theme': return toggleTheme();
    // 모바일은 장소 지도 화면으로, PC는 뒤에 있는 지도에 이 장소를 띄우고 확대한다
    case 'view-place-map': {
      if (document.body.dataset.layout !== 'pc') return navigate(href.placeMap(el.dataset.spot, id));
      app.main.showPlace(app.db.byId.get(id));
      app.placeFocused = true;
      return app.main.focus(app.db.byId.get(id), FOCUS_LEVEL, mapPadding());
    }
    case 'copy': return copyText(el.dataset.text);
    case 'close-panel': return navigate(href.work(app.db.byId.get(r.id).work));
    case 'retry': return boot();
    case 'back': return back();
  }
});

function back() {
  const r = app.route;
  if (r.name === 'work') return goBack(href.home());
  if (r.name === 'spot') return goBack(href.work(app.db.byId.get(r.id).work));
  if (r.name === 'course') return goBack(href.spot(r.id));
  if (r.name === 'place') {
    if (app.placeFocused) app.keepView = true; // 지도로 보기로 맞춰 둔 자리에서 패널만 닫는다
    return goBack(href.spot(r.spotId));
  }
  if (r.name === 'placemap') return goBack(href.place(r.spotId, r.id));
}

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#q');
  if (!input) return;
  // 빈 입력이면 안내 문구를 보이고 입력창에 둔다. 글자를 입력하면 사라진다.
  if (!input.value.trim()) {
    $('#search-hint')?.removeAttribute('hidden');
    return input.focus();
  }
  const hits = searchWorks(app.db.works, input.value, 1);
  if (hits.length) return navigate(href.work(hits[0].work.title));
  const spotHits = searchSpots(app.db.spots, input.value, 1);
  if (spotHits.length) return pickHomePin(spotHits[0].spot);
  input.blur();
});

// 사진 주소가 깨지면 그 칸을 없앤다(빈 칸을 남기지 않음)
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.fallback === 'tile') {
      const tile = img.parentElement;
      tile.classList.add('framed');
      tile.innerHTML = R.corners(10);
    } else if (img.dataset.fallback === 'poster') {
      const box = img.parentElement;
      box.className = 'poster is-logo';
      box.innerHTML = R.logoMark();
    } else if (img.dataset.fallback === 'hero') {
      const box = img.parentElement;
      box.classList.add('is-logo');
      img.remove();
      box.insertAdjacentHTML('afterbegin', R.logoMark());
    } else if (img.dataset.fallback === 'remove-photo') {
      img.parentElement.className = 'lowbar';
      img.remove();
    }
  },
  true,
);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(COPY.copiedToast);
}

let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), TOAST_MS);
}

// ── 시작 ──
let mapPromise = null;
async function boot() {
  document.body.insertAdjacentHTML('beforeend', R.locateControls());
  if (!history.state) history.replaceState({ depth: 0 }, '');
  mapPromise ||= loadKakao(window.STILLSPOT_CONFIG?.kakaoJsKey);
  try {
    app.db = await loadData();
  } catch {
    document.body.dataset.screen = 'error';
    screen.innerHTML = R.errorScreen();
    return;
  }
  render(false);
  app.mapOk = await mapPromise;
  app.mapChecked = true;
  // 지도가 안 되면 지도 화면(#/m)은 장소 상세로 돌려보낸다
  if (!app.mapOk) {
    if (app.route.name === 'home') return syncHomeMode(); // 지도 없이 검색 화면을 첫 화면으로
    return app.route.name === 'placemap' ? render(false) : undefined;
  }
  app.main = new MainMap($('#map'));
  app.main.onMapClick = collapseSheet;
  const n = app.route.name;
  // 첫 화면은 입력 중인 글자를 지우지 않도록 다시 그리지 않고 지도만 붙인다
  if (n === 'home') return drawHomeMap(history.state);
  // 지도가 필요한 화면이면 지도와 함께 다시 그린다(S3는 그대로 둔다. S5는 "지도로 보기" 버튼이 지도에 달려 있다)
  if (document.body.dataset.layout === 'pc' || n === 'work' || n === 'spot' || n === 'course' || n === 'place' || n === 'placemap') {
    saveState();
    app.pcWork = null;
    render(false);
  }
}

boot();
