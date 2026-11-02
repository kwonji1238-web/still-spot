// 라이트·다크 전환. 값은 src/styles.css의 토큰이 정하고, 여기서는 <html data-theme>만 바꾼다.
// 직접 고른 값은 localStorage에 저장한다(index.html 맨 위의 작은 스크립트가 같은 키로 먼저 읽어 깜빡임을 막는다).
// 고른 적이 없으면 기기 설정(prefers-color-scheme)을 따른다. 지도 타일은 어느 쪽이든 밝은 타일로 고정이다.

import { COPY } from './settings.js';

const KEY = 'stillspot-theme';
const system = matchMedia('(prefers-color-scheme: dark)');

export const currentTheme = () => document.documentElement.dataset.theme || (system.matches ? 'dark' : 'light');

const svg = (d) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const MOON = svg('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>');
const SUN = svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>');

// 라이트일 때는 다크로 가는 달, 다크일 때는 라이트로 가는 해를 보인다.
const face = (theme) =>
  theme === 'dark'
    ? { icon: SUN, label: COPY.themeToLight }
    : { icon: MOON, label: COPY.themeToDark };

export function themeButton() {
  const f = face(currentTheme());
  return `<button class="btn-icon is-bare theme-toggle" type="button" data-action="toggle-theme" aria-label="${f.label}">${f.icon}</button>`;
}

// 주소창(theme-color)을 현재 테마의 canvas 토큰 값에 맞춘다
function syncThemeColor() {
  const canvas = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
  if (canvas) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', canvas));
}

export function syncThemeButtons() {
  const f = face(currentTheme());
  document.querySelectorAll('[data-action="toggle-theme"]').forEach((b) => {
    b.innerHTML = f.icon;
    b.setAttribute('aria-label', f.label);
  });
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(KEY, next); } catch { /* 저장이 막혀도 이번 방문 동안은 바뀐다 */ }
  syncThemeButtons();
  syncThemeColor();
}

// 고른 적이 없을 때 기기 설정이 바뀌면 아이콘만 맞춘다
system.addEventListener('change', () => { syncThemeButtons(); syncThemeColor(); });
syncThemeColor();
