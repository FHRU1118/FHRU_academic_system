/* ============================================================
   研习台 · 应用逻辑
   数据全部保存在浏览器 localStorage
   ============================================================ */
(function () {
'use strict';

/* ---------------- 基础工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '¥' + (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function dayDiff(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }
function weekRange(base) {
  const d = new Date(base); const wd = (d.getDay() + 6) % 7;
  const s = new Date(d); s.setDate(d.getDate() - wd);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return [ymd(s), ymd(e)];
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

const ICON = {
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14.5 5.5 18.5 9.5"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 6"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  arch: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M4 10h10a5 5 0 0 1 0 10H8"/><path d="m4 10 4-4M4 10l4 4"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9L9.6 9z"/></svg>'
};

/* ---------------- 数据层 ---------------- */
const KEY = 'yanxitai.v1';
const DEFAULT_STATE = {
  version: 1,
  savedAt: 0,
  settings: { theme: 'light', paperShift: 0, nick: '', feedMode: 'live', binId: '', apiKey: '' },
  tasks: [],
  inbox: [],
  library: [],
  projects: [],
  sports: [],
  books: [],
  movies: [],
  trips: [],
  ledger: []
};
const CAT_OUT = ['餐饮', '交通', '住房', '学习科研', '购物', '医疗', '娱乐', '人情往来', '通讯', '其他'];
const CAT_IN = ['奖学金', '助研津贴', '兼职收入', '家庭支持', '投资理财', '报销回款', '其他'];
const STAGES = ['选题构思', '文献综述', '数据收集', '模型/实证', '初稿撰写', '修改润色', '投稿送审', '返修中', '结项验收'];

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const o = JSON.parse(raw);
    return normalize(Object.assign(structuredClone(DEFAULT_STATE), o, {
      settings: Object.assign({}, DEFAULT_STATE.settings, o.settings || {})
    }));
  } catch (e) { return structuredClone(DEFAULT_STATE); }
}
function normalize(st) {
  ['tasks', 'inbox', 'library', 'projects', 'sports', 'books', 'movies', 'trips', 'ledger']
    .forEach(k => { if (!Array.isArray(st[k])) st[k] = []; });
  st.ledger.forEach(r => { r.amount = Number(r.amount) || 0; r.date = r.date || todayStr(); });
  st.sports.forEach(r => { r.minutes = Number(r.minutes) || 0; });
  st.projects.forEach(p => { p.progress = Number(p.progress) || 0; });
  return st;
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    S.savedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('本地存储写入失败，可能空间已满'); }
    if (window.Sync && Sync.enabled()) Sync.save(S);
  }, 60);
}

// 用云端状态覆盖本地（保留云端同步凭据，避免被旧空值覆盖）
function adoptCloud(cloud) {
  S = normalize(Object.assign(structuredClone(DEFAULT_STATE), cloud, {
    settings: Object.assign({}, DEFAULT_STATE.settings, cloud.settings || {})
  }));
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  renderAll();
}

// 同步状态徽标
function updateSyncBadge(status, detail) {
  const b = $('#syncBadge'); if (!b) return;
  const map = {
    off: ['未同步', 'sync--off'],
    syncing: ['同步中', 'sync--busy'],
    ok: ['已同步', 'sync--ok'],
    error: ['同步异常', 'sync--err']
  };
  const [txt, cls] = map[status] || ['', ''];
  b.className = 'sync-badge ' + cls;
  b.textContent = txt;
  b.title = detail || txt;
}

/* ---------------- 提示 ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------------- 主题 ---------------- */
function applyTheme() {
  document.documentElement.dataset.theme = S.settings.theme;
  const c = S.settings.theme === 'dark' ? '#181715' : '#F5F2EC';
  let m = document.querySelector('meta[name=theme-color]'); if (m) m.content = c;
}
function toggleTheme() {
  S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark';
  applyTheme(); save(); toast(S.settings.theme === 'dark' ? '已切换深色' : '已切换浅色');
}

/* ---------------- 弹窗 ---------------- */
function openModal(title, bodyNode, footNodes) {
  $('#modalTitle').textContent = title;
  const body = $('#modalBody'); body.innerHTML = '';
  if (typeof bodyNode === 'string') body.innerHTML = bodyNode; else body.appendChild(bodyNode);
  const foot = $('#modalFoot'); foot.innerHTML = '';
  (footNodes || []).forEach(n => foot.appendChild(n));
  $('#modalMask').classList.add('show');
}
function closeModal() { $('#modalMask').classList.remove('show'); }

function btn(text, cls, fn) { const b = el(`<button class="soft-btn ${cls || ''}">${esc(text)}</button>`); b.onclick = fn; return b; }

/**
 * 通用表单弹窗
 * fields: [{k,label,type,options,ph,rows,full,min,max,step}]
 */
