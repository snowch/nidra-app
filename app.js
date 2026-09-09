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
journal.log = Array.isArray(journal.log) ? journal.log : [];   // {t, note, awake:'awake'|'drifted'|'asleep'|''}
if (journal.sankalpa && typeof journal.sankalpa !== 'object') journal.sankalpa = null;   // {text, setAt}
const saveJournal = () => localStorage.setItem(JRNL_STORE, JSON.stringify(journal));
const hasCaches = 'caches' in window;

let practisable = [];
let offlineUrls = [];
let activeBtn = null;
let DATA = null;

const fmt = (s) => (s && isFinite(s)) || s === 0
  ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';

/* ---------- audio + mini-player ---------- */
function setBtnState(btn, playing) {
  btn.classList.toggle('playing', playing);
  btn.textContent = playing ? '❚❚' : (btn.dataset.idle || '▶');
}
function startTrack(btn) {
  stopSession();
  if (activeBtn === btn) { player.paused ? player.play() : player.pause(); return; }
  if (activeBtn) setBtnState(activeBtn, false);
  activeBtn = btn;
  player.src = btn.dataset.src;
  player.play().catch((e) => console.warn('play failed', e));
  mini.title.textContent = `${btn.dataset.title} · ${btn.dataset.part}`;
  mini.root.hidden = false; mini.root.classList.remove('session');
  mini.seek.value = 0; mini.cur.textContent = '0:00'; mini.dur.textContent = '0:00';
}
player.onplay  = () => { if (!session && activeBtn) setBtnState(activeBtn, true);  mini.play.textContent = '❚❚'; };
player.onpause = () => { if (!session && activeBtn) setBtnState(activeBtn, false); if (!session) mini.play.textContent = '▶'; };
player.onended = () => { if (session) { if (!session.paused) stepSession(); } else { if (activeBtn) setBtnState(activeBtn, false); mini.play.textContent = '▶'; } };
player.onloadedmetadata = () => { if (!session) mini.dur.textContent = fmt(player.duration); };
player.ontimeupdate = () => {
  if (session || !player.duration) return;
  mini.seek.value = Math.round((player.currentTime / player.duration) * 1000);
  mini.cur.textContent = fmt(player.currentTime);
};
mini.play.onclick    = () => { if (session) toggleSession(); else if (player.src) player.paused ? player.play() : player.pause(); };
mini.restart.onclick = () => { if (session) seekSession(0); else if (player.src) { player.currentTime = 0; player.play(); } };
mini.seek.oninput    = () => {
  if (session) { session.seeking = true; mini.cur.textContent = fmt((mini.seek.value / 1000) * session.total); }
  else if (player.duration) player.currentTime = (mini.seek.value / 1000) * player.duration;
};
mini.seek.onchange   = () => { if (session) { seekSession((mini.seek.value / 1000) * session.total); session.seeking = false; } };

/* ---------- session engine: stepped playback for the full nidras ----------
 * A session is a list of steps: { clip, dur } (a rendered audio clip) or
 * { pause, kind } (a wall-clock gap). Rest pauses scale with the pace setting;
 * resolve pauses are sized from the saved sankalpa; breath-holds never scale. */
