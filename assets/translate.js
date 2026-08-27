/* ============================================================
   研习台 · 摘要翻译模块
   主通道：微软 Edge 免费翻译接口（免密钥、CORS 开放、国内可直连）
   备用通道：Google gtx（部分网络环境可用）
   译文按论文 id 缓存在 localStorage，同一篇只翻一次
   ============================================================ */
const Translator = (function () {
'use strict';

const AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const API_URL = 'https://api-edge.cognitive.microsofttranslator.com/translate?from=en&to=zh-Hans&api-version=3.0';
const CACHE_KEY = 'yanxitai.trans.v1';
const CACHE_MAX = 240;

/* ---------- token ---------- */
let token = null, tokenAt = 0;
async function getToken() {
  if (token && Date.now() - tokenAt < 8 * 60 * 1000) return token;
  const res = await withTimeout(fetch(AUTH_URL), 10000);
  if (!res.ok) throw new Error('auth ' + res.status);
  token = (await res.text()).trim();
  tokenAt = Date.now();
  return token;
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/* ---------- 缓存 ---------- */
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function writeCache(c) {
  try {
    const keys = Object.keys(c);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => (c[a].ts || 0) - (c[b].ts || 0))
        .slice(0, keys.length - CACHE_MAX).forEach(k => delete c[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch (e) { /* 空间不足则放弃缓存 */ }
}

/* ---------- 翻译通道 ---------- */
async function viaEdge(texts) {
  const tk = await getToken();
  const res = await withTimeout(fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify(texts.map(t => ({ Text: t })))
  }), 15000);
  if (!res.ok) throw new Error('edge ' + res.status);
  const json = await res.json();
  return json.map(x => (x.translations && x.translations[0] && x.translations[0].text) || '');
}

async function viaGoogle(texts) {
  const out = [];
  for (const t of texts) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(t);
    const res = await withTimeout(fetch(url), 12000);
    if (!res.ok) throw new Error('gtx ' + res.status);
    const json = await res.json();
    out.push((json[0] || []).map(seg => seg[0]).join(''));
  }
  return out;
}

async function translateBatch(texts) {
  try { return await viaEdge(texts); }
  catch (e) { return await viaGoogle(texts); }
}

/* ---------- 对外：翻译一篇论文（标题 + 摘要） ---------- */
const inflight = {};
async function paper(id, title, abstract) {
  const cache = readCache();
  if (cache[id] && cache[id].a) return cache[id];
  if (inflight[id]) return inflight[id];
  inflight[id] = (async () => {
    const [t, a] = await translateBatch([title || '', abstract || '']);
    const entry = { t, a, ts: Date.now() };
    const c = readCache(); c[id] = entry; writeCache(c);
    delete inflight[id];
    return entry;
  })();
  inflight[id].catch(() => { delete inflight[id]; });
  return inflight[id];
}

function cached(id) {
  const c = readCache();
  return (c[id] && c[id].a) ? c[id] : null;
}

return { paper, cached };
})();