function openForm(title, fields, values, onSubmit) {
  const form = el('<form></form>');
  fields.forEach(f => {
    const v = values && values[f.k] != null ? values[f.k] : (f.def != null ? f.def : '');
    let input;
    if (f.type === 'textarea') input = `<textarea name="${f.k}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
    else if (f.type === 'select') input = `<select name="${f.k}">${f.options.map(o => {
      const val = typeof o === 'string' ? o : o.v, lab = typeof o === 'string' ? o : o.l;
      return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`;
    }).join('')}</select>`;
    else input = `<input name="${f.k}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''} />`;
    form.appendChild(el(`<div class="field"><label>${esc(f.label)}</label>${input}${f.hint ? `<div class="field-hint">${esc(f.hint)}</div>` : ''}</div>`));
  });
  form.addEventListener('submit', e => e.preventDefault());
  const ok = btn('保存', 'soft-btn--solid', () => {
    const data = {};
    fields.forEach(f => { data[f.k] = form.elements[f.k].value.trim(); });
    if (onSubmit(data) !== false) closeModal();
  });
  openModal(title, form, [btn('取消', 'soft-btn--quiet', closeModal), ok]);
  setTimeout(() => { const first = form.querySelector('input,textarea,select'); if (first) first.focus(); }, 120);
}

function confirmDel(text, fn) {
  openModal('确认删除', `<p class="help-block">${esc(text)}<br/>删除后不可恢复。</p>`, [
    btn('取消', 'soft-btn--quiet', closeModal),
    btn('删除', 'soft-btn--danger', () => { fn(); closeModal(); })
  ]);
}

/* ---------------- 导航 ---------------- */
const PAGE_TITLE = { home: '今天', research: '科研', life: '生活', review: '回顾' };
let currentPage = 'home';
function go(page) {
  currentPage = page;
  $$('.page').forEach(p => p.classList.toggle('is-active', p.id === 'page-' + page));
  $$('[data-nav]').forEach(b => b.classList.toggle('is-active', b.dataset.nav === page));
  $('#topTitle').textContent = PAGE_TITLE[page];
  $('#scrollArea').scrollTop = 0;
  renderAll();
}

/* ============================================================
   首页
   ============================================================ */
let taskFilter = 'today';

function taskInRange(t) {
  const today = todayStr();
  if (taskFilter === 'all') return true;
  if (!t.date) return taskFilter === 'all';
  if (taskFilter === 'today') return t.date === today;
  const [s, e] = weekRange(new Date());
  return t.date >= s && t.date <= e;
}

function renderHome() {
  const today = todayStr();
  const todays = S.tasks.filter(t => t.date === today);
  const done = todays.filter(t => t.done).length;
  const total = todays.length;
  const undone = total - done;
  const rate = total ? Math.round(done / total * 100) : 0;
  const overdue = S.tasks.filter(t => !t.done && t.date && t.date < today).length;

  $('#statTodo').textContent = total;
  $('#statTodoSub').textContent = total ? '今日安排' : '今天很空';
  $('#statDone').textContent = done;
  $('#statUndone').textContent = undone;
  $('#statOverdue').textContent = overdue ? `另有 ${overdue} 项逾期` : '无逾期';
  $('#statRate').textContent = rate + '%';
  $('#ringFg').style.strokeDashoffset = String(113 - 113 * rate / 100);

  /* 日历事件 */
  const evts = S.tasks.filter(t => t.source === 'ics' && t.date >= today)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 6);
  $('#calStatus').textContent = S.tasks.some(t => t.source === 'ics') ? '已导入' : '未连接';
  const ce = $('#calEvents');
  ce.innerHTML = evts.length ? '' : '<div class="empty">尚未导入日历事件</div>';
  evts.forEach(e => {
    const dd = dayDiff(e.date, today);
    const label = dd === 0 ? '今天' : dd === 1 ? '明天' : e.date.slice(5);
    ce.appendChild(el(`<div class="cal-event"><i></i><div style="flex:1;min-width:0"><div>${esc(e.title)}</div><div class="t">${label} ${esc(e.time || '全天')}</div></div></div>`));
  });

  /* 任务列表 */
  const list = $('#taskList');
  const items = S.tasks.filter(taskInRange)
    .sort((a, b) => (a.done - b.done) || (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));
  list.innerHTML = items.length ? '' : `<div class="empty">${taskFilter === 'today' ? '今天还没有任务，点右下角加一条' : '暂无任务'}</div>`;
  items.forEach(t => list.appendChild(taskRow(t, today)));

  /* 临近截止 */
  const dl = $('#deadlineList');
  const soon = S.projects.filter(p => p.status !== 'archived' && p.deadline)
    .map(p => ({ p, d: dayDiff(p.deadline, today) }))
    .filter(x => x.d <= 45).sort((a, b) => a.d - b.d).slice(0, 5);
  dl.innerHTML = soon.length ? '' : '<div class="empty">近期没有截止事项</div>';
  soon.forEach(({ p, d }) => {
    const tag = d < 0 ? `已逾期 ${-d} 天` : d === 0 ? '今天截止' : `还剩 ${d} 天`;
    dl.appendChild(el(`<div class="row"><div class="row-main"><div class="row-title">${esc(p.title)}</div>
      <div class="row-meta"><span class="chip-tag">${esc(p.stage || '进行中')}</span><span class="due" style="${d <= 3 ? 'color:var(--clay)' : ''}">${tag}</span><span>${p.progress || 0}%</span></div></div></div>`));
  });

  /* 收集箱 */
  const ib = $('#inboxList');
  $('#inboxCount').textContent = S.inbox.length + ' 条';
  const recent = S.inbox.slice(0, 4);
  ib.innerHTML = recent.length ? '' : '<div class="empty">灵感为空，点右下角悬浮按钮记录</div>';
  recent.forEach(n => ib.appendChild(inboxRow(n)));
}

function taskRow(t, today) {
  const overdue = !t.done && t.date && t.date < today;
  const r = el(`<div class="row ${t.done ? 'done' : ''} ${overdue ? 'overdue' : ''}">
    <div class="tick">${ICON.check}</div>
    <div class="row-main">
      <div class="row-title">${esc(t.title)}</div>
      <div class="row-meta">
        ${t.tag ? `<span class="chip-tag">${esc(t.tag)}</span>` : ''}
        ${t.source === 'ics' ? '<span class="chip-tag">日历</span>' : ''}
        <span class="due">${esc(t.date || '未排期')}${t.time ? ' ' + esc(t.time) : ''}</span>
        ${t.note ? `<span>${esc(t.note)}</span>` : ''}
      </div>
    </div>
    <div class="row-actions">
      <button class="mini-icon ed" title="编辑">${ICON.edit}</button>
      <button class="mini-icon del" title="删除">${ICON.del}</button>
    </div>
  </div>`);
  r.querySelector('.tick').onclick = () => { t.done = !t.done; t.doneAt = t.done ? new Date().toISOString() : null; save(); renderAll(); };
  r.querySelector('.ed').onclick = () => editTask(t);
  r.querySelector('.del').onclick = () => confirmDel(`任务「${t.title}」`, () => { S.tasks = S.tasks.filter(x => x.id !== t.id); save(); renderAll(); });
  return r;
}

function inboxRow(n) {
  const r = el(`<div class="row">
    <div class="row-main">
      <div class="row-title" style="font-weight:400">${esc(n.text)}</div>
      <div class="row-meta"><span class="chip-tag">${esc(n.tag || '灵感')}</span><span>${esc((n.createdAt || '').slice(0, 16).replace('T', ' '))}</span></div>
    </div>
    <div class="row-actions">
      <button class="mini-icon up" title="转为任务">${ICON.cal}</button>
      <button class="mini-icon del" title="删除">${ICON.del}</button>
    </div>
  </div>`);
  r.querySelector('.up').onclick = () => {
    S.tasks.push({ id: uid(), title: n.text.slice(0, 60), date: todayStr(), done: false, tag: n.tag, note: '' });
    S.inbox = S.inbox.filter(x => x.id !== n.id); save(); renderAll(); toast('已转为今日任务');
  };
  r.querySelector('.del').onclick = () => { S.inbox = S.inbox.filter(x => x.id !== n.id); save(); renderAll(); };
  return r;
}

function editTask(t) {
  const isNew = !t;
  const v = t || { title: '', date: todayStr(), time: '', tag: '', note: '' };
  openForm(isNew ? '新增任务' : '编辑任务', [
    { k: 'title', label: '任务内容', ph: '例：完成第三章数据清洗' },
    { k: 'date', label: '日期', type: 'date' },
    { k: 'time', label: '时间（可选）', type: 'time' },
    { k: 'tag', label: '标签', type: 'select', options: ['', '科研', '课程', '生活', '会议', '阅读', '其他'] },
    { k: 'note', label: '备注', type: 'textarea', rows: 2 }
  ], v, d => {
    if (!d.title) { toast('请填写任务内容'); return false; }
    if (isNew) S.tasks.push({ id: uid(), done: false, ...d });
    else Object.assign(t, d);
    save(); renderAll(); toast(isNew ? '已添加' : '已更新');
  });
}

/* ---------------- ICS 解析 ---------------- */
function parseICS(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const unfolded = [];
  lines.forEach(l => {
    if (/^[ \t]/.test(l) && unfolded.length) unfolded[unfolded.length - 1] += l.slice(1);
    else unfolded.push(l);
  });
  const events = []; let cur = null;
  unfolded.forEach(line => {
    if (line.startsWith('BEGIN:VEVENT')) { cur = {}; return; }
    if (line.startsWith('END:VEVENT')) { if (cur && cur.title) events.push(cur); cur = null; return; }
    if (!cur) return;
    const i = line.indexOf(':'); if (i < 0) return;
    const rawKey = line.slice(0, i), val = line.slice(i + 1);
    const key = rawKey.split(';')[0].toUpperCase();
    const unescape = s => s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    if (key === 'SUMMARY') cur.title = unescape(val);
    else if (key === 'UID') cur.uid = val;
    else if (key === 'LOCATION') cur.loc = unescape(val);
    else if (key === 'DTSTART') {
      const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
      if (m) {
        if (m[4]) {
          let d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
                       : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
          cur.date = ymd(d); cur.time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else { cur.date = `${m[1]}-${m[2]}-${m[3]}`; cur.time = ''; }
      }
    }
  });
  return events;
}

function importICS(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let evts;
    try { evts = parseICS(String(fr.result)); }
    catch (e) { toast('文件解析失败'); return; }
    if (!evts.length) { toast('未在文件中找到日程'); return; }
    const today = todayStr();
    const limit = ymd(new Date(Date.now() + 120 * 86400000));
    const exist = new Set(S.tasks.filter(t => t.icsUid).map(t => t.icsUid));
    let n = 0;
    evts.forEach(e => {
      if (!e.date || e.date < today || e.date > limit) return;
      const key = (e.uid || '') + e.date + e.title;
      if (exist.has(key)) return;
      exist.add(key);
      S.tasks.push({ id: uid(), title: e.title, date: e.date, time: e.time || '', done: false, tag: '', note: e.loc || '', source: 'ics', icsUid: key });
      n++;
    });
    save(); renderAll();
    toast(n ? `已导入 ${n} 条日程` : '没有新的日程可导入');
  };
  fr.readAsText(file, 'utf-8');
}

function calHelp() {
  openModal('把 iPhone 日历接进来', `<div class="help-block">
    <p>浏览器出于隐私限制无法直接读取苹果日历，用下面任一方式一次性导入即可，导入后的日程会进入任务列表并计入完成率。</p>
    <p><b>方式一 · iPhone 快捷指令（推荐）</b></p>
    <ol>
      <li>打开「快捷指令」→ 新建一个快捷指令；</li>
      <li>添加动作「查找日历事件」，筛选条件设为<code>开始日期 · 在接下来 30 天内</code>；</li>
      <li>添加动作「文本」，内容选中上一步结果；再添加「存储到文件」，文件名以 <code>.ics</code> 结尾；</li>
      <li>运行后在本页点「导入 .ics 日历文件」选择该文件。</li>
    </ol>
    <p><b>方式二 · Mac / iCloud 导出</b></p>
    <ol>
      <li>Mac 上打开「日历」App，选中日历 → 菜单栏「文件 → 导出 → 导出…」；</li>
      <li>得到 <code>.ics</code> 文件后在本页导入。</li>
    </ol>
    <p><b>方式三 · 手动添加</b>：直接用任务卡片的「＋ 新增」录入，同样支持日期与时间。</p>
    <p style="color:var(--text-3)">提示：重复导入不会产生重复条目；只导入今天起 120 天内的日程。</p>
  </div>`, [btn('知道了', 'soft-btn--solid', closeModal)]);
}

/* ============================================================
   科研页
   ============================================================ */
function dailyPapers() {
  const N = PAPER_SEEDS.length;
  const dayNum = Math.floor(new Date(todayStr()).getTime() / 86400000);
  const base = (dayNum * 2 + (S.settings.paperShift || 0) * 2) % N;
  return [PAPER_SEEDS[base % N], PAPER_SEEDS[(base + 1) % N]];
}

function paperCard(p, idx) {
  const badges = (p.lists || []).map(l => `<span class="badge badge--${l === 'UTD24' ? 'utd' : 'ft'}">${l}</span>`).join('')
    + `<span class="badge">${esc(p.field)}</span>`;
  const c = el(`<article class="paper">
    <div class="paper-top">
      <div class="paper-badges">${badges}</div>
      <div class="paper-title">${esc(p.t)}</div>
      <div class="paper-title-en">${esc(p.en)}</div>
      <div class="paper-src">${esc(p.a)} · <b>${esc(p.j)}</b> · ${p.y}</div>
      <div class="paper-toggle">展开全文要点 ↓</div>
    </div>
    <div class="paper-body">
      <div class="paper-sec"><h4>摘要</h4><p>${esc(p.ab)}</p></div>
      <div class="paper-sec"><h4>关键结论</h4><ul>${p.kf.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>
      <div class="paper-sec"><h4>研究方法</h4><p>${esc(p.me)}</p></div>
      <div class="paper-sec"><h4>理论框架与贡献</h4><p>${esc(p.th)}</p></div>
      <div class="paper-sec paper-sec--rel"><h4>与你的方向（技术经济与管理）</h4><p>${esc(p.rel)}</p></div>
      <div class="paper-foot">
        <button class="soft-btn fav">＋ 收入文献库</button>
        <a class="soft-btn soft-btn--quiet" target="_blank" rel="noopener"
           href="https://scholar.google.com/scholar?q=${encodeURIComponent(p.en)}">学术检索</a>
        <button class="soft-btn soft-btn--quiet note">写读书笔记</button>
      </div>
    </div>
  </article>`);
  const top = c.querySelector('.paper-top');
  top.onclick = () => {
    c.classList.toggle('open');
    c.querySelector('.paper-toggle').textContent = c.classList.contains('open') ? '收起 ↑' : '展开全文要点 ↓';
  };
  c.querySelector('.fav').onclick = e => { e.stopPropagation(); addToLibrary(p); };
  c.querySelector('.note').onclick = e => { e.stopPropagation(); addToLibrary(p, true); };
  return c;
}

function addToLibrary(p, withNote) {
  let item = S.library.find(x => x.en === p.en);
  if (!item) {
    item = { id: uid(), t: p.t, en: p.en, a: p.a, j: p.j, y: p.y, note: '', addedAt: todayStr() };
    S.library.unshift(item); save(); renderAll(); toast('已收入文献库');
  } else if (!withNote) { toast('文献库中已有这篇'); }
  if (withNote) editLibNote(item);
}

function editLibNote(item) {
  openForm('读书笔记 · ' + item.t.slice(0, 18), [
    { k: 'note', label: '笔记 / 可借鉴之处', type: 'textarea', rows: 6, ph: '这篇对我的选题有什么用？变量怎么测？方法能不能搬？' }
  ], item, d => { item.note = d.note; save(); renderAll(); toast('笔记已保存'); });
}

/* ---- 实时推荐（OpenAlex） ---- */
let feedPool = null, feedLoading = false, feedError = false;

function livePaperCard(p) {
  const badges = (p.lists || []).map(l => `<span class="badge badge--${l === 'UTD24' ? 'utd' : 'ft'}">${l}</span>`).join('')
    + (p.topics || []).slice(0, 2).map(t => `<span class="badge">${esc(t)}</span>`).join('');
  const tr = Translator.cached(p.id);
  const c = el(`<article class="paper">
    <div class="paper-top">
      <div class="paper-badges">${badges}</div>
      <div class="paper-title">${esc(p.title)}</div>
      <div class="paper-title-en zh-title" style="font-style:normal">${tr ? esc(tr.t) : ''}</div>
      <div class="paper-src">${esc(p.authors || '—')} · <b>${esc(p.journal)}</b> · ${esc(p.date)}</div>
      <div class="paper-toggle">展开摘要与解析 ↓</div>
    </div>
    <div class="paper-body">
      <div class="paper-sec"><h4>摘要（中文）</h4><p class="zh-abs" style="${tr ? '' : 'color:var(--text-3)'}">${tr ? esc(tr.a) : '翻译中…'}</p></div>
      <div class="paper-sec"><h4>摘要（原文）</h4><p>${esc(p.abstract)}</p></div>
      ${p.methods && p.methods.length ? `<div class="paper-sec"><h4>方法信号</h4><p>${p.methods.map(m => `<span class="chip-tag" style="margin-right:6px">${esc(m)}</span>`).join('')}</p></div>` : ''}
      <div class="paper-sec paper-sec--rel"><h4>与你的方向（技术经济与管理）</h4><p>${esc(p.rel)}</p></div>
      <div class="paper-foot">
        <button class="soft-btn fav">＋ 收入文献库</button>
        ${p.doi ? `<a class="soft-btn soft-btn--quiet" target="_blank" rel="noopener" href="${esc(p.doi)}">原文 DOI</a>` : ''}
        <a class="soft-btn soft-btn--quiet" target="_blank" rel="noopener"
           href="https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}">学术检索</a>
      </div>
    </div>
  </article>`);
  const top = c.querySelector('.paper-top');
  top.onclick = () => {
    c.classList.toggle('open');
    c.querySelector('.paper-toggle').textContent = c.classList.contains('open') ? '收起 ↑' : '展开摘要与解析 ↓';
  };
  c.querySelector('.fav').onclick = e => {
    e.stopPropagation();
    if (S.library.some(x => x.en === p.title)) { toast('文献库中已有这篇'); return; }
    const trc = Translator.cached(p.id);
    S.library.unshift({ id: uid(), t: (trc && trc.t) || p.title, en: p.title, a: p.authors, j: p.journal, y: (p.date || '').slice(0, 4), note: '', addedAt: todayStr() });
    save(); renderAll(); toast('已收入文献库');
  };
  if (!tr) hydrateTranslation(p, c);
  return c;
}

function hydrateTranslation(p, card) {
  Translator.paper(p.id, p.title, p.abstract).then(tr => {
    if (!card.isConnected) return;
    const zt = card.querySelector('.zh-title');
    const za = card.querySelector('.zh-abs');
    if (zt) zt.textContent = tr.t;
    if (za) { za.textContent = tr.a; za.style.color = ''; }
  }).catch(() => {
    const za = card.querySelector('.zh-abs');
    if (za && card.isConnected) {
      za.innerHTML = '翻译暂不可用（网络原因），请阅读下方原文，或 <button class="ghost-btn" style="color:var(--accent)">重试</button>';
      za.querySelector('button').onclick = () => {
        za.textContent = '翻译中…';
        hydrateTranslation(p, card);
      };
    }
  });
}

function pickLivePair() {
  if (!feedPool || !feedPool.length) return [];
  const pairs = Math.max(1, Math.floor(feedPool.length / 2));
  const dayNum = Math.floor(new Date(todayStr()).getTime() / 86400000);
  const idx = ((dayNum + (S.settings.paperShift || 0)) % pairs + pairs) % pairs;
  return feedPool.slice(idx * 2, idx * 2 + 2);
}

function renderPaperDaily() {
  const wrap = $('#paperDaily');
  const mode = S.settings.feedMode || 'live';
  $$('#paperMode button').forEach(b => b.classList.toggle('is-active', b.dataset.pm === mode));
  $('#paperRefresh').style.display = mode === 'live' ? '' : 'none';

  if (mode === 'seed') {
    wrap.innerHTML = '';
    $('#paperDate').textContent = todayStr().slice(5) + ' · 经典库';
    dailyPapers().forEach(p => wrap.appendChild(paperCard(p)));
    return;
  }
  /* live 模式 */
  if (feedPool) {
    wrap.innerHTML = '';
    $('#paperDate').textContent = todayStr().slice(5) + ' · 实时';
    const pair = pickLivePair();
    if (!pair.length) { wrap.innerHTML = '<div class="empty">近 45 天暂无可推荐的新论文</div>'; return; }
    pair.forEach(p => wrap.appendChild(livePaperCard(p)));
    return;
  }
  if (feedError) {
    wrap.innerHTML = `<div class="empty">实时获取失败（可能是网络问题）<br/><br/>
      <button class="soft-btn" id="feedRetry">重试</button>
      <button class="soft-btn soft-btn--quiet" id="feedFallback">改用经典库</button></div>`;
    $('#feedRetry').onclick = () => loadFeed(true);
    $('#feedFallback').onclick = () => { S.settings.feedMode = 'seed'; save(); renderPaperDaily(); };
    return;
  }
  wrap.innerHTML = '<div class="empty">正在从 OpenAlex 拉取 UTD24 / FT50 最新论文…</div>';
  $('#paperDate').textContent = '加载中';
  loadFeed(false);
}

function loadFeed(force) {
  if (feedLoading) return;
  feedLoading = true; feedError = false;
  if (force) { Feed.clearCache(); feedPool = null; renderPaperDaily(); }
  Feed.fetchLatest(todayStr(), !!force).then(r => {
    feedPool = r.pool;
    feedLoading = false;
    if (currentPage === 'research') renderPaperDaily();
    if (!r.fromCache) toast(`已获取 ${r.pool.length} 篇近期顶刊论文`);
  }).catch(() => {
    feedLoading = false; feedError = true;
    if (currentPage === 'research') renderPaperDaily();
  });
}

function renderResearch() {
  /* 每日推荐 */
  renderPaperDaily();

  /* 文献库 */
  const lib = $('#libList'); $('#libCount').textContent = S.library.length + ' 篇';
  lib.innerHTML = S.library.length ? '' : '<div class="empty">还没有收藏文献，点推荐卡片的「收入文献库」</div>';
  S.library.forEach(it => {
    const r = el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(it.t)}</div>
      <div class="row-meta"><span>${esc(it.j)} · ${it.y}</span><span>${esc(it.a)}</span></div>
      ${it.note ? `<div class="row-meta" style="color:var(--text-2);margin-top:5px">📝 ${esc(it.note)}</div>` : ''}
    </div><div class="row-actions">
      <button class="mini-icon ed" title="笔记">${ICON.edit}</button>
      <button class="mini-icon del" title="移除">${ICON.del}</button>
    </div></div>`);
    r.querySelector('.ed').onclick = () => editLibNote(it);
    r.querySelector('.del').onclick = () => confirmDel(`文献「${it.t}」`, () => { S.library = S.library.filter(x => x.id !== it.id); save(); renderAll(); });
    lib.appendChild(r);
  });

  /* 项目看板 */
  const pw = $('#projList'); pw.innerHTML = '';
  const active = S.projects.filter(p => p.status !== 'archived' && (projFilter === 'all' || p.type === projFilter));
  if (!active.length) pw.innerHTML = '<div class="empty">暂无进行中的论文或项目</div>';
  active.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).forEach(p => pw.appendChild(projCard(p)));

  /* 成果中心 */
  const arch = S.projects.filter(p => p.status === 'archived');
  $('#archCount').textContent = arch.length + ' 项';
  const papersN = arch.filter(p => p.type === 'paper').length;
  const projN = arch.filter(p => p.type === 'project').length;
  $('#achStats').innerHTML = `
    <div class="ach-stat"><b>${arch.length}</b><span>累计成果</span></div>
    <div class="ach-stat"><b class="accent-blue">${papersN}</b><span>论文</span></div>
    <div class="ach-stat"><b class="accent-green">${projN}</b><span>项目</span></div>`;
  const al = $('#archList');
  al.innerHTML = arch.length ? '' : '<div class="empty">完成论文或项目后点「归档」，成果会沉淀在这里</div>';
  arch.sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || '')).forEach(p => {
    const r = el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(p.title)}</div>
      <div class="row-meta"><span class="chip-tag">${p.type === 'paper' ? '论文' : '项目'}</span>
        <span>归档于 ${esc(p.archivedAt || '—')}</span>${p.outcome ? `<span>${esc(p.outcome)}</span>` : ''}</div>
    </div><div class="row-actions">
      <button class="mini-icon ed" title="编辑成果">${ICON.edit}</button>
      <button class="mini-icon un" title="恢复为进行中">${ICON.undo}</button>
      <button class="mini-icon del" title="删除">${ICON.del}</button>
    </div></div>`);
    r.querySelector('.ed').onclick = () => openForm('成果信息', [
      { k: 'title', label: '名称' },
      { k: 'outcome', label: '成果说明', ph: '例：录用于《管理评论》/ 结项优秀', type: 'textarea', rows: 2 },
      { k: 'archivedAt', label: '归档日期', type: 'date' }
    ], p, d => { Object.assign(p, d); save(); renderAll(); });
    r.querySelector('.un').onclick = () => { p.status = 'active'; save(); renderAll(); toast('已恢复为进行中'); };
    r.querySelector('.del').onclick = () => confirmDel(`成果「${p.title}」`, () => { S.projects = S.projects.filter(x => x.id !== p.id); save(); renderAll(); });
    al.appendChild(r);
  });
}

