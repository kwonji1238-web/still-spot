// 카카오맵 JavaScript SDK 래퍼. SDK가 없거나 실패하면 지도만 빠지고 나머지 화면은 그대로 쓴다.
// 지도는 라이트·다크 모두 기본(밝은) 타일로 둔다.

import { corners, esc, icon } from './render.js';
import { KIND_LABEL } from './settings.js';
import { formatDistance } from './geo.js';

const SDK_TIMEOUT_MS = 8000;
const CLUSTER_CELL_PX = 60;
// 이 확대 수준(카카오 레벨, 작을수록 확대) 이하에서는 묶지 않고 모두 흩뿌린다
const NO_CLUSTER_LEVEL = 5;
// 전체 촬영지 핀은 확대 수준에 따라 무게를 바꾼다.
// far: 속이 빈 작은 사각형 / mid: 흰 면 + 검은 꺾쇠 / near: 검은 면 + 흰 꺾쇠 + 이름표. 값은 카카오 레벨(작을수록 확대).
const TIER_NEAR_MAX_LEVEL = 3;
const TIER_MID_MAX_LEVEL = 5;
const tierOf = (level) => (level <= TIER_NEAR_MAX_LEVEL ? 'near' : level <= TIER_MID_MAX_LEVEL ? 'mid' : 'far');
// 한 칸(CLUSTER_CELL_PX)에 이 수 이상이 뭉쳐 있을 때만 묶음 핀으로 보인다. 그보다 적으면 핀을 따로 보인다
const CLUSTER_MIN_MEMBERS = 30;
let sdkPromise = null;

