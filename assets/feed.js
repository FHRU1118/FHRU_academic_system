/* ============================================================
   研习台 · 顶刊实时推荐（OpenAlex API）
   - 免费、免密钥、支持浏览器跨域直连（CORS）
   - 按 UTD24 / FT50 期刊 ISSN 过滤最近 45 天的新论文
   - 结果按「与技术经济与管理方向的相关度」打分排序
   - 每日结果缓存在 localStorage，当天只请求一次
   ============================================================ */
const Feed = (function () {
'use strict';

/* ---------- 期刊清单（ISSN → 名称 / 榜单） ---------- */
const JOURNALS = [
  // UTD24（多数同时属于 FT50）
  { issn: '0001-4273', name: 'Academy of Management Journal', lists: ['UTD24', 'FT50'] },
  { issn: '0363-7425', name: 'Academy of Management Review', lists: ['UTD24', 'FT50'] },
  { issn: '0001-8392', name: 'Administrative Science Quarterly', lists: ['UTD24', 'FT50'] },
  { issn: '1047-7047', name: 'Information Systems Research', lists: ['UTD24', 'FT50'] },
  { issn: '1091-9856', name: 'INFORMS Journal on Computing', lists: ['UTD24'] },
  { issn: '0165-4101', name: 'Journal of Accounting and Economics', lists: ['UTD24', 'FT50'] },
  { issn: '0021-8456', name: 'Journal of Accounting Research', lists: ['UTD24', 'FT50'] },
  { issn: '0001-4826', name: 'The Accounting Review', lists: ['UTD24', 'FT50'] },
  { issn: '0093-5301', name: 'Journal of Consumer Research', lists: ['UTD24', 'FT50'] },
  { issn: '0022-1082', name: 'The Journal of Finance', lists: ['UTD24', 'FT50'] },
  { issn: '0304-405X', name: 'Journal of Financial Economics', lists: ['UTD24', 'FT50'] },
  { issn: '0893-9454', name: 'Review of Financial Studies', lists: ['UTD24', 'FT50'] },
  { issn: '0047-2506', name: 'Journal of International Business Studies', lists: ['UTD24', 'FT50'] },
  { issn: '0022-2429', name: 'Journal of Marketing', lists: ['UTD24', 'FT50'] },
  { issn: '0022-2437', name: 'Journal of Marketing Research', lists: ['UTD24', 'FT50'] },
  { issn: '0732-2399', name: 'Marketing Science', lists: ['UTD24', 'FT50'] },
  { issn: '0025-1909', name: 'Management Science', lists: ['UTD24', 'FT50'] },
  { issn: '0276-7783', name: 'MIS Quarterly', lists: ['UTD24', 'FT50'] },
  { issn: '0030-364X', name: 'Operations Research', lists: ['UTD24', 'FT50'] },
  { issn: '0272-6963', name: 'Journal of Operations Management', lists: ['UTD24', 'FT50'] },
  { issn: '1523-4614', name: 'M&SOM', lists: ['UTD24', 'FT50'] },
  { issn: '1047-7039', name: 'Organization Science', lists: ['UTD24', 'FT50'] },
  { issn: '1059-1478', name: 'Production and Operations Management', lists: ['UTD24', 'FT50'] },
  { issn: '0143-2095', name: 'Strategic Management Journal', lists: ['UTD24', 'FT50'] },
  // FT50 其余
  { issn: '0002-8282', name: 'American Economic Review', lists: ['FT50'] },
  { issn: '0012-9682', name: 'Econometrica', lists: ['FT50'] },
  { issn: '0022-3808', name: 'Journal of Political Economy', lists: ['FT50'] },
  { issn: '0033-5533', name: 'The Quarterly Journal of Economics', lists: ['FT50'] },
  { issn: '0034-6527', name: 'The Review of Economic Studies', lists: ['FT50'] },
  { issn: '0361-3682', name: 'Accounting, Organizations and Society', lists: ['FT50'] },
  { issn: '0823-9150', name: 'Contemporary Accounting Research', lists: ['FT50'] },
  { issn: '1380-6653', name: 'Review of Accounting Studies', lists: ['FT50'] },
  { issn: '0022-1090', name: 'Journal of Financial and Quantitative Analysis', lists: ['FT50'] },
  { issn: '1572-3097', name: 'Review of Finance', lists: ['FT50'] },
  { issn: '1042-2587', name: 'Entrepreneurship Theory and Practice', lists: ['FT50'] },
  { issn: '0883-9026', name: 'Journal of Business Venturing', lists: ['FT50'] },
  { issn: '1932-4391', name: 'Strategic Entrepreneurship Journal', lists: ['FT50'] },
  { issn: '0149-2063', name: 'Journal of Management', lists: ['FT50'] },
  { issn: '0022-2380', name: 'Journal of Management Studies', lists: ['FT50'] },
  { issn: '0742-1222', name: 'Journal of Management Information Systems', lists: ['FT50'] },
  { issn: '0018-7267', name: 'Human Relations', lists: ['FT50'] },
  { issn: '0090-4848', name: 'Human Resource Management', lists: ['FT50'] },
  { issn: '0021-9010', name: 'Journal of Applied Psychology', lists: ['FT50'] },
  { issn: '0749-5978', name: 'Organizational Behavior and Human Decision Processes', lists: ['FT50'] },
  { issn: '0170-8406', name: 'Organization Studies', lists: ['FT50'] },
  { issn: '0167-4544', name: 'Journal of Business Ethics', lists: ['FT50'] },
  { issn: '1057-7408', name: 'Journal of Consumer Psychology', lists: ['FT50'] },
  { issn: '0092-0703', name: 'Journal of the Academy of Marketing Science', lists: ['FT50'] },
  { issn: '0048-7333', name: 'Research Policy', lists: ['FT50'] }
];
const ISSN_MAP = {};
JOURNALS.forEach(j => { ISSN_MAP[j.issn] = j; });

/* ---------- 方向相关度：主题词典 ---------- */
const TOPIC_RULES = [
  { re: /digital transformation|digitali[sz]ation|digital technolog/i, label: '数字化转型', w: 5 },
  { re: /artificial intelligence|machine learning|deep learning|generative ai|large language|\bllms?\b|\balgorithm(ic)?\b/i, label: 'AI 与智能技术', w: 5 },
  { re: /\binnovat/i, label: '创新', w: 4 },
  { re: /r&d|research and development/i, label: '研发投入', w: 4 },
  { re: /\bpatent/i, label: '专利', w: 4 },
  { re: /technolog(y|ical) (adoption|change|transfer|spillover)|technology-/i, label: '技术变迁与采纳', w: 4 },
  { re: /\bplatforms?\b|two-sided market|gig econom/i, label: '平台经济', w: 3 },
  { re: /\bautomation\b|\brobots?\b/i, label: '自动化与就业', w: 4 },
  { re: /\bproductivit/i, label: '生产率', w: 3 },
  { re: /supply chain|inventory|procurement/i, label: '供应链与运营', w: 2 },
  { re: /entrepreneur|start-?up|venture capital/i, label: '创业与风投', w: 2 },
  { re: /knowledge (transfer|spillover|creation|sharing)|absorptive capacity/i, label: '知识管理', w: 3 },
  { re: /sustainab|green|carbon|climate|\besg\b|renewable/i, label: '绿色与可持续', w: 2 },
  { re: /\btechnolog/i, label: '技术管理', w: 2 },
  { re: /data analytics|big data|\bdata-driven\b/i, label: '数据要素', w: 3 },
  { re: /intellectual property|licensing/i, label: '知识产权', w: 3 },
  { re: /alliance|open innovation|crowdsourc/i, label: '开放式创新与联盟', w: 3 }
];

/* ---------- 方法信号词典 ---------- */
const METHOD_RULES = [
  { re: /difference-in-differences|\bdid\b design|diff-in-diff/i, label: '双重差分' },
  { re: /instrumental variable|\b2sls\b|\biv\b estimat/i, label: '工具变量' },
  { re: /regression discontinuity/i, label: '断点回归' },
  { re: /field experiment/i, label: '田野实验' },
  { re: /laboratory experiment|lab experiment|randomi[sz]ed|\bexperiments?\b/i, label: '实验研究' },
  { re: /\bsurveys?\b|questionnaire/i, label: '问卷调查' },
  { re: /case stud|qualitative|interviews|grounded theory|ethnograph/i, label: '案例与质性' },
  { re: /panel data|fixed effects|longitudinal/i, label: '面板数据' },
  { re: /machine learning|text (analysis|mining)|natural language processing|topic model/i, label: '机器学习/文本分析' },
  { re: /game(-| )theor|analytical model|we (develop|build|propose) a model|equilibrium/i, label: '理论建模' },
  { re: /meta-anal/i, label: '元分析' },
  { re: /structural equation|\bsem\b/i, label: '结构方程' },
  { re: /event stud/i, label: '事件研究' },
  { re: /simulation|agent-based/i, label: '仿真' }
];

/* ---------- 工具 ---------- */
function rebuildAbstract(inv) {
  if (!inv) return '';
  const arr = [];
  Object.keys(inv).forEach(w => inv[w].forEach(pos => { arr[pos] = w; }));
  return arr.join(' ').replace(/\s+/g, ' ').trim();
}

function analyze(work) {
  const text = (work.title || '') + ' ' + (work._abs || '');
  const topics = [], methods = [];
  let score = 0;
  TOPIC_RULES.forEach(r => { if (r.re.test(text)) { topics.push(r.label); score += r.w; } });
  METHOD_RULES.forEach(r => { if (r.re.test(text)) methods.push(r.label); });
  return { topics: [...new Set(topics)].slice(0, 4), methods: methods.slice(0, 3), score };
}

function relText(topics, journal) {
  if (topics.length) {
    return `自动识别到与你方向相关的主题：${topics.join('、')}。属于技术经济与管理的核心议题簇，建议重点看它的变量测量、识别策略与数据来源，评估能否迁移到中国情境或你的选题。`;
  }
  return `与技术经济与管理方向的直接关联较弱，可作为 ${journal} 最新研究设计的范例泛读，关注其问题提出与论证结构。`;
}

/* ---------- 抓取 ---------- */
const CACHE_KEY = 'yanxitai.feed.v1';
const API = 'https://api.openalex.org/works';
const DAYS_BACK = 45;

function readCache(today) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.date === today && Array.isArray(c.pool) && c.pool.length) return c.pool;
  } catch (e) { /* ignore */ }
  return null;
}
function writeCache(today, pool) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, fetchedAt: new Date().toISOString(), pool })); }
  catch (e) { /* 空间不足时放弃缓存 */ }
}
function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