let projFilter = 'all';

function projCard(p) {
  const today = todayStr();
  const d = p.deadline ? dayDiff(p.deadline, today) : null;
  const dtxt = d == null ? '未设截止' : d < 0 ? `逾期 ${-d} 天` : d === 0 ? '今天截止' : `剩 ${d} 天`;
  const c = el(`<div class="proj">
    <div class="proj-head">
      <div style="flex:1;min-width:0">
        <div class="proj-title">${esc(p.title)}</div>
        <div class="proj-tags">
          <span class="chip-tag">${p.type === 'paper' ? '论文' : '项目'}</span>
          <span class="stage">${esc(p.stage || '进行中')}</span>
        </div>
      </div>
    </div>
    <div class="proj-bar"><i style="width:${clamp(Number(p.progress) || 0, 0, 100)}%"></i></div>
    <div class="proj-info"><span>进度 ${clamp(Number(p.progress) || 0, 0, 100)}%</span>
      <span style="${d != null && d <= 7 ? 'color:var(--clay)' : ''}">${esc(p.deadline || '')} ${dtxt}</span></div>
    ${p.next ? `<div class="proj-next"><b>下一步</b>${esc(p.next)}</div>` : ''}
    <div class="proj-foot">
      <button class="soft-btn plus">推进 +10%</button>
      <button class="soft-btn soft-btn--quiet ed">编辑</button>
      <button class="soft-btn soft-btn--quiet ar">归档</button>
      <button class="soft-btn soft-btn--quiet del">删除</button>
    </div>
  </div>`);
  c.querySelector('.plus').onclick = () => {
    p.progress = clamp((Number(p.progress) || 0) + 10, 0, 100);
    if (p.progress === 100) toast('已到 100%，可以归档啦');
    save(); renderAll();
  };
  c.querySelector('.ed').onclick = () => editProj(p);
  c.querySelector('.ar').onclick = () => {
    openForm('归档为成果', [
      { k: 'outcome', label: '成果说明', type: 'textarea', rows: 2, ph: '例：论文录用 / 项目通过验收 / 结题报告已提交' },
      { k: 'archivedAt', label: '归档日期', type: 'date', def: todayStr() }
    ], { archivedAt: todayStr(), outcome: p.outcome || '' }, d => {
      p.status = 'archived'; p.outcome = d.outcome; p.archivedAt = d.archivedAt || todayStr(); p.progress = 100;
      save(); renderAll(); toast('已归档到成果记录中心');
    });
  };
  c.querySelector('.del').onclick = () => confirmDel(`「${p.title}」`, () => { S.projects = S.projects.filter(x => x.id !== p.id); save(); renderAll(); });
  return c;
}

