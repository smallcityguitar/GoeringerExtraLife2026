'use strict';
// Shared state storage + validation for the arcade display.
// Uses Upstash Redis (REST) when configured, otherwise an in-memory fallback for local dev.
const crypto = require('crypto');

const KEY = 'extralife:arcade:state:v1';
const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const HAS_REDIS = Boolean(REST_URL && REST_TOKEN);

const SCENES = ['goals', 'donors', 'countdown', 'uptime', 'stream', 'message'];

const DEFAULTS = {
  rev: 0,
  scene: 'goals',
  rotation: { enabled: false, seconds: 20, scenes: ['goals', 'donors', 'uptime'], startedAt: 0 },
  accent: '#ffcb05',
  donateUrl: '',
  participantId: '',
  teamId: '',
  alerts: true,
  eventStart: '',
  eventEnd: '',
  streamers: [],
  streamCycle: { enabled: false, seconds: 45 },
  streamPinned: '',
  messageTitle: '',
  message: '',
  stretchGoals: [],
  tickerMessages: [],
  testAlert: { nonce: 0, name: '', amount: 0, message: '' },
  updatedAt: 0,
};

// Optional settings baked into the code (api/_defaults.json, e.g. exported from the control panel).
// They only seed a brand-new / empty store; anything saved from the control panel wins.
let BAKED = {};
try { BAKED = require('./_defaults.json'); } catch (e) { BAKED = {}; }
let _start = null;
function baseState() {
  if (!_start) {
    let st = JSON.parse(JSON.stringify(DEFAULTS));
    try { st = applyPatch(st, BAKED && typeof BAKED === 'object' ? BAKED : {}); } catch (e) { st = JSON.parse(JSON.stringify(DEFAULTS)); }
    st.rev = 0; st.updatedAt = 0;
    _start = st;
  }
  return JSON.parse(JSON.stringify(_start));
}

async function redis(cmd) {
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

function merge(saved) {
  const sv = saved || {};
  const base = baseState();
  const s = Object.assign(base, sv);
  s.rotation = Object.assign({}, baseState().rotation, sv.rotation || {});
  s.testAlert = Object.assign({}, DEFAULTS.testAlert, sv.testAlert || {});
  s.streamCycle = Object.assign({}, baseState().streamCycle, sv.streamCycle || {});
  s.streamers = Array.isArray(s.streamers) ? s.streamers.slice() : [];
  s.tickerMessages = Array.isArray(s.tickerMessages) ? s.tickerMessages.slice() : [];
  s.stretchGoals = Array.isArray(s.stretchGoals) ? s.stretchGoals.slice() : [];
  if (sv.streamChannel && !s.streamers.length) s.streamers = [sv.streamChannel]; // migrate v1 state
  delete s.streamChannel;
  delete s.title;
  return s;
}

async function loadState() {
  let raw = null;
  if (HAS_REDIS) raw = await redis(['GET', KEY]);
  else raw = global.__arcadeMem || null;
  let parsed = null;
  if (raw) {
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { parsed = null; }
  }
  return merge(parsed);
}

async function saveState(state) {
  const raw = JSON.stringify(state);
  if (HAS_REDIS) await redis(['SET', KEY, raw]);
  else global.__arcadeMem = raw;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Accepts a numeric ID, or a link containing it (teamID=123 / participantID=123 / /participants/123).
// Vanity names like "bossnation" are not IDs, so reject them loudly instead of silently dropping them.
function extractId(v, kind) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{1,10}$/.test(s)) return s;
  const q = s.match(new RegExp(kind + 'ID=(\\d{1,10})', 'i'));
  if (q) return q[1];
  const p = s.match(new RegExp('/' + kind + 's/(\\d{1,10})(?:[/?#]|$)', 'i'));
  if (p) return p[1];
  const e = new Error('The ' + kind + ' ID must be a number (or a link containing it). A name like "' + s.slice(0, 30) + '" is not an ID.');
  e.status = 400;
  throw e;
}

