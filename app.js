'use strict';

const PART_META = {
  teaching: { label: 'Teaching',          hint: 'hear once' },
  micro:    { label: 'Daily practice',    hint: 'repeat often' },
  extended: { label: 'Extended practice', hint: 'when time permits' },
  unaided:  { label: 'Unaided',           hint: 'run it yourself' },
  cueCard:  { label: 'Cue card',          hint: 'memorisation aid' },
};
const PART_ORDER = ['teaching', 'micro', 'extended', 'unaided', 'cueCard'];

const journeyEl  = document.getElementById('journey');
const progressEl = document.getElementById('progress');
const fillEl     = document.getElementById('progressFill');
const labelEl    = document.getElementById('progressLabel');
const player     = document.getElementById('player');

const mini = {
  root:    document.getElementById('mini'),
  play:    document.getElementById('miniPlay'),
  restart: document.getElementById('miniRestart'),
  title:   document.getElementById('miniTitle'),
  seek:    document.getElementById('miniSeek'),
  cur:     document.getElementById('miniCur'),
  dur:     document.getElementById('miniDur'),
};

const STORE = 'nidra-progress-v1';
const done  = JSON.parse(localStorage.getItem(STORE) || '{}');
const saveDone = () => localStorage.setItem(STORE, JSON.stringify(done));

let practisable = [];
let activeBtn = null;

const fmt = (s) => (s && isFinite(s)) || s === 0
  ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';

/* ---------- audio + mini-player ---------- */
function setBtnState(btn, playing) {
  btn.classList.toggle('playing', playing);
  btn.textContent = playing ? '❚❚' : '▶';
}
function startTrack(btn) {
  if (activeBtn === btn) { player.paused ? player.play() : player.pause(); return; }
  if (activeBtn) setBtnState(activeBtn, false);
  activeBtn = btn;
  player.src = btn.dataset.src;
  player.play().catch((e) => console.warn('play failed', e));
  mini.title.textContent = `${btn.dataset.title} · ${btn.dataset.part}`;
  mini.root.hidden = false;
  mini.seek.value = 0; mini.cur.textContent = '0:00'; mini.dur.textContent = '0:00';
}
player.onplay  = () => { if (activeBtn) setBtnState(activeBtn, true);  mini.play.textContent = '❚❚'; };
player.onpause = () => { if (activeBtn) setBtnState(activeBtn, false); mini.play.textContent = '▶'; };
player.onended = () => { if (activeBtn) setBtnState(activeBtn, false); mini.play.textContent = '▶'; };
player.onloadedmetadata = () => { mini.dur.textContent = fmt(player.duration); };
player.ontimeupdate = () => {
  if (!player.duration) return;
  mini.seek.value = Math.round((player.currentTime / player.duration) * 1000);
  mini.cur.textContent = fmt(player.currentTime);
};
mini.play.onclick    = () => { if (player.src) player.paused ? player.play() : player.pause(); };
mini.restart.onclick = () => { if (player.src) { player.currentTime = 0; player.play(); } };
mini.seek.oninput    = () => { if (player.duration) player.currentTime = (mini.seek.value / 1000) * player.duration; };

/* ---------- progress ---------- */
function toggleDone(el) {
  const id = el.dataset.id;
  done[id] = !done[id];
  el.classList.toggle('on', !!done[id]);
  el.textContent = done[id] ? '✓' : '';
  saveDone(); updateProgress(); refreshCards();
}
function updateProgress() {
  const total = practisable.length;
  const n = practisable.filter((id) => done[id]).length;
  fillEl.style.width = (total ? Math.round((n / total) * 100) : 0) + '%';
  labelEl.textContent = `${n} of ${total} recordings marked practised`;
  progressEl.hidden = total === 0;
}
function refreshCards() {
  journeyEl.querySelectorAll('.card').forEach((card) => {
    const checks = [...card.querySelectorAll('.check')];
    card.classList.toggle('done-all', checks.length > 0 && checks.every((c) => c.classList.contains('on')));
  });
}

/* ---------- render ---------- */
const plannedRow = (m, glyph) => `<li class="part planned"><span class="play">${glyph}</span>
  <div class="part-main"><div class="part-label">${m.label}</div>
  <div class="part-meta">${m.hint}</div></div><span class="soon">coming soon</span></li>`;

function partRow(seq, title, key, part) {
  const m = PART_META[key] || { label: key, hint: '' };
  const built = part.status === 'built';
  const id = `${seq}:${key}`;

  if (part.audio) {
    if (!built) return plannedRow(m, '▶');
    practisable.push(id);
    const on = done[id] ? 'on' : '';
    return `<li class="part">
      <button class="play" data-src="${part.audio}" data-title="${title}" data-part="${m.label}" aria-label="Play ${m.label}">▶</button>
      <div class="part-main"><div class="part-label">${m.label}</div>
        <div class="part-meta">${m.hint}${part.durationSec ? ' · ' + fmt(part.durationSec) : ''}</div></div>
      <button class="check ${on}" data-id="${id}" title="Mark practised">${done[id] ? '✓' : ''}</button>
    </li>`;
  }
  if (key === 'cueCard' && built && part.file) {
    return `<li class="part"><span class="play">▤</span>
      <div class="part-main"><div class="part-label"><a href="${part.file}">${m.label}</a></div>
      <div class="part-meta">${m.hint}</div></div></li>`;
  }
  return plannedRow(m, key === 'cueCard' ? '▤' : '▶');
}

function card(item) {
  const isPractice = item.type === 'practice';
  const badges = [
    `<span class="badge ${isPractice ? 'practice' : ''}">${isPractice ? 'Practice' : 'Orientation'}</span>`,
    isPractice && item.practiceModule ? `<span class="badge practice">Module ${item.practiceModule}</span>` : '',
  ].join('');
  const sources = (item.sources && item.sources.length)
    ? `<p class="sources">Source: ${item.sources.join('; ')}</p>` : '';
  const parts = PART_ORDER
    .filter((k) => item.parts[k])
    .map((k) => partRow(item.seq, item.title, k, item.parts[k])).join('');

  return `<article class="card ${item.type}">
    <div class="card-head">
      <div class="seq">${item.seq}</div>
      <div class="card-title">
        <div class="badges">${badges}</div>
        <h2>${item.title}</h2>
        ${sources}
      </div>
    </div>
    <ul class="parts">${parts}</ul>
  </article>`;
}

async function init() {
  try {
    const res = await fetch('manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    practisable = [];
    journeyEl.innerHTML = data.items.map(card).join('');
    journeyEl.querySelectorAll('.play[data-src]').forEach((b) =>
      b.addEventListener('click', () => startTrack(b)));
    journeyEl.querySelectorAll('.check').forEach((c) =>
      c.addEventListener('click', () => toggleDone(c)));
    updateProgress();
    refreshCards();
  } catch (e) {
    journeyEl.innerHTML = `<p class="loading">Could not load the journey (${e.message}).</p>`;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
}
init();