function editProj(p) {
  const isNew = !p;
  const v = p || { title: '', type: 'paper', stage: STAGES[0], progress: 0, deadline: '', next: '' };
  openForm(isNew ? '新建论文 / 项目' : '编辑', [
    { k: 'title', label: '名称', ph: '例：数字化转型对制造企业全要素生产率的影响' },
    { k: 'type', label: '类型', type: 'select', options: [{ v: 'paper', l: '论文' }, { v: 'project', l: '项目' }] },
    { k: 'stage', label: '当前阶段', type: 'select', options: STAGES },
    { k: 'progress', label: '进度 %', type: 'number', min: 0, max: 100, step: 5 },
    { k: 'deadline', label: '截止日期', type: 'date' },
    { k: 'next', label: '下一步动作', type: 'textarea', rows: 2, ph: '写得越具体，越容易开始' }
  ], v, d => {
    if (!d.title) { toast('请填写名称'); return false; }
    d.progress = clamp(Number(d.progress) || 0, 0, 100);
    if (isNew) S.projects.push({ id: uid(), status: 'active', ...d });
    else Object.assign(p, d);
    save(); renderAll();
  });
}

function exportAchievements() {
  const arch = S.projects.filter(p => p.status === 'archived')
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
  if (!arch.length) { toast('暂无归档成果'); return; }
  let md = `# 个人成果记录\n\n生成时间：${todayStr()}\n\n`;
  ['paper', 'project'].forEach(tp => {
    const g = arch.filter(p => p.type === tp);
    if (!g.length) return;
    md += `## ${tp === 'paper' ? '论文成果' : '项目成果'}（${g.length}）\n\n`;
    g.forEach((p, i) => {
      md += `${i + 1}. **${p.title}**\n   - 归档日期：${p.archivedAt || '—'}\n   - 成果说明：${p.outcome || '—'}\n\n`;
    });
  });
  download('个人成果记录_' + todayStr() + '.md', md, 'text/markdown');
  toast('成果清单已导出');
}

/* ============================================================
   生活页
   ============================================================ */
let lifeTab = 'ledger', ledgerType = 'out', ledgerFilterVal = 'all';