function isoOrEmpty(v) {
  if (v === '' || v == null) return '';
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Donation link shown on the arcade/ticker. Any URL or bare domain/path; no spaces or odd characters.
function cleanDonateUrl(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return '';
  if (t.length > 100 || !/^[\w.\-~:/?#\[\]@!$&'()*+,;=%]+$/.test(t)) {
    const e = new Error('The donation link can\'t contain spaces or unusual characters (max 100 characters).');
    e.status = 400;
    throw e;
  }
  return t;
}

function cleanChannel(v) {
  if (typeof v !== 'string') return '';
  const c = v.trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9_]{1,25}$/.test(c) ? c : '';
}

// Apply a partial update from the control panel, keeping only known, validated fields.
function applyPatch(cur, patch) {
  const s = JSON.parse(JSON.stringify(cur));
  patch = patch && typeof patch === 'object' ? patch : {};

  if (SCENES.includes(patch.scene)) s.scene = patch.scene;

  if (patch.rotation && typeof patch.rotation === 'object') {
    const r = patch.rotation;
    if ('enabled' in r) s.rotation.enabled = !!r.enabled;
    if ('seconds' in r) s.rotation.seconds = clamp(Number(r.seconds) || 20, 5, 300);
    if (Array.isArray(r.scenes)) s.rotation.scenes = [...new Set(r.scenes.filter((x) => SCENES.includes(x)))].slice(0, 12);
    s.rotation.startedAt = Date.now(); // restart the cycle whenever rotation settings change
  }

  if ('accent' in patch && /^#[0-9a-f]{6}$/i.test(patch.accent)) s.accent = patch.accent.toLowerCase();
  if ('participantId' in patch) s.participantId = extractId(patch.participantId, 'participant');
  if ('teamId' in patch) s.teamId = extractId(patch.teamId, 'team');
  if ('alerts' in patch) s.alerts = !!patch.alerts;
  if ('donateUrl' in patch) s.donateUrl = cleanDonateUrl(patch.donateUrl);

  if ('eventStart' in patch) { const v = isoOrEmpty(patch.eventStart); if (v !== null) s.eventStart = v; }
  if ('eventEnd' in patch) { const v = isoOrEmpty(patch.eventEnd); if (v !== null) s.eventEnd = v; }

  if (Array.isArray(patch.streamers)) {
    const seen = new Set();
    s.streamers = patch.streamers.map(cleanChannel).filter((c) => {
      const k = c.toLowerCase();
      if (!c || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 10);
  }
  if (patch.streamCycle && typeof patch.streamCycle === 'object') {
    const c = patch.streamCycle;
    if ('enabled' in c) s.streamCycle.enabled = !!c.enabled;
    if ('seconds' in c) s.streamCycle.seconds = clamp(Number(c.seconds) || 45, 10, 600);
  }
  if ('streamPinned' in patch || Array.isArray(patch.streamers)) {
    const c = cleanChannel('streamPinned' in patch ? patch.streamPinned : s.streamPinned);
    s.streamPinned = s.streamers.includes(c) ? c : '';
  }
  if ('messageTitle' in patch) s.messageTitle = str(patch.messageTitle, 60);
  if ('message' in patch) s.message = str(patch.message, 400);

  if (Array.isArray(patch.tickerMessages)) {
    s.tickerMessages = patch.tickerMessages.map((m) => str(m, 120)).filter(Boolean).slice(0, 10);
  }

  if (Array.isArray(patch.stretchGoals)) {
    s.stretchGoals = patch.stretchGoals
      .map((g) => ({ amount: clamp(Number(g && g.amount) || 0, 0, 10000000), label: str(g && g.label, 40) }))
      .filter((g) => g.amount > 0 && g.label)
      .slice(0, 8);
  }

  s.rev = (cur.rev || 0) + 1;
  s.updatedAt = Date.now();
  return s;
}

function testAlertPatch(cur, body) {
  const s = JSON.parse(JSON.stringify(cur));
  s.testAlert = {
    nonce: Date.now(),
    name: str(body.name, 40) || 'Test Donor',
    amount: clamp(Number(body.amount) || 25, 1, 100000),
    message: str(body.message, 200) || 'Great stream! Keep it up!',
  };
  s.rev = (cur.rev || 0) + 1;
  s.updatedAt = Date.now();
  return s;
}

// 'ok' | 'bad' | 'unconfigured'
function checkAuth(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return 'unconfigured';
  const given = String((req.headers && req.headers['x-admin-token']) || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b) ? 'ok' : 'bad';
}

module.exports = { loadState, saveState, applyPatch, testAlertPatch, checkAuth, SCENES, HAS_REDIS };
