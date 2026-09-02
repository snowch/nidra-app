'use strict';

const PART_META = {
  teaching: { label: 'Teaching',          hint: 'hear once' },
  extended: { label: 'Daily practice',    hint: 'a few minutes · return to it often' },
  unaided:  { label: 'Full practice',     hint: 'the whole nidra' },
  summaryCard: { label: 'Summary',        hint: 'key points' },
  cueCard:  { label: 'Cue card',          hint: 'memorisation aid' },
};
const PART_ORDER = ['teaching', 'summaryCard', 'extended', 'unaided', 'cueCard'];

const journeyEl  = document.getElementById('journey');
const progressEl = document.getElementById('progress');
const fillEl     = document.getElementById('progressFill');
const labelEl    = document.getElementById('progressLabel');
const player     = document.getElementById('player');
const offlineBox = document.getElementById('offlineBox');
const offlineAll = document.getElementById('offlineAll');
const offlineSt  = document.getElementById('offlineStatus');
const cueModal   = document.getElementById('cueModal');
const cueBody    = document.getElementById('cueBody');
const cueClose   = document.getElementById('cueClose');

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
const OPEN_STORE = 'nidra-open-v1';
const openState = JSON.parse(localStorage.getItem(OPEN_STORE) || '{}');
const saveOpen = () => localStorage.setItem(OPEN_STORE, JSON.stringify(openState));
const JRNL_STORE = 'nidra-journal-v1';
const journal = JSON.parse(localStorage.getItem(JRNL_STORE) || '{}');
journal.log = Array.isArray(journal.log) ? journal.log : [];   // {t, note, awake:'awake'|'drifted'|''}
if (journal.sankalpa && typeof journal.sankalpa !== 'object') journal.sankalpa = null;   // {text, setAt}
const saveJournal = () => localStorage.setItem(JRNL_STORE, JSON.stringify(journal));
const hasCaches = 'caches' in window;

let practisable = [];
let offlineUrls = [];
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