function curMonth() { const v = $('#ledgerMonth').value; return v || todayStr().slice(0, 7); }

function syncCatOptions() {
  const sel = $('#qlCategory');
  const list = ledgerType === 'out' ? CAT_OUT : CAT_IN;
  sel.innerHTML = list.map(c => `<option>${c}</option>`).join('');
}

function renderLife() {
  $$('.life-panel').forEach(p => p.classList.toggle('is-active', p.id === 'life-' + lifeTab));
  renderLedger(); renderSport(); renderMedia(); renderTravel();
}

/* ---- 记账 ---- */
function renderLedger() {
  const m = curMonth();
  const rows = S.ledger.filter(r => r.date.slice(0, 7) === m);
  const inc = rows.filter(r => r.type === 'in').reduce((s, r) => s + r.amount, 0);
  const exp = rows.filter(r => r.type === 'out').reduce((s, r) => s + r.amount, 0);
  $('#mIncome').textContent = money(inc);
  $('#mExpense').textContent = money(exp);
  const bal = inc - exp;
  const bEl = $('#mBalance'); bEl.textContent = money(bal);
  bEl.className = 'money-value ' + (bal >= 0 ? 'accent-green' : 'accent-clay');
  $('#mRate').textContent = inc > 0 ? Math.round(bal / inc * 100) + '%' : '—';

  breakdown($('#expenseBreak'), rows.filter(r => r.type === 'out'), 'var(--clay)');
  breakdown($('#incomeBreak'), rows.filter(r => r.type === 'in'), 'var(--green)');
  $('#expenseTotalChip').textContent = money(exp);
  $('#incomeTotalChip').textContent = money(inc);

  const list = $('#ledgerList');
  const shown = rows.filter(r => ledgerFilterVal === 'all' || r.type === ledgerFilterVal)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  list.innerHTML = shown.length ? '' : '<div class="empty">本月还没有账目</div>';
  shown.forEach(r => {
    const row = el(`<div class="row"><div class="row-main">
        <div class="row-title" style="font-weight:500">${esc(r.category)}${r.note ? ` <span style="color:var(--text-3);font-weight:400">· ${esc(r.note)}</span>` : ''}</div>
        <div class="row-meta"><span>${esc(r.date)}</span></div>
      </div>
      <div class="amt ${r.type}">${r.type === 'out' ? '−' : '+'}${money(r.amount).slice(1)}</div>
      <div class="row-actions"><button class="mini-icon ed">${ICON.edit}</button><button class="mini-icon del">${ICON.del}</button></div></div>`);
    row.querySelector('.ed').onclick = () => editLedger(r);
    row.querySelector('.del').onclick = () => confirmDel(`这笔 ${r.category} ${money(r.amount)}`, () => { S.ledger = S.ledger.filter(x => x.id !== r.id); save(); renderAll(); });
    list.appendChild(row);
  });
}

function breakdown(node, rows, color) {
  const map = {};
  rows.forEach(r => { map[r.category] = (map[r.category] || 0) + r.amount; });
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = arr.reduce((s, x) => s + x[1], 0);
  node.innerHTML = arr.length ? '' : '<div class="empty">暂无数据</div>';
  arr.forEach(([k, v]) => {
    const pct = total ? Math.round(v / total * 100) : 0;
    node.appendChild(el(`<div class="break-row">
      <div class="break-top"><span>${esc(k)} <span style="color:var(--text-3)">${pct}%</span></span><span>${money(v)}</span></div>
      <div class="break-bar"><i style="width:${pct}%;background:${color}"></i></div></div>`));
  });
}

function editLedger(r) {
  openForm('编辑账目', [
    { k: 'type', label: '类型', type: 'select', options: [{ v: 'out', l: '支出' }, { v: 'in', l: '收入' }] },
    { k: 'amount', label: '金额', type: 'number', step: '0.01', min: 0 },
    { k: 'category', label: '分类', type: 'select', options: [...new Set([...CAT_OUT, ...CAT_IN])] },
    { k: 'date', label: '日期', type: 'date' },
    { k: 'note', label: '备注', type: 'text' }
  ], r, d => {
    const amt = Number(d.amount);
    if (!(amt > 0)) { toast('金额需大于 0'); return false; }
    Object.assign(r, { type: d.type, amount: amt, category: d.category, date: d.date || todayStr(), note: d.note });
    save(); renderAll();
  });
}