export function loadKakao(key) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (!key) return resolve(false);
    if (window.kakao?.maps?.load) return window.kakao.maps.load(() => resolve(true)); // 이미 로드됨
    const timer = setTimeout(() => resolve(false), SDK_TIMEOUT_MS);
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.onerror = () => { clearTimeout(timer); resolve(false); };
    s.onload = () => {
      if (!window.kakao?.maps?.load) { clearTimeout(timer); return resolve(false); }
      window.kakao.maps.load(() => { clearTimeout(timer); resolve(true); });
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// SDK를 못 불러왔을 때 다시 불러온다. 실패한 스크립트를 치우고 처음부터 시도한다.
export function retryKakao(key) {
  sdkPromise = null;
  document.querySelectorAll('script[src*="dapi.kakao.com"]').forEach((el) => el.remove());
  return loadKakao(key);
}

const ll = (p) => new kakao.maps.LatLng(p.lat, p.lng);

function boundsOf(points) {
  const b = new kakao.maps.LatLngBounds();
  if (points.length === 1) {
    // 핀이 하나면 주변을 조금 넓혀 지나치게 확대되지 않게 한다
    const p = points[0];
    b.extend(new kakao.maps.LatLng(p.lat - 0.004, p.lng - 0.004));
    b.extend(new kakao.maps.LatLng(p.lat + 0.004, p.lng + 0.004));
  } else points.forEach((p) => b.extend(ll(p)));
  return b;
}

function pinEl({ no, selected, label, nearby, all, cluster, clickable, tier, kind, noLabel }) {
  // 식당·카페 핀은 사각 프레임(꺾쇠) 대신 종류를 알려 주는 아이콘을 넣는다
  const glyph = nearby && (kind === 'restaurant' || kind === 'cafe') ? icon[kind === 'cafe' ? 'cafe' : 'food']() : '';
  const tag = clickable ? 'button' : 'div';
  const cls = ['pin', 'framed', selected && 'is-sel', nearby && 'is-nearby', all && 'is-all', glyph && 'is-glyph', all && tier && `is-t-${tier}`, cluster != null && 'is-cluster'].filter(Boolean).join(' ');
  const size = cluster != null ? 8 : all ? (tier === 'mid' ? 4 : 5) : nearby ? 5 : selected ? 7 : 6;
  const name = cluster != null ? `촬영지 ${cluster}곳` : no != null ? `${no}번 ${label ?? ''}` : label ?? '';
  const aria = clickable ? ` type="button" aria-label="${esc(name)}"` : ' aria-hidden="true"';
  const el = document.createElement('div');
  el.className = 'pin-wrap';
  el.innerHTML =
    `<${tag} class="${cls}"${aria}>${glyph || (tier === 'far' && all ? '' : corners(size, 1.5))}${no != null ? `<span>${no}</span>` : ''}${cluster != null ? `<span>${cluster.toLocaleString('ko-KR')}</span>` : ''}</${tag}>` +
    (label && !noLabel && (selected || nearby || (all && tier === 'near')) ? `<span class="pin-label">${esc(label)}</span>` : '');
  return el;
}

export class MainMap {
  constructor(container) {
    this.el = container;
    this.map = new kakao.maps.Map(container, { center: new kakao.maps.LatLng(35.1796, 129.0756), level: 8 });
    this.layers = { spots: [], nearby: [], course: [] };
    this.line = null;
    this.all = null; // 첫 화면의 전체 촬영지 핀(묶음 계산 대상)
    this.allListener = null;
    this.onMapClick = null; // 지도의 빈 곳을 눌렀을 때(핀·묶음은 해당 없음)
    // 사용자가 직접 끌거나 확대·축소했는지. 그랬다면 핀을 눌러 선택할 때 지도를 자동으로 맞추지 않는다.
    // 우리가 지도를 맞춘 직후 잠깐은 그 움직임을 사용자 조작으로 세지 않는다.
    this.userMoved = false;
    this.lockUntil = 0;
    const touched = () => { if (Date.now() > this.lockUntil) this.userMoved = true; };
    kakao.maps.event.addListener(this.map, 'dragstart', touched);
    kakao.maps.event.addListener(this.map, 'zoom_start', touched);
    this.course = null; // PC 메인 지도에 그리는 코스 { items }
    this.courseListener = null;
    this.selectedCourse = null; // 정보창을 연 코스 핀의 번호(1부터)
    this.info = null;
    kakao.maps.event.addListener(this.map, 'click', () => { this.closeInfo(); this.onMapClick?.(); });
  }

  // 우리가 지도를 움직일 때 호출한다. reset이면 자동 맞춤을 다시 켠다(새로 맞춘 화면에서 다시 시작).
  _prog(reset) {
    this.lockUntil = Date.now() + 700;
    if (reset) this.userMoved = false;
  }

  relayout() { this.map.relayout(); }

  clear(layer) {
    if (layer === 'spots') this.all = null;
    this.layers[layer].forEach((o) => o.setMap(null));
    this.layers[layer] = [];
    if (layer === 'course') {
      if (this.line) { this.line.setMap(null); this.line = null; }
      this.course = null;
      this.selectedCourse = null;
      this.closeInfo();
    }
  }

  add(layer, place, opts, onClick) {
    const el = pinEl(opts);
    if (onClick) el.querySelector('.pin').addEventListener('click', onClick);
    const o = new kakao.maps.CustomOverlay({
      position: ll(place), content: el, xAnchor: 0.5, yAnchor: 0.5, clickable: !!onClick,
      zIndex: opts.z ?? (opts.selected ? 3 : opts.nearby ? 1 : 2),
    });
    o.setMap(this.map);
    this.layers[layer].push(o);
  }

  // 촬영지 번호 핀. 목록 번호 = 핀 번호.
  setSpots(spots, selectedId, onPick) {
    this.clear('spots');
    for (const s of spots) {
      if (s.lat === null) continue;
      this.add('spots', s, { no: s.no, selected: s.id === selectedId, label: s.name, clickable: true }, () => onPick(s.id));
    }
  }

  // 본인 위치 점. 한 번에 하나만 둔다.
  showMe(point) {
    this.me?.setMap(null);
    const el = document.createElement('div');
    el.className = 'me-dot';
    el.setAttribute('aria-hidden', 'true');
    this.me = new kakao.maps.CustomOverlay({ position: ll(point), content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 4 });
    this.me.setMap(this.map);
  }

  // 첫 화면: 모든 촬영지 핀. 같은 좌표(한 장소)는 핀 하나로 합치고, 화면에서 가까운 핀끼리는 숫자 하나로 묶는다.
  // 지도를 움직이거나 확대·축소할 때마다 보이는 범위만 다시 계산한다(번호는 작품별 목록 순서라 여기서는 쓰지 않는다).
  // 묶는 것은 촬영지 핀뿐이다. 근처 장소(관광지·식당·카페) 핀은 묶지 않는다.
  // 화면 60px 칸 안에 30곳 이상이 뭉친 곳만 묶고, 확대 레벨 5 이하에서는 묶지 않는다.
  setAll(spots, onPick) {
    this.clear('spots');
    const byPos = new Map();
    for (const s of spots) {
      if (s.lat === null) continue;
      const k = `${s.lat},${s.lng}`;
      if (!byPos.has(k)) byPos.set(k, { spot: s, lat: s.lat, lng: s.lng });
    }
    this.all = { places: [...byPos.values()], onPick };
    if (!this.allListener) {
      this.allListener = () => this.drawAll();
      kakao.maps.event.addListener(this.map, 'idle', this.allListener);
    }
    this.drawAll();
  }

  drawAll() {
    if (!this.all) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.layers.spots.forEach((o) => o.setMap(null));
    this.layers.spots = [];
    const proj = this.map.getProjection();
    const cell = CLUSTER_CELL_PX;
    const level = this.map.getLevel();
    const tier = tierOf(level);
    const noCluster = level <= NO_CLUSTER_LEVEL;
    const cells = new Map();
    for (const p of this.all.places) {
      const pt = proj.containerPointFromCoords(ll(p));
      if (pt.x < -cell || pt.x > w + cell || pt.y < -cell || pt.y > h + cell) continue; // 화면 밖은 그리지 않는다
      const key = `${Math.floor(pt.x / cell)},${Math.floor(pt.y / cell)}`;
      (cells.get(key) || cells.set(key, []).get(key)).push(p);
    }
    const pinGroup = (members) => {
      if (members.length === 1) {
        const p = members[0];
        return this.add('spots', p, { all: true, tier, label: p.spot.name, clickable: true }, () => this.all.onPick(p.spot));
      }
      const center = {
        lat: members.reduce((a, m) => a + m.lat, 0) / members.length,
        lng: members.reduce((a, m) => a + m.lng, 0) / members.length,
      };
      this.add('spots', center, { cluster: members.length, clickable: true }, () => this.zoomTo(members));
    };
    for (const members of cells.values()) {
      if (!noCluster && members.length >= CLUSTER_MIN_MEMBERS) {
        pinGroup(members);
        continue;
      }
      // 묶지 않는 칸: 좌표가 같은 촬영지(한 장소를 찍은 여러 작품)만 한 핀으로 보이고 나머지는 따로 보인다
      const same = new Map();
      for (const p of members) {
        const k = `${p.lat},${p.lng}`;
        (same.get(k) || same.set(k, []).get(k)).push(p);
      }
      for (const g of same.values()) pinGroup(g);
    }
  }

  // 묶음을 누르면 그 안의 핀이 모두 보이게 확대한다
  zoomTo(points) {
    const b = new kakao.maps.LatLngBounds();
    points.forEach((p) => b.extend(ll(p)));
    this.map.setBounds(b, 96, 64, 96, 64);
  }

  // 근처 장소 핀: 번호 없는 작은 핀 + 이름표(식당·카페는 아이콘). 경로선과 섞지 않는다.
  // onPick을 주면 핀을 눌러 그 장소의 상세로 갈 수 있다.
  setNearby(candidates, onPick) {
    this.clear('nearby');
    for (const c of candidates) {
      this.add('nearby', c.place, { nearby: true, kind: c.place.kind, label: c.place.name, clickable: !!onPick }, onPick && (() => onPick(c.place)));
    }
  }

  // PC 메인 지도의 코스: 번호 핀과 순서대로 이은 직선.
  // 겹치는 핀은 화면에서 가까운 것끼리 개수 하나로 묶고(확대하면 풀린다), 같은 좌표의 핀은 둘레로 벌려 놓는다.
  // 코스 핀은 다른 핀보다 위에 보이고, 누른 핀은 맨 위로 올라와 정보창(장소명 · 분류 · 직선 거리)을 연다.
  setCourse(items) {
    this.clear('course');
    const list = items.filter((it) => it.place.lat !== null);
    this.course = { items: list };
    if (!this.courseListener) {
      this.courseListener = () => this.drawCourseLayer();
      kakao.maps.event.addListener(this.map, 'idle', this.courseListener);
    }
    this.drawCourseLayer();
    if (list.length > 1) {
      // 코스 경로선: 1px 직선, 지도 고정 색
      this.line = new kakao.maps.Polyline({
        path: list.map((it) => ll(it.place)), strokeWeight: 1, strokeColor: '#1A1917', strokeOpacity: 1, strokeStyle: 'solid',
      });
      this.line.setMap(this.map);
    }
  }

  drawCourseLayer() {
    if (!this.course) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.layers.course.forEach((o) => o.setMap(null));
    this.layers.course = [];
    const proj = this.map.getProjection();
    const toLatLng = (x, y) => {
      const c = proj.coordsFromContainerPoint(new kakao.maps.Point(x, y));
      return { lat: c.getLat(), lng: c.getLng() };
    };
    // 1) 같은 좌표의 코스 장소를 한 자리로 모은다
    const spots = new Map();
    this.course.items.forEach((it, i) => {
      const k = `${it.place.lat.toFixed(5)},${it.place.lng.toFixed(5)}`;
      if (!spots.has(k)) {
        const pt = proj.containerPointFromCoords(ll(it.place));
        spots.set(k, { x: pt.x, y: pt.y, members: [] });
      }
      spots.get(k).members.push({ it, no: i + 1 });
    });
    // 2) 화면에서 가까운 자리끼리 묶는다(핀 24px 안에 들어오면 겹친다고 본다)
    const groups = [];
    for (const sp of spots.values()) {
      const g = groups.find((c) => Math.hypot(c.x - sp.x, c.y - sp.y) < 28);
      if (g) {
        g.spots.push(sp);
        g.x = g.spots.reduce((a, s) => a + s.x, 0) / g.spots.length;
        g.y = g.spots.reduce((a, s) => a + s.y, 0) / g.spots.length;
      } else groups.push({ x: sp.x, y: sp.y, spots: [sp] });
    }
    let selectedAt = null;
    for (const g of groups) {
      const members = g.spots.flatMap((s) => s.members);
      if (g.spots.length > 1) {
        // 가까운 서로 다른 장소들: 개수 하나로 묶는다. 누르면 그 장소들이 모두 보이게 확대한다.
        this.add('course', toLatLng(g.x, g.y), { cluster: members.length, clickable: true, z: 5 }, () => this.zoomTo(members.map((m) => m.it.place)));
        continue;
      }
      // 같은 좌표(또는 한 장소): 둘 이상이면 둘레로 벌려 겹침을 줄인다
      members.forEach((m, j) => {
        let x = g.x, y = g.y;
        if (members.length > 1) {
          const angle = (2 * Math.PI * j) / members.length - Math.PI / 2;
          x += Math.cos(angle) * 18;
          y += Math.sin(angle) * 18;
        }
        const pos = members.length > 1 ? toLatLng(x, y) : m.it.place;
        const selected = this.selectedCourse === m.no;
        if (selected) selectedAt = { pos, item: m.it };
        this.add('course', pos, { no: m.no, selected, noLabel: true, label: m.it.place.name, clickable: true, z: selected ? 100 : 5 }, () => this.selectCourse(m.no));
      });
    }
    if (selectedAt) this.showInfo(selectedAt.pos, selectedAt.item);
    else this.closeInfo(false);
  }

  // 코스 핀을 누르면 그 핀을 맨 위로 올리고 정보창을 연다. 같은 핀을 다시 누르면 닫는다.
  selectCourse(no) {
    this.selectedCourse = this.selectedCourse === no ? null : no;
    this.drawCourseLayer();
  }

  showInfo(pos, item) {
    this.info?.setMap(null);
    const p = item.place;
    const d = item.distance > 0 ? formatDistance(item.distance) : null;
    const el = document.createElement('div');
    el.className = 'map-info-wrap';
    el.innerHTML = `<div class="map-info" role="status"><p class="map-info-name">${esc(p.name)}</p><p class="map-info-sub">${esc(KIND_LABEL[p.kind] || '')}${d ? ` · 직선 <span class="num">${d.value}</span>${d.unit}` : ''}</p></div>`;
    this.info = new kakao.maps.CustomOverlay({ position: ll(pos), content: el, xAnchor: 0.5, yAnchor: 1, zIndex: 101 });
    this.info.setMap(this.map);
  }

  // redraw=false면 선택 상태는 두고 정보창만 치운다(다시 그리는 중에 쓴다)
  closeInfo(redraw = true) {
    this.info?.setMap(null);
    this.info = null;
    if (redraw && this.selectedCourse !== null) {
      this.selectedCourse = null;
      this.drawCourseLayer();
    }
  }

  // 이 장소를 선택 핀(이름표 포함)으로 띄운다. 근처 장소 핀 자리를 쓴다.
  showPlace(place) {
    this.clear('nearby');
    this.add('nearby', place, { selected: true, label: place.name });
  }

  // padding: [top, right, bottom, left] px
  fit(points, padding = [40, 40, 40, 40]) {
    if (!points.length) return;
    this._prog(true);
    this.map.setBounds(boundsOf(points), ...padding);
  }

  // 한 곳으로 확대한다. padding은 fit과 같은 [위, 오른쪽, 아래, 왼쪽]이고, 시트에 가리지 않는 가운데에 핀을 둔다.
  focus(place, level, padding = [0, 0, 0, 0]) {
    this._prog(true);
    this.map.setLevel(level);
    this.map.setCenter(ll(place));
    // 핀이 놓일 화면 위치(가려지지 않는 영역의 가운데)와 정반대 지점을 지도 중심으로 삼는다
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const px = (padding[3] + w - padding[1]) / 2, py = (padding[0] + h - padding[2]) / 2;
    const c = this.map.getProjection().coordsFromContainerPoint(new kakao.maps.Point(w - px, h - py));
    this.map.setCenter(c);
  }

  getView() {
    const c = this.map.getCenter();
    return { lat: c.getLat(), lng: c.getLng(), level: this.map.getLevel() };
  }

  // 첫 화면으로 돌아가도 지도가 그 자리에 머물게 한다.
  // 지도 칸의 위치·크기가 화면마다 달라서(PC는 왼쪽 목록 때문에 지도가 오른쪽으로 밀려 있다) 지도 중심의 화면 좌표를 같이 기억해 두었다가,
  // 돌아온 뒤에도 지도 위의 모든 곳이 화면의 같은 자리에 오도록 중심을 옮긴다.
  carryView() {
    const r = this.el.getBoundingClientRect();
    return { ...this.getView(), cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  restoreCarried(v) {
    this._prog(false);
    this.map.setLevel(v.level);
    this.map.setCenter(new kakao.maps.LatLng(v.lat, v.lng));
    const r = this.el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - v.cx, dy = r.top + r.height / 2 - v.cy;
    const c = this.map.getProjection().coordsFromContainerPoint(new kakao.maps.Point(r.width / 2 + dx, r.height / 2 + dy));
    this.map.setCenter(c);
  }

  setView(v) {
    this._prog(false);
    this.map.setLevel(v.level);
    this.map.setCenter(new kakao.maps.LatLng(v.lat, v.lng));
  }
}

function drawCourse(target, items) {
  const pts = items.map((it) => it.place).filter((p) => p.lat !== null);
  items.forEach((it, i) => {
    if (it.place.lat === null) return;
    target.add('course', it.place, { no: i + 1 });
  });
  // 핀이 하나뿐이면 선 없이 핀만
  if (pts.length > 1) {
    // 코스 경로선: 1px 직선, 지도 고정 색
    target.line = new kakao.maps.Polyline({
      path: pts.map(ll), strokeWeight: 1, strokeColor: '#1A1917', strokeOpacity: 1, strokeStyle: 'solid',
    });
    target.line.setMap(target.map);
  }
}

// 모바일 S4의 전체 경로 지도: 보기 전용 [제안]
export function createRouteMap(container, items) {
  const map = new kakao.maps.Map(container, {
    center: ll(items[0].place), level: 5, draggable: false, scrollwheel: false, disableDoubleClickZoom: true,
  });
  map.setZoomable(false);
  const target = { map, line: null, add(layer, place, opts) {
    new kakao.maps.CustomOverlay({ position: ll(place), content: pinEl(opts), xAnchor: 0.5, yAnchor: 0.5, zIndex: 2 }).setMap(map);
  } };
  drawCourse(target, items);
  map.setBounds(boundsOf(items.map((it) => it.place)), 32, 32, 32, 32);
  return map;
}