/* ---------- cue card modal (renders markdown in-app) ---------- */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  let html = '', list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    let m;
    if ((m = line.match(/^#\s+(.*)/)))        { closeList(); html += `<h3>${inline(m[1])}</h3>`; }
    else if ((m = line.match(/^>\s?(.*)/)))    { closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if ((m = line.match(/^\d+\.\s+(.*)/))){ if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^[-*]\s+(.*)/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else                                       { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html;
}
async function openCue(file) {
  try {
    const res = await fetch(file);
    cueBody.innerHTML = mdToHtml(await res.text());
  } catch (e) {
    cueBody.innerHTML = '<p>Could not load the cue card.</p>';
  }
  cueModal.hidden = false;
}
function closeCue() { cueModal.hidden = true; }
cueClose.addEventListener('click', closeCue);
cueModal.addEventListener('click', (e) => { if (e.target === cueModal) closeCue(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCue(); });

/* ---------- practice journal + Sankalpa (kept only on this device) ---------- */
const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const AWAKE_LABEL = { awake: 'Stayed aware', drifted: 'Drifted off' };
function fmtDate(t) { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtWhen(t) {
  const d = new Date(t), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `Today ${hh}:${mm}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${hh}:${mm}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${hh}:${mm}`;
}

let jEditSk = false;
function sankalpaSection(edit) {
  const sk = journal.sankalpa;
  if (edit || !sk) {
    return `<div class="jr-sec"><div class="jr-h">Your Sankalpa</div>` +
      `<p class="jr-guide">A Sankalpa is a short resolve, stated in the present tense, as if already true. The tradition asks you keep the <em>same</em> resolve, unchanged, over months — so choose with care.</p>` +
      `<p class="jr-guide">Not sure yet? Don't let choosing hold you up — begin with a simple resolve of being, and let a truer one surface over time.</p>` +
      `<textarea class="jr-input" id="skInput" rows="2" maxlength="200" placeholder="e.g. I am at peace, just as I am">${sk ? escH(sk.text) : ''}</textarea>` +
      `<button class="jr-starter" id="skStarter" type="button">Use “I am at peace, just as I am”</button>` +
      `<div class="jr-actions">${sk ? '<button class="jr-cancel" id="skCancel">Cancel</button>' : ''}<button class="jr-save" id="skSave">Save resolve</button></div></div>`;
  }
  return `<div class="jr-sec"><div class="jr-h">Your Sankalpa</div>` +
    `<blockquote class="jr-sankalpa">${escH(sk.text)}</blockquote>` +
    `<div class="jr-sub">Held since ${fmtDate(sk.setAt)} · <button class="jr-link" id="skEdit">edit</button></div>` +
    `<p class="jr-guide">Repeat it, in the same words, at the start and again at the end of every practice.</p></div>`;
}
function logSection() {
  return `<div class="jr-sec"><div class="jr-h">Log a practice</div>` +
    `<div class="jr-opts">` +
      Object.keys(AWAKE_LABEL).map((k) => `<button class="jr-opt" data-a="${k}">${AWAKE_LABEL[k]}</button>`).join('') +
    `</div>` +
    `<textarea class="jr-input" id="jrNote" rows="2" maxlength="1000" placeholder="What arose? Images, feelings, how deep you went (optional)"></textarea>` +
    `<div class="jr-actions"><button class="jr-save" id="jrSave">Add entry</button></div></div>`;
}
function historySection() {
  if (!journal.log.length) return '';
  const items = [...journal.log].sort((a, b) => b.t - a.t).map((e) =>
    `<li class="jr-item"><div class="jr-item-h">` +
      (e.awake ? `<span class="jr-badge ${e.awake}">${AWAKE_LABEL[e.awake] || e.awake}</span>` : '') +
      `<span class="jr-when">${fmtWhen(e.t)}</span>` +
      `<button class="jr-del" data-t="${e.t}" aria-label="Delete entry">✕</button></div>` +
      (e.note ? `<div class="jr-note-txt">${escH(e.note)}</div>` : '') + `</li>`).join('');
  return `<div class="jr-sec"><div class="jr-h">Your journal</div><ul class="jr-list">${items}</ul></div>`;
}
function openJournal() {
  cueBody.innerHTML = `<h3>Practice journal</h3>` + sankalpaSection(jEditSk) + logSection() + historySection() +
    `<p class="jr-priv">Your Sankalpa and journal are kept only on this device — nothing is uploaded. Clearing the app’s site data erases them.</p>`;
  cueModal.hidden = false;
  wireJournal();
}
function wireJournal() {
  const skSave = document.getElementById('skSave');
  if (skSave) skSave.onclick = () => {
    const v = (document.getElementById('skInput').value || '').trim().slice(0, 200);
    if (!v) return; journal.sankalpa = { text: v, setAt: Date.now() }; saveJournal(); jEditSk = false; openJournal(); renderSankalpaBanner();
  };
  const skCancel = document.getElementById('skCancel'); if (skCancel) skCancel.onclick = () => { jEditSk = false; openJournal(); };
  const skEdit = document.getElementById('skEdit'); if (skEdit) skEdit.onclick = () => { jEditSk = true; openJournal(); };
  const skStarter = document.getElementById('skStarter');
  if (skStarter) skStarter.onclick = () => { const ta = document.getElementById('skInput'); if (ta) { ta.value = 'I am at peace, just as I am'; ta.focus(); } };
  let awake = null;
  cueBody.querySelectorAll('.jr-opt').forEach((b) => b.onclick = () => {
    const was = b.classList.contains('on');
    cueBody.querySelectorAll('.jr-opt').forEach((x) => x.classList.remove('on'));
    if (!was) { b.classList.add('on'); awake = b.dataset.a; } else awake = null;
  });
  const jrSave = document.getElementById('jrSave');
  if (jrSave) jrSave.onclick = () => {
    const note = (document.getElementById('jrNote').value || '').trim().slice(0, 1000);
    if (!note && !awake) return;
    journal.log.push({ t: Date.now(), note, awake: awake || '' }); saveJournal(); jEditSk = false; openJournal();
  };
  cueBody.querySelectorAll('.jr-del').forEach((b) => b.onclick = () => {
    const t = +b.dataset.t; journal.log = journal.log.filter((e) => e.t !== t); saveJournal(); openJournal();
  });
}
function sankalpaBannerHtml() {
  const sk = journal.sankalpa; if (!sk) return '';
  return `<button class="sk-banner" id="skBannerBtn"><span class="sk-banner-label">Your Sankalpa</span><span class="sk-banner-text">${escH(sk.text)}</span></button>`;
}
function renderSankalpaBanner() {
  const el = document.getElementById('skBanner'); if (!el) return;
  el.innerHTML = sankalpaBannerHtml();
  const b = document.getElementById('skBannerBtn'); if (b) b.onclick = openJournal;
}
const journalBtn = document.getElementById('journalBtn');
if (journalBtn) journalBtn.onclick = () => { jEditSk = false; openJournal(); };

/* ---------- offline caching (stays inside the app) ---------- */
const isCached     = async (url) => { try { return hasCaches && !!(await caches.match(url)); } catch { return false; } };
const ensureCached = async (url) => { try { await fetch(url); } catch (e) { console.warn('cache', e); } };

async function saveForOffline() {
  offlineAll.disabled = true;
  let n = 0;
  for (const url of offlineUrls) {
    await ensureCached(url);
    offlineSt.textContent = `saving ${++n} / ${offlineUrls.length}…`;
  }
  offlineAll.textContent = '✓ Available offline';
  offlineSt.textContent = '';
}
async function refreshOfflineUI() {
  if (!hasCaches || !offlineUrls.length) { offlineBox.hidden = true; return; }
  offlineBox.hidden = false;
  let cached = 0;
  for (const url of offlineUrls) if (await isCached(url)) cached++;
  if (cached === offlineUrls.length) { offlineAll.textContent = '✓ Available offline'; offlineAll.disabled = true; }
  else offlineSt.textContent = `${offlineUrls.length} recordings`;
}

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

const sectionHeader = (label) => `<div class="section">${label}</div>`;

function orientationTile(items) {
  const rows = items.map((it) => {
    const t = it.parts.teaching, s = it.parts.summaryCard;
    const built = t && t.status === 'built' && t.audio;
    let play, meta;
    if (built) {
      offlineUrls.push(t.audio);
      play = `<button class="play" data-src="${t.audio}" data-title="${it.title}" data-part="Teaching" aria-label="Play ${it.title}">▶</button>`;
      meta = `hear once${t.durationSec ? ' · ' + fmt(t.durationSec) : ''}`;
    } else { play = `<span class="play">▶</span>`; meta = 'coming soon'; }
    const summary = (s && s.status === 'built' && s.file)
      ? `<button class="mini-summary cue-open" data-file="${s.file}" title="Summary" aria-label="Summary of ${it.title}">▤</button>` : '';
    return `<li class="part">${play}<div class="part-main"><div class="part-label">${it.title}</div><div class="part-meta">${meta}</div></div>${summary}</li>`;
  }).join('');
  const open = !!openState['orient'];
  return `<article class="card orientation ${open ? '' : 'collapsed'}" data-id="orient">
    <div class="card-head" data-toggle="orient"><div class="seq">✦</div><div class="card-title">
      <div class="badges"><span class="badge">Orientation · listen once</span></div>
      <h2>The teachings</h2></div><span class="chev">${open ? '▾' : '▸'}</span></div>
    <div class="card-body"><ul class="parts">${rows}</ul></div></article>`;
}

function toggleCard(id) {
  openState[id] = !openState[id]; saveOpen();
  const c = journeyEl.querySelector(`.card[data-id="${id}"]`);
  if (c) { c.classList.toggle('collapsed', !openState[id]); const ch = c.querySelector('.chev'); if (ch) ch.textContent = openState[id] ? '▾' : '▸'; }
}
function moduleDone(item) {
  const keys = ['teaching', 'extended', 'unaided'].filter((k) => item.parts[k] && item.parts[k].status === 'built' && item.parts[k].audio);
  return keys.length > 0 && keys.every((k) => done[`${item.seq}:${k}`]);
}

function partRow(seq, title, key, part) {
  let m = PART_META[key] || { label: key, hint: '' };
  // M10 has two full nidras — relabel so long vs short is unmistakable
  if (seq === '14' && key === 'extended') m = { label: 'Full nidra — traditional', hint: 'the deep, ~28-min practice' };
  if (seq === '14' && key === 'unaided')  m = { label: 'Full nidra — everyday',    hint: 'the shorter whole practice' };
  const built = part.status === 'built';

  if (key === 'cueCard' || key === 'summaryCard') {
    if (built && part.file) {
      return `<li class="part">
        <button class="play cue-open" data-file="${part.file}" aria-label="Open ${m.label}">▤</button>
        <div class="part-main"><div class="part-label">${m.label}</div>
        <div class="part-meta">${m.hint}</div></div></li>`;
    }
    return plannedRow(m, '▤');
  }

  if (part.audio) {
    if (!built) return plannedRow(m, '▶');
    const id = `${seq}:${key}`;
    practisable.push(id);
    offlineUrls.push(part.audio);
    const on = done[id] ? 'on' : '';
    return `<li class="part">
      <button class="play" data-src="${part.audio}" data-title="${title}" data-part="${m.label}" aria-label="Play ${m.label}">▶</button>
      <div class="part-main"><div class="part-label">${m.label}</div>
        <div class="part-meta">${m.hint}${part.durationSec ? ' · ' + fmt(part.durationSec) : ''}</div></div>
      <button class="check ${on}" data-id="${id}" title="Mark practised">${done[id] ? '✓' : ''}</button>
    </li>`;
  }
  return plannedRow(m, '▶');
}

function card(item) {
  const isPractice = item.type === 'practice';
  const badges = [
    `<span class="badge ${isPractice ? 'practice' : ''}">${isPractice ? 'Practice' : 'Orientation'}</span>`,
    isPractice && item.practiceModule ? `<span class="badge practice">Module ${item.practiceModule}</span>` : '',
  ].join('');
  const sources = (item.sources && item.sources.length)
    ? `<p class="sources">Source: ${item.sources.join('; ')}</p>` : '';
  const prereqs = (item.prerequisites && item.prerequisites.length)
    ? `<div class="prereq"><span class="prereq-label">Before you begin</span><ul>${
        item.prerequisites.map((p) => `<li>${p}</li>`).join('')}</ul></div>` : '';
  const parts = PART_ORDER
    .filter((k) => item.parts[k])
    .map((k) => partRow(item.seq, item.title, k, item.parts[k])).join('');

  const open = !!openState[item.id];
  return `<article class="card ${item.type} ${open ? '' : 'collapsed'}" data-id="${item.id}">
    <div class="card-head" data-toggle="${item.id}">
      <div class="seq">${item.seq}</div>
      <div class="card-title">
        <div class="badges">${badges}</div>
        <h2>${item.title}</h2>
        ${sources}
      </div>
      <span class="chev">${open ? '▾' : '▸'}</span>
    </div>
    <div class="card-body">${prereqs}<ul class="parts">${parts}</ul></div>
  </article>`;
}

// The cumulative practice: one unbroken flow through everything learned so far.
// Shows the milestone matching the furthest module you've marked practised; grows as you progress.
function cumulativeSection(data, practice) {
  const cum = data.cumulative || [];
  if (!cum.length) return '';
  // Unlock on the furthest module whose practice you've marked done (a single tick, not teaching too).
  const reached = practice.filter((it) => done[`${it.seq}:extended`]).map((it) => it.practiceModule || 0);
  const furthest = reached.length ? Math.max(...reached) : 0;
  const firstStage = practice[0] ? practice[0].title : 'Stillness';
  if (furthest < 1) {
    // Visible locked placeholder, so it's clear the practice exists and how it appears.
    return sectionHeader('Put it together') +
      `<article class="card practice cumulative-card locked" data-id="cumulative">
        <div class="card-head static"><div class="seq">∞</div><div class="card-title">
          <div class="badges"><span class="badge">Whole practice · locked</span></div>
          <h2>Flow it together</h2></div></div>
        <div class="card-body">
          <p class="cumulative-note">One unbroken practice through everything you have learned — the way a full nidra is done. It appears here, and grows, as you mark each stage practised. Begin with ${escH(firstStage)}.</p>
        </div>
      </article>`;
  }
  const avail = cum.filter((c) => c.module <= furthest);
  const cur = avail.length ? avail[avail.length - 1] : cum[0];
  offlineUrls.push(cur.audio);
  const stageTitle = (practice.find((it) => it.id === cur.through) || {}).title || cur.through;
  const complete = cur.module >= cum[cum.length - 1].module;
  return sectionHeader('Put it together') +
    `<article class="card practice cumulative-card" data-id="cumulative">
      <div class="card-head static"><div class="seq">∞</div><div class="card-title">
        <div class="badges"><span class="badge practice">Whole practice</span></div>
        <h2>Flow it together</h2></div></div>
      <div class="card-body">
        <p class="cumulative-note">One unbroken practice through everything you have learned so far — the way a full nidra is done. It grows as you progress.</p>
        <ul class="parts"><li class="part">
          <button class="play" data-src="${cur.audio}" data-title="Cumulative practice" data-part="through ${stageTitle}" aria-label="Play cumulative practice">▶</button>
          <div class="part-main"><div class="part-label">Through ${stageTitle}</div>
          <div class="part-meta">flowing · ${fmt(cur.durationSec)}${complete ? ' · the whole practice' : ' · grows as you learn more'}</div></div>
        </li></ul>
      </div>
    </article>`;
}

async function init() {
  try {
    const res = await fetch('manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    practisable = []; offlineUrls = [];
    const items = data.items;
    const firstP = items.findIndex((it) => it.type === 'practice');
    let lastP = -1; items.forEach((it, ix) => { if (it.type === 'practice') lastP = ix; });
    const lead = items.filter((it, ix) => it.type === 'orientation' && ix < firstP);
    const practice = items.filter((it) => it.type === 'practice');
    const trail = items.filter((it, ix) => it.type === 'orientation' && ix > lastP);
    // collapse defaults: orientation tile open; the module you're on open; rest collapsed
    if (!('orient' in openState)) openState['orient'] = true;
    const current = practice.find((it) => !moduleDone(it));
    if (current) openState[current.id] = true;
    journeyEl.innerHTML =
      `<div id="skBanner"></div>` +
      sectionHeader('Orientation') + orientationTile(lead) +
      cumulativeSection(data, practice) +
      sectionHeader('The practice') + practice.map(card).join('') +
      (trail.length ? sectionHeader('In closing') + trail.map(card).join('') : '');
    journeyEl.querySelectorAll('.card-head[data-toggle]').forEach((h) =>
      h.addEventListener('click', () => toggleCard(h.dataset.toggle)));
    journeyEl.querySelectorAll('.play[data-src]').forEach((b) =>
      b.addEventListener('click', () => startTrack(b)));
    journeyEl.querySelectorAll('.check').forEach((c) =>
      c.addEventListener('click', () => toggleDone(c)));
    journeyEl.querySelectorAll('.cue-open').forEach((b) =>
      b.addEventListener('click', () => openCue(b.dataset.file)));
    offlineAll.addEventListener('click', saveForOffline);
    renderSankalpaBanner();
    updateProgress();
    refreshCards();
    refreshOfflineUI();
  } catch (e) {
    journeyEl.innerHTML = `<p class="loading">Could not load the journey (${e.message}).</p>`;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
}
init();