/* ---- 运动 ---- */
function renderSport() {
  const m = todayStr().slice(0, 7);
  const rows = S.sports.filter(r => r.date.slice(0, 7) === m);
  $('#spCount').textContent = rows.length;
  $('#spMin').textContent = rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0);
  const dates = new Set(S.sports.map(r => r.date));
  let streak = 0, d = new Date();
  while (dates.has(ymd(d))) { streak++; d.setDate(d.getDate() - 1); }
  $('#spStreak').textContent = streak;

  const list = $('#sportList');
  const all = S.sports.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  list.innerHTML = all.length ? '' : '<div class="empty">还没有运动记录</div>';
  all.forEach(r => {
    const row = el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(r.type)} <span style="color:var(--text-3);font-weight:400">${r.minutes || 0} 分钟</span></div>
      <div class="row-meta"><span>${esc(r.date)}</span>${r.note ? `<span>${esc(r.note)}</span>` : ''}</div>
    </div><div class="row-actions"><button class="mini-icon ed">${ICON.edit}</button><button class="mini-icon del">${ICON.del}</button></div></div>`);
    row.querySelector('.ed').onclick = () => editSport(r);
    row.querySelector('.del').onclick = () => confirmDel('这条运动记录', () => { S.sports = S.sports.filter(x => x.id !== r.id); save(); renderAll(); });
    list.appendChild(row);
  });
}
function editSport(r) {
  const isNew = !r;
  openForm(isNew ? '新增运动' : '编辑运动', [
    { k: 'type', label: '项目', type: 'select', options: ['跑步', '快走', '力量训练', '游泳', '骑行', '瑜伽', '球类', '其他'] },
    { k: 'minutes', label: '时长（分钟）', type: 'number', min: 0, step: 5 },
    { k: 'date', label: '日期', type: 'date', def: todayStr() },
    { k: 'note', label: '备注', type: 'text', ph: '距离、感受…' }
  ], r || { date: todayStr(), minutes: 30 }, d => {
    d.minutes = Number(d.minutes) || 0; d.date = d.date || todayStr();
    if (isNew) S.sports.push({ id: uid(), ...d }); else Object.assign(r, d);
    save(); renderAll();
  });
}

/* ---- 阅读观影 ---- */
function renderMedia() {
  const bl = $('#bookList');
  bl.innerHTML = S.books.length ? '' : '<div class="empty">还没有书</div>';
  S.books.forEach(b => {
    const row = el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(b.title)}</div>
      <div class="row-meta"><span class="chip-tag">${esc(b.status)}</span>${b.author ? `<span>${esc(b.author)}</span>` : ''}<span>${b.progress || 0}%</span>${b.rating ? `<span>${'★'.repeat(Number(b.rating))}</span>` : ''}</div>
      ${b.note ? `<div class="row-meta" style="color:var(--text-2);margin-top:4px">${esc(b.note)}</div>` : ''}
    </div><div class="row-actions"><button class="mini-icon ed">${ICON.edit}</button><button class="mini-icon del">${ICON.del}</button></div></div>`);
    row.querySelector('.ed').onclick = () => editBook(b);
    row.querySelector('.del').onclick = () => confirmDel(`《${b.title}》`, () => { S.books = S.books.filter(x => x.id !== b.id); save(); renderAll(); });
    bl.appendChild(row);
  });

  const ml = $('#movieList');
  ml.innerHTML = S.movies.length ? '' : '<div class="empty">还没有影片</div>';
  S.movies.forEach(mv => {
    const row = el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(mv.title)}</div>
      <div class="row-meta"><span>${esc(mv.date || '')}</span>${mv.rating ? `<span>${'★'.repeat(Number(mv.rating))}</span>` : ''}</div>
      ${mv.note ? `<div class="row-meta" style="color:var(--text-2);margin-top:4px">${esc(mv.note)}</div>` : ''}
    </div><div class="row-actions"><button class="mini-icon ed">${ICON.edit}</button><button class="mini-icon del">${ICON.del}</button></div></div>`);
    row.querySelector('.ed').onclick = () => editMovie(mv);
    row.querySelector('.del').onclick = () => confirmDel(`《${mv.title}》`, () => { S.movies = S.movies.filter(x => x.id !== mv.id); save(); renderAll(); });
    ml.appendChild(row);
  });
}
function editBook(b) {
  const isNew = !b;
  openForm(isNew ? '新增书籍' : '编辑书籍', [
    { k: 'title', label: '书名' },
    { k: 'author', label: '作者' },
    { k: 'status', label: '状态', type: 'select', options: ['在读', '想读', '已读', '弃读'] },
    { k: 'progress', label: '进度 %', type: 'number', min: 0, max: 100, step: 5 },
    { k: 'rating', label: '评分', type: 'select', options: ['', '1', '2', '3', '4', '5'] },
    { k: 'note', label: '一句话感想', type: 'textarea', rows: 2 }
  ], b || { status: '在读', progress: 0 }, d => {
    if (!d.title) { toast('请填写书名'); return false; }
    d.progress = clamp(Number(d.progress) || 0, 0, 100);
    if (isNew) S.books.unshift({ id: uid(), ...d }); else Object.assign(b, d);
    save(); renderAll();
  });
}
function editMovie(mv) {
  const isNew = !mv;
  openForm(isNew ? '新增影片' : '编辑影片', [
    { k: 'title', label: '片名' },
    { k: 'date', label: '观看日期', type: 'date', def: todayStr() },
    { k: 'rating', label: '评分', type: 'select', options: ['', '1', '2', '3', '4', '5'] },
    { k: 'note', label: '一句话感想', type: 'textarea', rows: 2 }
  ], mv || { date: todayStr() }, d => {
    if (!d.title) { toast('请填写片名'); return false; }
    if (isNew) S.movies.unshift({ id: uid(), ...d }); else Object.assign(mv, d);
    save(); renderAll();
  });
}

/* ---- 旅行 ---- */
function renderTravel() {
  const w = $('#tripList');
  w.innerHTML = S.trips.length ? '' : '<div class="empty">还没有旅行计划</div>';
  S.trips.forEach(t => {
    const done = (t.items || []).filter(i => i.ok).length;
    const c = el(`<div class="trip">
      <div class="proj-head"><div style="flex:1;min-width:0">
        <div class="proj-title">${esc(t.title)}</div>
        <div class="proj-tags"><span class="chip-tag">${esc(t.start || '')}${t.end ? ' ~ ' + esc(t.end) : ''}</span>
        ${t.budget ? `<span class="chip-mini">预算 ${money(t.budget)}</span>` : ''}
        <span class="chip-mini">清单 ${done}/${(t.items || []).length}</span></div>
      </div></div>
      ${t.note ? `<div class="proj-next"><b>备注</b>${esc(t.note)}</div>` : ''}
      <div class="trip-check"></div>
      <div class="proj-foot">
        <button class="soft-btn addi">＋ 清单项</button>
        <button class="soft-btn soft-btn--quiet ed">编辑</button>
        <button class="soft-btn soft-btn--quiet del">删除</button>
      </div></div>`);
    const cw = c.querySelector('.trip-check');
    (t.items || []).forEach(i => {
      const lb = el(`<label class="${i.ok ? 'ok' : ''}"><input type="checkbox" ${i.ok ? 'checked' : ''}/><span style="flex:1">${esc(i.text)}</span><button class="mini-icon del" style="width:22px;height:22px">${ICON.del}</button></label>`);
      lb.querySelector('input').onchange = e => { i.ok = e.target.checked; save(); renderAll(); };
      lb.querySelector('.del').onclick = ev => { ev.preventDefault(); t.items = t.items.filter(x => x !== i); save(); renderAll(); };
      cw.appendChild(lb);
    });
    c.querySelector('.addi').onclick = () => openForm('新增清单项', [{ k: 'text', label: '内容', ph: '订机票 / 办签证 / 收拾行李' }], {}, d => {
      if (!d.text) return false; t.items = t.items || []; t.items.push({ text: d.text, ok: false }); save(); renderAll();
    });
    c.querySelector('.ed').onclick = () => editTrip(t);
    c.querySelector('.del').onclick = () => confirmDel(`旅行「${t.title}」`, () => { S.trips = S.trips.filter(x => x.id !== t.id); save(); renderAll(); });
    w.appendChild(c);
  });
}
function editTrip(t) {
  const isNew = !t;
  openForm(isNew ? '新增旅行计划' : '编辑旅行', [
    { k: 'title', label: '目的地 / 主题' },
    { k: 'start', label: '出发日期', type: 'date' },
    { k: 'end', label: '返程日期', type: 'date' },
    { k: 'budget', label: '预算（元）', type: 'number', min: 0, step: 100 },
    { k: 'note', label: '备注', type: 'textarea', rows: 2 }
  ], t || {}, d => {
    if (!d.title) { toast('请填写目的地'); return false; }
    d.budget = Number(d.budget) || 0;
    if (isNew) S.trips.unshift({ id: uid(), items: [], ...d }); else Object.assign(t, d);
    save(); renderAll();
  });
}

/* ============================================================
   回顾页
   ============================================================ */
let reviewRange = 'week';

function rangeBounds() {
  const now = new Date();
  if (reviewRange === 'week') { const [s, e] = weekRange(now); return [s, e]; }
  if (reviewRange === 'month') {
    const s = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const e = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return [s, e];
  }
  return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
}

function renderReview() {
  const [s, e] = rangeBounds();
  const inR = d => d && d >= s && d <= e;

  /* 任务柱状 */
  const buckets = [];
  if (reviewRange === 'week') {
    const st = parseDate(s);
    for (let i = 0; i < 7; i++) { const d = new Date(st); d.setDate(st.getDate() + i); buckets.push({ label: '一二三四五六日'[i], from: ymd(d), to: ymd(d) }); }
  } else if (reviewRange === 'month') {
    let cur = parseDate(s), idx = 1;
    while (ymd(cur) <= e) {
      const from = ymd(cur); const nx = new Date(cur); nx.setDate(cur.getDate() + 6);
      const to = ymd(nx) > e ? e : ymd(nx);
      buckets.push({ label: 'W' + idx++, from, to });
      cur = new Date(nx); cur.setDate(nx.getDate() + 1);
    }
  } else {
    const y = new Date().getFullYear();
    for (let m = 0; m < 12; m++) buckets.push({ label: (m + 1) + '', from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) });
  }
  const stats = buckets.map(b => {
    const ts = S.tasks.filter(t => t.date && t.date >= b.from && t.date <= b.to);
    return { label: b.label, total: ts.length, done: ts.filter(t => t.done).length };
  });
  const maxT = Math.max(1, ...stats.map(x => x.total));
  const bars = $('#rvTaskBars'); bars.innerHTML = '';
  stats.forEach(x => {
    const h = Math.max(4, Math.round(x.total / maxT * 100));
    const dh = x.total ? Math.round(x.done / x.total * 100) : 0;
    bars.appendChild(el(`<div class="bar-col" title="${x.done}/${x.total}">
      <div class="bar-stack" style="height:${h}%"><i style="height:${dh}%"></i></div>
      <div class="bar-label">${x.label}</div></div>`));
  });
  const tAll = stats.reduce((a, x) => a + x.total, 0), tDone = stats.reduce((a, x) => a + x.done, 0);
  $('#rvTaskChip').textContent = `${tDone}/${tAll} · ${tAll ? Math.round(tDone / tAll * 100) : 0}%`;

  /* 科研 */
  const arch = S.projects.filter(p => p.status === 'archived' && inR(p.archivedAt));
  const activeP = S.projects.filter(p => p.status !== 'archived');
  const avgProg = activeP.length ? Math.round(activeP.reduce((a, p) => a + (Number(p.progress) || 0), 0) / activeP.length) : 0;
  const libNew = S.library.filter(x => inR(x.addedAt)).length;
  $('#rvResearch').innerHTML = [
    ['进行中论文 / 项目', activeP.length + ' 项'],
    ['平均进度', avgProg + '%'],
    ['本期归档成果', arch.length + ' 项'],
    ['本期新增文献', libNew + ' 篇'],
    ['文献库总量', S.library.length + ' 篇']
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join('');

  /* 生活 */
  const sp = S.sports.filter(x => inR(x.date));
  const mv = S.movies.filter(x => inR(x.date));
  const readDone = S.books.filter(b => b.status === '已读').length;
  $('#rvLife').innerHTML = [
    ['运动次数', sp.length + ' 次'],
    ['运动时长', sp.reduce((a, x) => a + (Number(x.minutes) || 0), 0) + ' 分钟'],
    ['观影', mv.length + ' 部'],
    ['在读书目', S.books.filter(b => b.status === '在读').length + ' 本'],
    ['累计读完', readDone + ' 本'],
    ['旅行计划', S.trips.length + ' 个']
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join('');

  /* 财务 */
  const rows = S.ledger.filter(x => inR(x.date));
  const inc = rows.filter(r => r.type === 'in').reduce((a, r) => a + r.amount, 0);
  const exp = rows.filter(r => r.type === 'out').reduce((a, r) => a + r.amount, 0);
  const days = Math.max(1, dayDiff(e > todayStr() ? todayStr() : e, s) + 1);
  $('#rvMoney').innerHTML = [
    ['收入', money(inc)], ['支出', money(exp)], ['结余', money(inc - exp)],
    ['日均支出', money(exp / days)], ['笔数', rows.length + ' 笔']
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join('');
  $('#rvMoneyChip').textContent = `${s.slice(5)} ~ ${e.slice(5)}`;
  breakdown($('#rvMoneyBreak'), rows.filter(r => r.type === 'out'), 'var(--clay)');

  /* 文字小结 */
  const rangeName = { week: '本周', month: '本月', year: '今年' }[reviewRange];
  const rate = tAll ? Math.round(tDone / tAll * 100) : 0;
  let txt = `${rangeName}共安排 ${tAll} 项任务，完成 ${tDone} 项，完成率 ${rate}%。`;
  txt += rate >= 80 ? '节奏保持得很好。' : rate >= 50 ? '整体推进正常，可以再收紧一点计划密度。' : tAll ? '完成率偏低，建议把大任务拆成更小的下一步动作。' : '还没有记录任务，先从今天写下三件事开始。';
  txt += ` 科研方面有 ${activeP.length} 项在推进，平均进度 ${avgProg}%${arch.length ? `，${rangeName}归档了 ${arch.length} 项成果` : ''}。`;
  txt += ` 生活上运动 ${sp.length} 次、观影 ${mv.length} 部；收支方面收入 ${money(inc)}、支出 ${money(exp)}，结余 ${money(inc - exp)}。`;
  const topCat = Object.entries(rows.filter(r => r.type === 'out').reduce((m, r) => (m[r.category] = (m[r.category] || 0) + r.amount, m), {})).sort((a, b) => b[1] - a[1])[0];
  if (topCat) txt += ` 支出占比最高的是「${topCat[0]}」，${money(topCat[1])}。`;
  $('#reviewSummary').textContent = txt;
}

/* ============================================================
   设置 / 数据
   ============================================================ */
function download(name, content, type) {
  const blob = new Blob([content], { type: (type || 'application/json') + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

function openSettings() {
  const count = S.tasks.length + S.inbox.length + S.library.length + S.projects.length +
    S.sports.length + S.books.length + S.movies.length + S.trips.length + S.ledger.length;
  const body = el(`<div>
    <div class="help-block" style="margin-bottom:14px">
      数据默认保存在本机浏览器（localStorage）。开启<b>云端同步</b>后，数据自动存到 JSONBin 云端，手机与电脑共享同一份，且代码更新不影响数据。当前共 <b>${count}</b> 条记录。
    </div>
    <div class="card" style="padding:14px;margin-bottom:14px">
      <div style="font-weight:600;margin-bottom:10px">云端同步（JSONBin）</div>
      <div class="field"><label>Bin ID</label><input id="setBinId" value="${esc(S.settings.binId || '')}" placeholder="JSONBin 的 Bin ID" /></div>
      <div class="field"><label>API Key（X-Master-Key）</label><input id="setApiKey" type="password" value="${esc(S.settings.apiKey || '')}" placeholder="粘贴你的 Master Key" /></div>
      <div class="sheet-actions" style="justify-content:flex-start;margin-top:4px">
        <button class="soft-btn" id="btnTestSync">测试连接</button>
        <button class="soft-btn" id="btnCreateBin">新建空 Bin</button>
        <span id="syncTestResult" class="help-block" style="margin:0"></span>
      </div>
      <div class="help-block" style="color:var(--text-3);margin-top:8px">
        没账号？去 jsonbin.io 注册 → 复制主页的 <b>Master Key</b> 填上面，再点「新建空 Bin」即可自动创建并填入 Bin ID。两个设备填<b>相同</b>的 Bin ID 与 Key 即共享数据。
      </div>
    </div>
    <div class="field"><label>称呼（显示在首页问候语）</label><input id="setNick" value="${esc(S.settings.nick || '')}" placeholder="例：Fu" /></div>
    <div class="sheet-actions" style="justify-content:flex-start;margin-bottom:14px">
      <button class="soft-btn" id="btnExport">导出 JSON</button>
      <label class="soft-btn">导入 JSON<input type="file" id="fileImport" accept="application/json,.json" hidden /></label>
      <button class="soft-btn" id="btnSeed">载入示例数据</button>
    </div>
    <div class="help-block" style="color:var(--text-3)">
      <b>添加到 iPhone 主屏</b>：Safari 打开本页 → 分享 → 添加到主屏幕，即可像 App 一样全屏使用。
    </div>
    <div class="sheet-actions" style="justify-content:flex-start;margin-top:14px">
      <button class="soft-btn soft-btn--danger" id="btnClear">清空全部数据</button>
    </div>
  </div>`);
  const bindSync = () => {
    S.settings.binId = $('#setBinId').value.trim();
    S.settings.apiKey = $('#setApiKey').value.trim();
    if (window.Sync) Sync.setCreds(S.settings.binId, S.settings.apiKey);
    save();
    if (Sync.enabled()) Sync.startup(S, adoptCloud);
  };
  body.querySelector('#setBinId').onchange = bindSync;
  body.querySelector('#setApiKey').onchange = bindSync;
  body.querySelector('#btnTestSync').onclick = async () => {
    const r = $('#syncTestResult');
    if (!Sync.enabled()) { r.textContent = '请先填写 Bin ID 与 API Key'; r.style.color = 'var(--danger)'; return; }
    r.textContent = '测试中…'; r.style.color = '';
    try { const c = await Sync.pull(); r.textContent = '连接成功 ✓'; r.style.color = 'var(--ok)'; }
    catch (e) { r.textContent = e.message; r.style.color = 'var(--danger)'; }
  };
  body.querySelector('#btnCreateBin').onclick = async () => {
    const r = $('#syncTestResult');
    if (!S.settings.apiKey) { r.textContent = '请先填写 API Key'; r.style.color = 'var(--danger)'; return; }
    r.textContent = '创建中…'; r.style.color = '';
    try {
      const id = await Sync.createBin(S);
      S.settings.binId = id; $('#setBinId').value = id;
      if (window.Sync) Sync.setCreds(id, S.settings.apiKey);
      save(); r.textContent = '已创建并填入 Bin ID ✓'; r.style.color = 'var(--ok)';
      Sync.startup(S, adoptCloud);
    } catch (e) { r.textContent = e.message; r.style.color = 'var(--danger)'; }
  };
  body.querySelector('#setNick').onchange = e => { S.settings.nick = e.target.value.trim(); save(); renderGreeting(); };
  body.querySelector('#btnExport').onclick = () => {
    download(`研习台备份_${todayStr()}.json`, JSON.stringify(S, null, 2));
    toast('已导出备份文件');
  };
  body.querySelector('#fileImport').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const o = JSON.parse(String(fr.result));
        if (!o || typeof o !== 'object') throw 0;
        S = normalize(Object.assign(structuredClone(DEFAULT_STATE), o, { settings: Object.assign({}, DEFAULT_STATE.settings, o.settings || {}) }));
        save(); applyTheme(); renderAll(); closeModal(); toast('导入成功');
      } catch (err) { toast('文件格式不正确'); }
    };
    fr.readAsText(f, 'utf-8');
  };
  body.querySelector('#btnSeed').onclick = () => { seedDemo(); closeModal(); };
  body.querySelector('#btnClear').onclick = () => confirmDel('全部本地数据', () => {
    S = structuredClone(DEFAULT_STATE); save(); applyTheme(); renderAll(); closeModal(); toast('已清空');
  });
  openModal('数据与设置', body, [btn('完成', 'soft-btn--solid', closeModal)]);
}

function seedDemo() {
  const t = todayStr(), d = n => ymd(new Date(Date.now() + n * 86400000));
  S.tasks.push(
    { id: uid(), title: '整理数字化转型文献 10 篇', date: t, done: true, tag: '科研', note: '' },
    { id: uid(), title: '跑 Stata 基准回归', date: t, done: false, tag: '科研', note: '含稳健性检验' },
    { id: uid(), title: '导师组会汇报提纲', date: d(1), done: false, tag: '会议', note: '' },
    { id: uid(), title: '健身房 45 分钟', date: t, done: false, tag: '生活', note: '' }
  );
  S.projects.push(
    { id: uid(), title: '数字化转型对制造企业全要素生产率的影响', type: 'paper', stage: '模型/实证', progress: 55, deadline: d(28), next: '补充中介效应检验并重跑稳健性', status: 'active' },
    { id: uid(), title: '省科技厅软科学课题：区域创新效率评价', type: 'project', stage: '数据收集', progress: 30, deadline: d(60), next: '整理 2015—2024 年省级面板数据', status: 'active' },
    { id: uid(), title: '本科毕业论文：智能制造与就业结构', type: 'paper', stage: '结项验收', progress: 100, status: 'archived', archivedAt: d(-120), outcome: '校级优秀毕业论文' }
  );
  S.ledger.push(
    { id: uid(), type: 'in', amount: 3000, category: '助研津贴', date: t.slice(0, 8) + '05', note: '导师课题' },
    { id: uid(), type: 'in', amount: 800, category: '奖学金', date: t.slice(0, 8) + '10', note: '学业奖学金' },
    { id: uid(), type: 'out', amount: 980, category: '餐饮', date: t.slice(0, 8) + '12', note: '食堂+外卖' },
    { id: uid(), type: 'out', amount: 260, category: '学习科研', date: t.slice(0, 8) + '14', note: '文献下载与打印' },
    { id: uid(), type: 'out', amount: 420, category: '交通', date: t.slice(0, 8) + '18', note: '回家高铁' }
  );
  S.sports.push({ id: uid(), type: '跑步', minutes: 40, date: t, note: '5 公里' });
  S.books.push({ id: uid(), title: '技术与经济增长', author: '—', status: '在读', progress: 40, rating: '4', note: '第 3 章与选题相关' });
  S.movies.push({ id: uid(), title: '奥本海默', date: d(-6), rating: '5', note: '' });
  S.trips.push({ id: uid(), title: '成都 · 学术会议 + 短途', start: d(35), end: d(38), budget: 2600, note: '会议报销部分交通', items: [{ text: '提交参会回执', ok: true }, { text: '订往返机票', ok: false }] });
  S.inbox.push({ id: uid(), text: '能不能用工业机器人渗透度做 Bartik 工具变量？', tag: '选题', createdAt: new Date().toISOString() });
  save(); renderAll(); toast('示例数据已载入');
}

/* ============================================================
   快速记录
   ============================================================ */
let quickTag = '灵感';
function openQuick() {
  $('#quickMask').classList.add('show');
  setTimeout(() => $('#quickText').focus(), 150);
}
function closeQuick() { $('#quickMask').classList.remove('show'); }
function saveQuick(asTask) {
  const txt = $('#quickText').value.trim();
  if (!txt) { toast('先写点什么吧'); return; }
  if (asTask) {
    S.tasks.push({ id: uid(), title: txt.slice(0, 80), date: todayStr(), done: false, tag: quickTag === '待办' ? '' : quickTag, note: '' });
    toast('已加入今日任务');
  } else {
    S.inbox.unshift({ id: uid(), text: txt, tag: quickTag, createdAt: new Date().toISOString() });
    toast('已存入收集箱');
  }
  $('#quickText').value = ''; save(); renderAll(); closeQuick();
}

function openInboxAll() {
  const body = el('<div class="list list--tight"></div>');
  if (!S.inbox.length) body.innerHTML = '<div class="empty">收集箱为空</div>';
  S.inbox.forEach(n => body.appendChild(inboxRow(n)));
  openModal(`灵感收集箱（${S.inbox.length}）`, body, [btn('关闭', 'soft-btn--solid', closeModal)]);
}

/* ============================================================
   渲染 & 事件绑定
   ============================================================ */
function renderGreeting() {
  const now = new Date();
  const wd = '日一二三四五六'[now.getDay()];
  $('#topDate').textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${wd}`;
  if (currentPage === 'home') {
    const h = now.getHours();
    const greet = h < 6 ? '还没睡' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : h < 23 ? '晚上好' : '夜深了';
    $('#topTitle').textContent = S.settings.nick ? `${greet}，${S.settings.nick}` : greet;
  }
}

