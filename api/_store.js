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
  title: 'EXTRA LIFE',
  accent: '#ffcb05',
  participantId: '',
  teamId: '',
  alerts: true,
  eventStart: '',
  eventEnd: '',
  streamChannel: '',
  messageTitle: '',
  message: '',
  stretchGoals: [],
  testAlert: { nonce: 0, name: '', amount: 0, message: '' },
  updatedAt: 0,
};

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
  const s = Object.assign({}, DEFAULTS, saved || {});
  s.rotation = Object.assign({}, DEFAULTS.rotation, (saved && saved.rotation) || {});
  s.testAlert = Object.assign({}, DEFAULTS.testAlert, (saved && saved.testAlert) || {});
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
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '').slice(0, 10);

function isoOrEmpty(v) {
  if (v === '' || v == null) return '';
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
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

  if ('title' in patch) s.title = str(patch.title, 40) || 'EXTRA LIFE';
  if ('accent' in patch && /^#[0-9a-f]{6}$/i.test(patch.accent)) s.accent = patch.accent.toLowerCase();
  if ('participantId' in patch) s.participantId = digits(patch.participantId);
  if ('teamId' in patch) s.teamId = digits(patch.teamId);
  if ('alerts' in patch) s.alerts = !!patch.alerts;

  if ('eventStart' in patch) { const v = isoOrEmpty(patch.eventStart); if (v !== null) s.eventStart = v; }
  if ('eventEnd' in patch) { const v = isoOrEmpty(patch.eventEnd); if (v !== null) s.eventEnd = v; }

  if ('streamChannel' in patch) s.streamChannel = cleanChannel(patch.streamChannel);
  if ('messageTitle' in patch) s.messageTitle = str(patch.messageTitle, 60);
  if ('message' in patch) s.message = str(patch.message, 400);

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