let session = null;   // { steps, i, timer, ticker, paused, total, elapsed, lastTick, sleep, seeking }
const PACE_STORE = 'nidra_pace_v1';
let paceScale = parseFloat(localStorage.getItem(PACE_STORE) || '1') || 1;
const savePace = (v) => { paceScale = v; localStorage.setItem(PACE_STORE, String(v)); };
function resolveDur() {
  const sk = journal.sankalpa;
  const w = sk && sk.text ? sk.text.trim().split(/\s+/).filter(Boolean).length : 0;
  if (!w) return 24;                                   // no sankalpa set → the baked default
  return Math.min(60, Math.max(18, Math.round(w * 3 * 0.6 + 7)));   // 3 reps, ~0.6s/word, + a settling beat
}
function stepPause(s) {
  if (s.kind === 'resolve') return resolveDur();
  if (s.kind === 'breath')  return s.pause;            // deep breath-count holds are never scaled
  return Math.max(2, Math.round(s.pause * paceScale));
}
const clipDur = (id) => (DATA.sessionClips[id] && DATA.sessionClips[id].durationSec) || 2;
const stepDur = (s) => (s.pause != null ? stepPause(s) : clipDur(s.clip));
function sessionTotal(id) { return (DATA.sessions[id] || []).reduce((a, s) => a + stepDur(s), 0); }
function sessionTick() {
  if (!session) return;
  if (!session.paused) { const now = performance.now(); session.elapsed = Math.min(session.total, session.elapsed + (now - session.lastTick) / 1000); }
  session.lastTick = performance.now();
  if (session.seeking) return;
  mini.seek.value = session.total ? Math.round((session.elapsed / session.total) * 1000) : 0;
  mini.cur.textContent = fmt(session.elapsed); mini.dur.textContent = fmt(session.total);
}
function seekSession(t) {
  if (!session) return;
  let acc = 0, idx = session.steps.length - 1;
  for (let i = 0; i < session.steps.length; i++) { const d = stepDur(session.steps[i]); if (acc + d > t) { idx = i; break; } acc += d; }
  clearTimeout(session.timer); try { player.pause(); } catch (e) {}
  session.i = idx; session.elapsed = acc; session.paused = false; session.lastTick = performance.now();
  mini.play.textContent = '❚❚';
  mini.seek.value = session.total ? Math.round((acc / session.total) * 1000) : 0; mini.cur.textContent = fmt(acc);
  stepSession();
}
function runSession(id, title, sleep) {
  const steps = DATA.sessions && DATA.sessions[id];
  if (!steps) { console.warn('no session', id); return; }
  stopSession();
  if (activeBtn) { setBtnState(activeBtn, false); activeBtn = null; }
  const total = steps.reduce((a, s) => a + stepDur(s), 0);
  session = { steps, i: 0, timer: null, ticker: null, paused: false, total, elapsed: 0, lastTick: performance.now(), sleep: !!sleep, seeking: false };
  mini.root.hidden = false; mini.root.classList.add('session'); mini.play.textContent = '❚❚';
  mini.title.textContent = title; mini.seek.value = 0; mini.cur.textContent = '0:00'; mini.dur.textContent = fmt(total);
  session.ticker = setInterval(sessionTick, 250);
  stepSession();
}
function stepSession() {
  if (!session) return;
  if (session.i >= session.steps.length) { stopSession(); return; }
  const s = session.steps[session.i++];
  if (s.pause != null) { session.timer = setTimeout(() => { if (session && !session.paused) stepSession(); }, stepPause(s) * 1000); }
  else { player.src = DATA.sessionClips[s.clip].audio; player.play().catch(() => {}); }
}
function toggleSession() {
  if (!session) return;
  if (session.paused) {
    session.paused = false; session.lastTick = performance.now(); mini.play.textContent = '❚❚';
    if (player.src && player.paused && player.currentTime > 0 && !player.ended) player.play(); else stepSession();
  } else {
    session.paused = true; mini.play.textContent = '▶'; clearTimeout(session.timer); if (!player.paused) player.pause();
  }
}
function stopSession() {
  if (!session) return;
  clearTimeout(session.timer); clearInterval(session.ticker); try { player.pause(); } catch (e) {}
  session = null; mini.root.classList.remove('session'); mini.root.hidden = true;
}
function stopTrack() {   // stop single-track playback (orientation / cumulative) and dismiss the mini-player
  if (activeBtn) setBtnState(activeBtn, false);
  activeBtn = null;
  try { player.pause(); } catch (e) {}
  mini.root.hidden = true;
}

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
  showCueModal();
}
// Push a history entry when the sheet opens so the device Back button closes it
// (instead of navigating away to a blank page). Manual dismiss goes through
// history.back() too, so the two paths converge on one popstate handler.
let modalPushed = false;
function showCueModal() { cueModal.hidden = false; if (!modalPushed) { modalPushed = true; history.pushState({ sheet: true }, ''); } }
function closeCue() { cueModal.hidden = true; }
function dismissCue() { if (modalPushed) history.back(); else closeCue(); }
window.addEventListener('popstate', () => {
  if (!cueModal.hidden) { modalPushed = false; closeCue(); return; }   // a sheet is open → Back closes it
  history.pushState({ root: true }, '');                               // stay in the app, never a blank page
  if (session) stopSession();                                         // …then Back stops a playing session…
  else if (activeBtn) stopTrack();                                    // …or a single track
});
// Seed one history entry at load so the first Back press on the journey is caught above, not sent to a blank page.
history.pushState({ root: true }, '');
cueClose.addEventListener('click', dismissCue);
cueModal.addEventListener('click', (e) => { if (e.target === cueModal) dismissCue(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !cueModal.hidden) dismissCue(); });