function renderAll() {
  renderGreeting();
  if (currentPage === 'home') renderHome();
  else if (currentPage === 'research') renderResearch();
  else if (currentPage === 'life') renderLife();
  else if (currentPage === 'review') renderReview();
}

function bind() {
  $$('[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
  $$('[data-goto]').forEach(b => b.onclick = () => go(b.dataset.goto));
  $('#topTheme').onclick = toggleTheme;
  $('#railTheme').onclick = toggleTheme;
  $('#topSettings').onclick = openSettings;
  $('#railSettings').onclick = openSettings;

  /* 首页 */
  $('#addTaskBtn').onclick = () => editTask(null);
  $('#taskFilter').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    taskFilter = b.dataset.tf;
    $$('#taskFilter button').forEach(x => x.classList.toggle('is-active', x === b));
    renderHome();
  };
  $('#icsInput').onchange = e => { const f = e.target.files[0]; if (f) importICS(f); e.target.value = ''; };
  $('#icsClear').onclick = () => confirmDel('全部由日历导入的事件', () => { S.tasks = S.tasks.filter(t => t.source !== 'ics'); save(); renderAll(); });
  $('#calHelpBtn').onclick = calHelp;
  $('#inboxMoreBtn').onclick = openInboxAll;

  /* 科研 */
  $('#paperShuffle').onclick = () => { S.settings.paperShift = (S.settings.paperShift || 0) + 1; save(); renderPaperDaily(); };
  $('#paperRefresh').onclick = () => loadFeed(true);
  $('#paperMode').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    S.settings.feedMode = b.dataset.pm; save(); renderPaperDaily();
  };
  $('#addPaperBtn').onclick = () => openForm('手动添加文献', [
    { k: 't', label: '标题' }, { k: 'a', label: '作者' }, { k: 'j', label: '期刊' },
    { k: 'y', label: '年份', type: 'number' }, { k: 'note', label: '笔记', type: 'textarea', rows: 3 }
  ], { y: new Date().getFullYear() }, d => {
    if (!d.t) { toast('请填写标题'); return false; }
    S.library.unshift({ id: uid(), en: '', addedAt: todayStr(), ...d }); save(); renderAll();
  });
  $('#addProjBtn').onclick = () => editProj(null);
  $('#projFilter').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    projFilter = b.dataset.pf;
    $$('#projFilter button').forEach(x => x.classList.toggle('is-active', x === b));
    renderResearch();
  };
  $('#archExport').onclick = exportAchievements;

  /* 生活 */
  $('#lifeTabs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    lifeTab = b.dataset.life;
    $$('#lifeTabs button').forEach(x => x.classList.toggle('is-active', x === b));
    renderLife();
  };
  $('#ledgerType').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    ledgerType = b.dataset.lt;
    $$('#ledgerType button').forEach(x => x.classList.toggle('is-active', x === b));
    syncCatOptions();
  };
  $('#quickLedger').onsubmit = e => {
    e.preventDefault();
    const amt = Number($('#qlAmount').value);
    if (!(amt > 0)) { toast('请输入金额'); return; }
    S.ledger.push({
      id: uid(), type: ledgerType, amount: Math.round(amt * 100) / 100,
      category: $('#qlCategory').value, date: $('#qlDate').value || todayStr(),
      note: $('#qlNote').value.trim()
    });
    $('#qlAmount').value = ''; $('#qlNote').value = '';
    save(); renderLedger(); toast('已记录');
  };
  $('#ledgerMonth').onchange = renderLedger;
  $('#ledgerFilter').onchange = e => { ledgerFilterVal = e.target.value; renderLedger(); };
  $('#addSportBtn').onclick = () => editSport(null);
  $('#addBookBtn').onclick = () => editBook(null);
  $('#addMovieBtn').onclick = () => editMovie(null);
  $('#addTripBtn').onclick = () => editTrip(null);

  /* 回顾 */
  $('#reviewRange').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    reviewRange = b.dataset.rr;
    $$('#reviewRange button').forEach(x => x.classList.toggle('is-active', x === b));
    renderReview();
  };

  /* 快速记录 */
  $('#fab').onclick = openQuick;
  $('#quickClose').onclick = closeQuick;
  $('#quickMask').onclick = e => { if (e.target.id === 'quickMask') closeQuick(); };
  $('#quickTags').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    quickTag = b.dataset.qt;
    $$('#quickTags button').forEach(x => x.classList.toggle('is-active', x === b));
  };
  $('#quickSave').onclick = () => saveQuick(false);
  $('#quickToTask').onclick = () => saveQuick(true);
  $('#quickText').onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveQuick(false); };

  /* 弹窗 */
  $('#modalClose').onclick = closeModal;
  $('#modalMask').onclick = e => { if (e.target.id === 'modalMask') closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeQuick(); } });
}

/* ---------------- 启动 ---------------- */
function init() {
  applyTheme();
  $('#ledgerMonth').value = todayStr().slice(0, 7);
  $('#qlDate').value = todayStr();
  syncCatOptions();
  // 云端同步初始化
  if (window.Sync) {
    Sync.setCreds(S.settings.binId, S.settings.apiKey);
    Sync.onStatus(updateSyncBadge);
    Sync.startup(S, adoptCloud);
  }
  bind();
  go('home');
  checkUpdate();
}
init();

// 版本检查：代码更新后手机自动刷新拿到新版
function checkUpdate() {
  fetch('version.txt', { cache: 'no-store' })
    .then(r => r.ok ? r.text() : null)
    .then(t => {
      const v = (t || '').trim();
      if (!v) return;
      const seen = localStorage.getItem('yanxitai.seenVersion');
      if (seen && seen !== v) {
        toast('发现新版本，正在刷新…');
        setTimeout(() => location.reload(true), 900);
      } else {
        localStorage.setItem('yanxitai.seenVersion', v);
      }
    })
    .catch(() => {});
}

})();