async function fetchLatest(today, force) {
  if (!force) {
    const cached = readCache(today);
    if (cached) return { pool: cached, fromCache: true };
  }
  const from = new Date(Date.now() - DAYS_BACK * 86400000);
  const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  const issns = JOURNALS.map(j => j.issn).join('|');
  const url = API + '?filter=' + encodeURIComponent(
      `primary_location.source.issn:${issns},from_publication_date:${fromStr},type:article,has_abstract:true`)
    + '&sort=publication_date:desc&per-page=100'
    + '&select=id,doi,title,publication_date,authorships,primary_location,abstract_inverted_index,cited_by_count';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let json;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    json = await res.json();
  } finally { clearTimeout(timer); }

  const pool = (json.results || []).map(w => {
    const src = (w.primary_location && w.primary_location.source) || {};
    const issnHit = (src.issn || []).concat(src.issn_l || []).find(i => ISSN_MAP[i]);
    const jinfo = ISSN_MAP[issnHit] || { name: src.display_name || '—', lists: [] };
    const authors = (w.authorships || []).map(a => (a.author && a.author.display_name) || '').filter(Boolean);
    const abs = rebuildAbstract(w.abstract_inverted_index);
    w._abs = abs;
    const { topics, methods, score } = analyze(w);
    return {
      id: w.id, doi: w.doi || '',
      title: w.title || '(untitled)',
      journal: jinfo.name, lists: jinfo.lists,
      date: w.publication_date || '',
      authors: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' 等' : ''),
      abstract: abs.length > 1100 ? abs.slice(0, 1100) + '…' : abs,
      cited: w.cited_by_count || 0,
      topics, methods,
      rel: relText(topics, jinfo.name),
      // 相关度优先、同分按日期新旧
      score: score * 1000 + (w.publication_date ? Number(w.publication_date.replace(/-/g, '')) % 1000 : 0)
    };
  }).filter(p => p.abstract.length > 80);

  pool.sort((a, b) => b.score - a.score);
  const top = pool.slice(0, 30);
  if (top.length) writeCache(today, top);
  return { pool: top, fromCache: false };
}

return { fetchLatest, clearCache, JOURNALS };
})();