/* ---------- practice journal + Sankalpa (kept only on this device) ---------- */
const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const AWAKE_LABEL = { awake: 'Stayed aware', drifted: 'Drifted', asleep: 'Fell asleep' };
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
function paceSection() {
  const opts = [['Slower', 1.25], ['Standard', 1], ['Shorter', 0.8]];
  return `<div class="jr-pace"><h4 class="jr-h">Practice pace</h4>` +
    `<p class="jr-hint">Length of the silent rests in the full nidra. Your resolve pause is timed to your Sankalpa automatically.</p>` +
    `<div class="pace-row">` +
    opts.map(([lbl, v]) => `<button class="pace-opt${Math.abs(paceScale - v) < 0.01 ? ' on' : ''}" data-pace="${v}" type="button">${lbl}</button>`).join('') +
    `</div></div>`;
}
function openJournal() {
  cueBody.innerHTML = `<h3>Practice journal</h3>` + sankalpaSection(jEditSk) + paceSection() + logSection() + historySection() +
    `<p class="jr-priv">Your Sankalpa and journal are kept only on this device — nothing is uploaded. Clearing the app’s site data erases them.</p>`;
  showCueModal();
  wireJournal();
}
function wireJournal() {
  const skSave = document.getElementById('skSave');
  if (skSave) skSave.onclick = () => {
    const v = (document.getElementById('skInput').value || '').trim().slice(0, 200);
    if (!v) return; journal.sankalpa = { text: v, setAt: Date.now() }; saveJournal(); jEditSk = false; openJournal(); renderSankalpaBanner(); refreshSkEntry();
  };
  const skCancel = document.getElementById('skCancel'); if (skCancel) skCancel.onclick = () => { jEditSk = false; openJournal(); };
  const skEdit = document.getElementById('skEdit'); if (skEdit) skEdit.onclick = () => { jEditSk = true; openJournal(); };
  const skStarter = document.getElementById('skStarter');
  if (skStarter) skStarter.onclick = () => { const ta = document.getElementById('skInput'); if (ta) { ta.value = 'I am at peace, just as I am'; ta.focus(); } };
  cueBody.querySelectorAll('.pace-opt').forEach((b) => b.onclick = () => {
    savePace(parseFloat(b.dataset.pace));
    cueBody.querySelectorAll('.pace-opt').forEach((x) => x.classList.toggle('on', x === b));
  });
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
// Keep the Sankalpa module's "set it" button label in sync after saving.
function refreshSkEntry() {
  const b = document.querySelector('.sk-set-btn'); if (!b) return;
  b.innerHTML = journal.sankalpa ? `Your Sankalpa: “${escH(journal.sankalpa.text)}” · edit` : '✎ Set your Sankalpa';
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
  saveDone(); updateProgress(); refreshCards(); refreshCumulative();
}
// Re-render the top cumulative card in place when progress changes (it grows/unlocks with done state).
function refreshCumulative() {
  if (!DATA) return;
  const w = document.getElementById('cumWrap'); if (!w) return;
  const practice = DATA.items.filter((it) => it.type === 'practice');
  w.innerHTML = cumulativeSection(DATA, practice);
  w.querySelectorAll('.play[data-src]').forEach((b) => b.addEventListener('click', () => startTrack(b)));
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
  const keys = ['teaching', 'extended', 'unaided'].filter((k) => { const p = item.parts[k]; return p && p.status === 'built' && (p.audio || p.session); });
  return keys.length > 0 && keys.every((k) => done[`${item.seq}:${k}`]);
}

function partRow(seq, title, key, part) {
  let m = PART_META[key] || { label: key, hint: '' };
  if (part.label) m = { label: part.label, hint: part.hint || '' };   // manifest can name a part directly
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

  if (part.audio || part.session) {
    if (!built) return plannedRow(m, '▶');
    const id = `${seq}:${key}`;
    practisable.push(id);
    const useSession = part.session && DATA.sessions && DATA.sessions[part.session];
    const cacheSession = (sid) => (DATA.sessions[sid] || []).forEach((st) => { if (st.clip && DATA.sessionClips[st.clip]) offlineUrls.push(DATA.sessionClips[st.clip].audio); });
    if (useSession) cacheSession(part.session); else if (part.audio) offlineUrls.push(part.audio);
    const mainAttr = useSession ? `data-session="${part.session}"` : `data-src="${part.audio}"`;
    const dur = useSession ? sessionTotal(part.session) : part.durationSec;
    const on = done[id] ? 'on' : '';
    const sleepSession = part.sleepSession && DATA.sessions && DATA.sessions[part.sleepSession];
    let sleepBtn = '', hasSleep = false;
    if (sleepSession || part.sleepAudio) {
      hasSleep = true;
      if (sleepSession) cacheSession(part.sleepSession); else offlineUrls.push(part.sleepAudio);
      const sAttr = sleepSession ? `data-session="${part.sleepSession}"` : `data-src="${part.sleepAudio}"`;
      sleepBtn = `<button class="play sleep" data-idle="☾" ${sAttr} data-title="${title}" data-part="${m.label} · to fall asleep" title="Play to fall asleep — no wake-up" aria-label="Play ${m.label} to fall asleep, with no wake-up">☾</button>`;
    }
    return `<li class="part">
      <button class="play" data-idle="▶" ${mainAttr} data-title="${title}" data-part="${m.label}" aria-label="Play ${m.label}">▶</button>
      <div class="part-main"><div class="part-label">${m.label}</div>
        <div class="part-meta">${m.hint}${dur ? ' · ' + fmt(dur) : ''}${hasSleep ? ' · ☾ fall-asleep version' : ''}</div></div>
      ${sleepBtn}
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
  // The Sankalpa module gets a direct "set it" entry — you choose it right where you learn it.
  const skEntry = item.id === 'sankalpa'
    ? (journal.sankalpa
        ? `<button class="sk-set-btn" data-sk="1">Your Sankalpa: “${escH(journal.sankalpa.text)}” · edit</button>`
        : `<button class="sk-set-btn" data-sk="1">✎ Set your Sankalpa</button>`)
    : '';

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
    <div class="card-body">${prereqs}<ul class="parts">${parts}</ul>${skEntry}${isPractice ? flowRowHtml(item) : ''}</div>
  </article>`;
}
// Below the daily practice: this module's cumulative flow (through this stage), so the flow isn't lost.
function flowRowHtml(item) {
  const cum = (DATA && DATA.cumulative) || []; if (!cum.length) return '';
  const p = item.practiceModule || 0; if (p < 2 || p > 7) return '';   // stages that build the flow (Pratyahara…Witness)
  const maxM = cum[cum.length - 1].module;
  const m = cum.find((c) => c.module === Math.min(p, maxM)); if (!m) return '';
  offlineUrls.push(m.audio);
  const whole = m.module >= maxM;
  return `<div class="flow-row"><span class="flow-label">Flow practice · everything so far</span>` +
    `<ul class="parts"><li class="part">` +
    `<button class="play" data-src="${m.audio}" data-title="${item.title}" data-part="flow practice" aria-label="Play flow practice">▶</button>` +
    `<div class="part-main"><div class="part-label">${whole ? 'The whole practice, flowing' : 'Flow through this stage'}</div>` +
    `<div class="part-meta">one unbroken nidra · ${fmt(m.durationSec)}</div></div></li></ul></div>`;
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
    DATA = await res.json();
    const data = DATA;
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
      `<div id="cumWrap">${cumulativeSection(data, practice)}</div>` +
      sectionHeader('The practice') + practice.map(card).join('') +
      (trail.length ? sectionHeader('In closing') + trail.map(card).join('') : '');
    journeyEl.querySelectorAll('.card-head[data-toggle]').forEach((h) =>
      h.addEventListener('click', () => toggleCard(h.dataset.toggle)));
    journeyEl.querySelectorAll('.play[data-src]').forEach((b) =>
      b.addEventListener('click', () => startTrack(b)));
    journeyEl.querySelectorAll('.play[data-session]').forEach((b) =>
      b.addEventListener('click', () => runSession(b.dataset.session, `${b.dataset.title} · ${b.dataset.part}`, b.classList.contains('sleep'))));
    journeyEl.querySelectorAll('.check').forEach((c) =>
      c.addEventListener('click', () => toggleDone(c)));
    journeyEl.querySelectorAll('.cue-open').forEach((b) =>
      b.addEventListener('click', () => openCue(b.dataset.file)));
    journeyEl.querySelectorAll('.sk-set-btn').forEach((b) =>
      b.addEventListener('click', () => { jEditSk = true; openJournal(); }));
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
  let refreshing = false;
  const hadController = !!navigator.serviceWorker.controller;   // false on first-ever install → don't prompt
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    const bar = document.getElementById('updateBar'); if (bar) bar.hidden = false;   // a freshly-deployed version has taken over
  });
  const rf = document.getElementById('updateRefresh');
  if (rf) rf.onclick = () => { refreshing = true; location.reload(); };
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
}
init();
