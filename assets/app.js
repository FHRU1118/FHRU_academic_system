/* ============================================================
   研习台 · 应用逻辑 v2.1
   数据保存在浏览器 localStorage，可选 JSONBin 云端同步
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

/* ---------------- 阶段模板 ---------------- */
const PAPER_STAGES = ['选题构思', '文献综述', '方法设计', '初稿撰写', '修改打磨', '投稿', '审稿返修', '录用', '发表'];
const PROJECT_KINDS = {
  academic:   { label: '学术研究', stages: ['立项与资料整理', '知识库搭建', '第一轮论文·产出', '中期评估', '结项与成果'] },
  competition:{ label: '学科竞赛', stages: ['组队与选题', '方案设计', '实施推进', '提交参赛', '复盘总结'] },
  internship: { label: '实习实践', stages: ['入职与熟悉', '任务执行', '阶段性交付', '总结汇报'] },
  custom:     { label: '自定义',   stages: ['阶段一', '阶段二', '阶段三', '阶段四'] }
};
const ACH_TYPES = [
  { v: 'paper', l: '论文' }, { v: 'project', l: '项目' },
  { v: 'competition', l: '竞赛获奖' }, { v: 'conference', l: '会议报告' }, { v: 'other', l: '其他' }
];

/* ---------------- 数据层 ---------------- */
const KEY = 'yanxitai.v2';
const DEFAULT_STATE = {
  version: 2,
  savedAt: 0,
  settings: { theme: 'light', paperShift: 0, nick: '', feedMode: 'live', binId: '', apiKey: '' },
  tasks: [],
  inbox: [],
  calendar: [],
  papers: [],
  projects: [],
  directions: [],
  researchNotes: [],
  achievements: [],
  sports: [],
  books: [],
  movies: [],
  trips: [],
  habits: []
};

let S = load();

function load() {
  try {
    let raw = localStorage.getItem(KEY);
    let fromOld = false;
    if (!raw) {
      const old = localStorage.getItem('yanxitai.v1');
      if (old) { raw = old; fromOld = true; }
    }
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    const st = Object.assign(structuredClone(DEFAULT_STATE), parsed, {
      settings: Object.assign({}, DEFAULT_STATE.settings, parsed.settings || {})
    });
    if (fromOld) migrateV1(st, parsed);
    return normalize(st);
  } catch (e) { return structuredClone(DEFAULT_STATE); }
}

/* v1 (yanxitai.v1) → v2 迁移：拆分项目、ics 任务转日历事件 */
function migrateV1(st, old) {
  st.tasks = (old.tasks || []).filter(t => t.source !== 'ics');
  st.papers = []; st.projects = [];
  (old.projects || []).forEach(p => {
    const base = {
      id: p.id || uid(), title: p.title || '', progress: Number(p.progress) || 0,
      deadline: p.deadline || '', next: p.next || '', note: p.note || '',
      status: p.status || 'active', archivedAt: p.archivedAt || '', outcome: p.outcome || '', directionId: ''
    };
    if (p.type === 'paper') st.papers.push(Object.assign(base, { targetJournal: p.targetJournal || '', stages: PAPER_STAGES.slice(), stageIdx: Math.max(0, PAPER_STAGES.indexOf(p.stage || '')) }));
    else st.projects.push(Object.assign(base, { kind: 'academic', stages: PROJECT_KINDS.academic.stages.slice(), stageIdx: 0 }));
  });
  (old.tasks || []).filter(t => t.source === 'ics').forEach(t => {
    st.calendar.push({ id: uid(), title: t.title || '日历事件', date: t.date || todayStr(), end: '', type: '其他', note: t.note || '' });
  });
}
function normalize(st) {
  Object.keys(DEFAULT_STATE).forEach(k => { if (!Array.isArray(st[k])) st[k] = []; });
  /* 兼容 v1 老数据：把旧 projects（含 paper/project 两类）拆到 papers / projects */
  if (st.projects && st.projects.some(p => p.type && !p.kind && p.status !== undefined && 'stage' in p)) {
    const legacy = st.projects.filter(p => p.type);
    legacy.forEach(p => {
      const base = {
        id: p.id || uid(), title: p.title || '', progress: Number(p.progress) || 0,
        deadline: p.deadline || '', next: p.next || '', note: p.note || '',
        status: p.status || 'active', archivedAt: p.archivedAt || '', outcome: p.outcome || '', directionId: ''
      };
      if (p.type === 'paper') {
        st.papers.push(Object.assign(base, { targetJournal: p.targetJournal || '', stages: PAPER_STAGES.slice(), stageIdx: Math.max(0, PAPER_STAGES.indexOf(p.stage)) }));
      } else {
        st.projects2 = st.projects2 || [];
        st.projects2.push(Object.assign(base, { kind: 'academic', stages: PROJECT_KINDS.academic.stages.slice(), stageIdx: 0 }));
      }
    });
    if (st.projects2) { st.projects = st.projects2; delete st.projects2; }
    else st.projects = st.projects.filter(p => !p.type);
  }
  st.tasks.forEach(t => { t.done = !!t.done; if (!t.id) t.id = uid(); });
  st.papers.forEach(p => {
    if (!Array.isArray(p.stages) || !p.stages.length) p.stages = PAPER_STAGES.slice();
    if (typeof p.stageIdx !== 'number') p.stageIdx = Math.min(p.stages.length - 1, Math.max(0, p.stages.indexOf(p.stage || '')));
    p.progress = Number(p.progress) || 0;
  });
  st.projects.forEach(p => {
    if (!Array.isArray(p.stages) || !p.stages.length) p.stages = (PROJECT_KINDS[p.kind] || PROJECT_KINDS.academic).stages.slice();
    if (typeof p.stageIdx !== 'number') p.stageIdx = Math.min(p.stages.length - 1, Math.max(0, p.stages.indexOf(p.stage || '')));
    p.progress = Number(p.progress) || 0;
  });
  st.habits.forEach(h => { if (!h.records || typeof h.records !== 'object') h.records = {}; });
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

function adoptCloud(cloud) {
  /* 保留本地已填写的凭据：云端拉取绝不允许冲掉 Bin/APIKey */
  const keepBin = S.settings.binId, keepKey = S.settings.apiKey;
  const cloudBin = (cloud.settings && cloud.settings.binId) || '';
  const cloudKey = (cloud.settings && cloud.settings.apiKey) || '';
  S = normalize(Object.assign(structuredClone(DEFAULT_STATE), cloud, {
    settings: Object.assign({}, DEFAULT_STATE.settings, cloud.settings || {})
  }));
  S.settings.binId = keepBin || cloudBin;
  S.settings.apiKey = keepKey || cloudKey;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  renderAll();
}

function updateSyncBadge(status, detail) {
  const b = $('#syncBadge'); if (!b) return;
  const map = { off: ['未同步', 'sync--off'], syncing: ['同步中', 'sync--busy'], ok: ['已同步', 'sync--ok'], error: ['同步异常', 'sync--err'] };
  const [txt, cls] = map[status] || ['', ''];
  b.className = 'sync-badge ' + cls; b.textContent = txt; b.title = detail || txt;
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
    fields.forEach(f => {
      let val = form.elements[f.k].value;
      data[f.k] = f.trim === false ? val : val.trim();
    });
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
const CAL_TYPE_COLOR = { 科研: 'var(--clay)', 生活: 'var(--green)', 其他: 'var(--line-strong)' };

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

  renderCalendar();
  renderTodayResearch();

  const list = $('#taskList');
  const items = S.tasks.filter(taskInRange)
    .sort((a, b) => (a.done - b.done) || (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));
  list.innerHTML = items.length ? '' : `<div class="empty">${taskFilter === 'today' ? '今天还没有任务，点右下角加一条' : '暂无任务'}</div>`;
  items.forEach(t => list.appendChild(taskRow(t, today)));

  const dl = $('#deadlineList');
  const tracks = [...S.papers, ...S.projects];
  const soon = tracks.filter(p => p.status !== 'archived' && p.deadline)
    .map(p => ({ p, d: dayDiff(p.deadline, today) }))
    .filter(x => x.d <= 45).sort((a, b) => a.d - b.d).slice(0, 5);
  dl.innerHTML = soon.length ? '' : '<div class="empty">近期没有截止事项</div>';
  soon.forEach(({ p, d }) => {
    const tag = d < 0 ? `已逾期 ${-d} 天` : d === 0 ? '今天截止' : `还剩 ${d} 天`;
    const kind = S.papers.includes(p) ? '论文' : '项目';
    dl.appendChild(el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(p.title)}</div>
      <div class="row-meta"><span class="chip-tag">${kind}·${esc(p.stages[p.stageIdx] || '进行中')}</span>
        <span class="due" style="${d <= 3 ? 'color:var(--clay)' : ''}">${tag}</span><span>${p.progress || 0}%</span></div>
    </div></div>`));
  });

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

/* ---- 站内日历 ---- */
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth(), calSelDate = todayStr();

function renderCalendar() {
  $('#calMonthLabel').textContent = `${calYear} 年 ${calMonth + 1} 月`;
  const grid = $('#calGrid'); grid.innerHTML = '';
  const first = new Date(calYear, calMonth, 1);
  const startW = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayStr();
  // 收集标记
  const marks = {};
  const addMark = (date, kind) => { if (date) (marks[date] = marks[date] || new Set()).add(kind); };
  S.tasks.forEach(t => { if (t.date) addMark(t.date, 'task'); });
  [...S.papers, ...S.projects].forEach(p => { if (p.deadline && p.status !== 'archived') addMark(p.deadline, 'deadline'); });
  S.calendar.forEach(e => { if (e.date) addMark(e.date, 'event'); });

  for (let i = 0; i < startW; i++) grid.appendChild(el('<div class="cal-cell cal-cell--empty"></div>'));
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const m = marks[ds];
    const dots = m ? Array.from(m).map(k => `<i class="cal-dot cal-dot--${k}"></i>`).join('') : '';
    const cell = el(`<div class="cal-cell ${ds === today ? 'is-today' : ''} ${ds === calSelDate ? 'is-sel' : ''}" data-date="${ds}">
      <span class="cal-day">${d}</span><div class="cal-dots">${dots}</div></div>`);
    cell.onclick = () => { calSelDate = ds; renderCalendar(); renderCalDetail(); };
    grid.appendChild(cell);
  }
  renderCalDetail();
}

function renderCalDetail() {
  const box = $('#calDetail');
  const date = calSelDate;
  const tasks = S.tasks.filter(t => t.date === date);
  const dls = [...S.papers, ...S.projects].filter(p => p.deadline === date && p.status !== 'archived');
  const evts = S.calendar.filter(e => e.date === date);
  let html = `<div class="cal-detail-head"><span>${date.slice(5)}</span>
    <button class="soft-btn soft-btn--quiet" id="calAddEvt">＋ 添加阶段性事件</button></div>`;
  if (!tasks.length && !dls.length && !evts.length) html += '<div class="empty">这一天暂无安排</div>';
  const sec = (label, arr, render) => arr.length ? `<div class="cal-sec"><div class="cal-sec-label">${label}</div>${arr.map(render).join('')}</div>` : '';
  html += sec('任务', tasks, t => `<div class="cal-item"><i class="cal-dot cal-dot--task"></i><span class="${t.done ? 'cal-done' : ''}">${esc(t.title)}</span></div>`);
  html += sec('截止', dls, p => `<div class="cal-item"><i class="cal-dot cal-dot--deadline"></i><span>${esc(p.title)} <em>${esc(p.stages[p.stageIdx] || '')}</em></span></div>`);
  html += sec('事件', evts, e => `<div class="cal-item"><i class="cal-dot cal-dot--event"></i><span>${esc(e.title)} ${e.type ? `<em class="cal-ev-type">${esc(e.type)}</em>` : ''}</span>
    <button class="mini-icon ed" data-ev="${e.id}" title="编辑">${ICON.edit}</button>
    <button class="mini-icon del" data-evd="${e.id}" title="删除">${ICON.del}</button></div>`);
  box.innerHTML = html;
  $('#calAddEvt').onclick = () => editCalEvent(null, date);
  box.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { const ev = S.calendar.find(x => x.id === b.dataset.ev); if (ev) editCalEvent(ev); });
  box.querySelectorAll('[data-evd]').forEach(b => b.onclick = () => confirmDel('这条阶段性事件', () => { S.calendar = S.calendar.filter(x => x.id !== b.dataset.evd); save(); renderCalendar(); }));
}

function editCalEvent(e, prefillDate) {
  const isNew = !e;
  const v = e || { title: '', date: prefillDate || calSelDate, end: '', type: '科研', note: '' };
  openForm(isNew ? '添加阶段性事件' : '编辑事件', [
    { k: 'title', label: '标题', ph: '例：开题答辩 / 组会汇报' },
    { k: 'date', label: '日期', type: 'date' },
    { k: 'end', label: '结束日（可选）', type: 'date' },
    { k: 'type', label: '类型', type: 'select', options: ['科研', '生活', '其他'] },
    { k: 'note', label: '备注', type: 'textarea', rows: 2 }
  ], v, d => {
    if (!d.title) { toast('请填写标题'); return false; }
    if (isNew) S.calendar.unshift({ id: uid(), ...d }); else Object.assign(e, d);
    save(); renderCalendar(); toast(isNew ? '已添加' : '已更新');
  });
}

function parseICS(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const unfolded = [];
  lines.forEach(l => { if (/^[ \t]/.test(l) && unfolded.length) unfolded[unfolded.length - 1] += l.slice(1); else unfolded.push(l); });
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
    else if (key === 'DTSTART') {
      const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
      if (m) { cur.date = m[4] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`; }
    }
  });
  return events;
}
function importICS(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let evts; try { evts = parseICS(String(fr.result)); } catch (e) { toast('文件解析失败'); return; }
    if (!evts.length) { toast('未在文件中找到日程'); return; }
    let n = 0;
    evts.forEach(e => {
      if (!e.date) return;
      if (S.calendar.some(x => x.title === e.title && x.date === e.date)) return;
      S.calendar.push({ id: uid(), title: e.title, date: e.date, end: '', type: '其他', note: '' });
      n++;
    });
    save(); renderCalendar(); toast(n ? `已导入 ${n} 条里程碑` : '没有新的日程可导入');
  };
  fr.readAsText(file, 'utf-8');
}

/* ---- 今日科研微区 ---- */
function renderTodayResearch() {
  const box = $('#todayResearch');
  let pair = [];
  if (feedPool && feedPool.length) pair = pickLivePair();
  else if (PAPER_SEEDS && PAPER_SEEDS.length) pair = dailyPapers();
  if (!pair.length) { box.innerHTML = '<div class="empty">今天还没有推荐，去科研页刷新</div>'; return; }
  box.innerHTML = '';
  pair.forEach(p => {
    const title = p.t || p.title || '';
    const row = el(`<div class="tr-item"><span class="tr-dot"></span>
      <span class="tr-title">${esc(title).slice(0, 38)}</span>
      <span class="tr-go" data-goto="research">去读 →</span></div>`);
    row.querySelector('[data-goto]').onclick = () => go('research');
    box.appendChild(row);
  });
}

function saveInspire() {
  const v = $('#inspireInput').value.trim();
  if (!v) { toast('先写点什么吧'); return; }
  S.inbox.unshift({ id: uid(), text: v, tag: '灵感', createdAt: new Date().toISOString() });
  $('#inspireInput').value = ''; save(); renderHome(); toast('已存入收集箱');
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
        <button class="soft-btn note">＋ 记笔记</button>
        <a class="soft-btn soft-btn--quiet" target="_blank" rel="noopener" href="https://scholar.google.com/scholar?q=${encodeURIComponent(p.en)}">学术检索</a>
      </div>
    </div>
  </article>`);
  c.querySelector('.paper-top').onclick = () => {
    c.classList.toggle('open');
    c.querySelector('.paper-toggle').textContent = c.classList.contains('open') ? '收起 ↑' : '展开全文要点 ↓';
  };
  c.querySelector('.note').onclick = e => { e.stopPropagation(); openNoteForPaper({ title: p.en || p.t, label: p.t }); };
  return c;
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
        <button class="soft-btn note">＋ 记笔记</button>
        ${p.doi ? `<a class="soft-btn soft-btn--quiet" target="_blank" rel="noopener" href="${esc(p.doi)}">原文 DOI</a>` : ''}
        <a class="soft-btn soft-btn--quiet" target="_blank" rel="noopener" href="https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}">学术检索</a>
      </div>
    </div>
  </article>`);
  c.querySelector('.paper-top').onclick = () => {
    c.classList.toggle('open');
    c.querySelector('.paper-toggle').textContent = c.classList.contains('open') ? '收起 ↑' : '展开摘要与解析 ↓';
  };
  c.querySelector('.note').onclick = e => { e.stopPropagation(); openNoteForPaper({ title: p.title, label: p.title }); };
  if (!tr) hydrateTranslation(p, c);
  return c;
}

function hydrateTranslation(p, card) {
  Translator.paper(p.id, p.title, p.abstract).then(tr => {
    if (!card.isConnected) return;
    const zt = card.querySelector('.zh-title'), za = card.querySelector('.zh-abs');
    if (zt) zt.textContent = tr.t;
    if (za) { za.textContent = tr.a; za.style.color = ''; }
  }).catch(() => {
    const za = card.querySelector('.zh-abs');
    if (za && card.isConnected) {
      za.innerHTML = '翻译暂不可用（网络原因），请阅读下方原文，或 <button class="ghost-btn" style="color:var(--accent)">重试</button>';
      za.querySelector('button').onclick = () => { za.textContent = '翻译中…'; hydrateTranslation(p, card); };
    }
  });
}

function boostByDirections(pool) {
  if (!S.directions.length) return pool;
  const kws = S.directions.flatMap(d => (d.keywords || '').split(/[,，\s]+/).filter(Boolean));
  if (!kws.length) return pool;
  return pool.slice().sort((a, b) => {
    const score = it => {
      const hay = ((it.title || '') + ' ' + (it.abstract || '') + ' ' + (it.topics || []).join(' ')).toLowerCase();
      return kws.filter(k => hay.includes(k.toLowerCase())).length;
    };
    return score(b) - score(a);
  });
}

function pickLivePair() {
  if (!feedPool || !feedPool.length) return [];
  const pool = boostByDirections(feedPool);
  const pairs = Math.max(1, Math.floor(pool.length / 2));
  const dayNum = Math.floor(new Date(todayStr()).getTime() / 86400000);
  const idx = ((dayNum + (S.settings.paperShift || 0)) % pairs + pairs) % pairs;
  return pool.slice(idx * 2, idx * 2 + 2);
}

function renderPaperDaily() {
  const wrap = $('#paperDaily');
  const mode = S.settings.feedMode || 'live';
  $$('#paperMode button').forEach(b => b.classList.toggle('is-active', b.dataset.pm === mode));
  $('#paperRefresh').style.display = mode === 'live' ? '' : 'none';
  if (mode === 'seed') {
    wrap.innerHTML = ''; $('#paperDate').textContent = todayStr().slice(5) + ' · 经典库';
    dailyPapers().forEach(p => wrap.appendChild(paperCard(p)));
    return;
  }
  if (feedPool) {
    wrap.innerHTML = ''; $('#paperDate').textContent = todayStr().slice(5) + ' · 实时';
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
  Feed.fetchLatest(todayStr(), !!force).then(r => { feedPool = r.pool; feedLoading = false; if (currentPage === 'research') renderPaperDaily(); if (!r.fromCache) toast(`已获取 ${r.pool.length} 篇近期顶刊论文`); })
    .catch(() => { feedLoading = false; feedError = true; if (currentPage === 'research') renderPaperDaily(); });
}

/* ---- 研读笔记 ---- */
function openNoteForPaper(p) {
  openNoteEditor({ paperTitle: p.title });
}
function openNoteEditor(prefill) {
  const v = prefill || {};
  openForm('写研读笔记', [
    { k: 'text', label: '笔记内容', type: 'textarea', rows: 5, ph: '这篇的关键想法 / 可借鉴的方法 / 对我的选题有什么用', def: v.text || '' },
    { k: 'paperTitle', label: '关联论文（可选）', ph: '论文标题', def: v.paperTitle || '' },
    { k: 'directionId', label: '关联方向（可选）', type: 'select', options: [{ v: '', l: '不关联' }].concat(S.directions.map(d => ({ v: d.id, l: d.name }))) }
  ], v, d => {
    if (!d.text.trim() && !d.paperTitle.trim()) { toast('写点内容吧'); return false; }
    S.researchNotes.unshift({ id: uid(), text: d.text.trim(), paperTitle: d.paperTitle.trim(), directionId: d.directionId || '', createdAt: new Date().toISOString() });
    save(); renderResearch(); toast('笔记已保存');
  });
}

/* ---- 论文 / 项目 追踪 ---- */
let paperTrackFilter = 'active', projTrackFilter = 'active';

function trackCard(item, kind) {
  const today = todayStr();
  const d = item.deadline ? dayDiff(item.deadline, today) : null;
  const dtxt = d == null ? '未设截止' : d < 0 ? `逾期 ${-d} 天` : d === 0 ? '今天截止' : `剩 ${d} 天`;
  const stageName = item.stages[item.stageIdx] || '进行中';
  const dir = S.directions.find(x => x.id === item.directionId);
  const c = el(`<div class="proj">
    <div class="proj-head">
      <div style="flex:1;min-width:0">
        <div class="proj-title">${esc(item.title)}</div>
        <div class="proj-tags">
          ${kind === 'paper' ? '<span class="chip-tag">论文</span>' : `<span class="chip-tag">项目·${(PROJECT_KINDS[item.kind] || PROJECT_KINDS.academic).label}</span>`}
          <span class="stage" style="background:var(--accent-soft);color:var(--accent)">${esc(stageName)}</span>
          ${dir ? `<span class="chip-mini" style="border-color:var(--accent)">${esc(dir.name)}</span>` : ''}
          ${item.targetJournal ? `<span class="chip-mini">${esc(item.targetJournal)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="proj-bar"><i style="width:${clamp(Number(item.progress) || 0, 0, 100)}%"></i></div>
    <div class="proj-info"><span>进度 ${clamp(Number(item.progress) || 0, 0, 100)}%</span>
      <span style="${d != null && d <= 7 ? 'color:var(--clay)' : ''}">${esc(item.deadline || '')} ${dtxt}</span></div>
    ${item.next ? `<div class="proj-next"><b>下一步</b>${esc(item.next)}</div>` : ''}
    <div class="proj-foot">
      <button class="soft-btn plus">推进 +10%</button>
      <button class="soft-btn soft-btn--quiet nxt">下一阶段</button>
      <button class="soft-btn soft-btn--quiet ed">编辑</button>
      <button class="soft-btn soft-btn--quiet ar">归档</button>
      <button class="soft-btn soft-btn--quiet del">删除</button>
    </div>
  </div>`);
  c.querySelector('.plus').onclick = () => {
    item.progress = clamp((Number(item.progress) || 0) + 10, 0, 100);
    if (item.progress === 100) toast('已到 100%，可以归档啦');
    save(); renderAll();
  };
  c.querySelector('.nxt').onclick = () => {
    item.stageIdx = Math.min(item.stageIdx + 1, item.stages.length - 1);
    item.progress = Math.round(item.stageIdx / (item.stages.length - 1) * 100) || (Number(item.progress) || 0);
    save(); renderAll();
  };
  c.querySelector('.ed').onclick = () => editTrack(item, kind);
  c.querySelector('.ar').onclick = () => archiveTrack(item, kind);
  c.querySelector('.del').onclick = () => confirmDel(`「${item.title}」`, () => {
    if (kind === 'paper') S.papers = S.papers.filter(x => x.id !== item.id);
    else S.projects = S.projects.filter(x => x.id !== item.id);
    save(); renderAll();
  });
  return c;
}

function editTrack(item, kind) {
  const isNew = !item;
  const v = item || (kind === 'paper'
    ? { title: '', targetJournal: '', stages: PAPER_STAGES.slice(), stageIdx: 0, progress: 0, deadline: '', next: '', directionId: '' }
    : { title: '', kind: 'academic', stages: PROJECT_KINDS.academic.stages.slice(), stageIdx: 0, progress: 0, deadline: '', next: '', directionId: '' });
  const stageOpts = (v.stages || []).map((s, i) => ({ v: String(i), l: s }));
  const fields = kind === 'paper' ? [
    { k: 'title', label: '论文题目', ph: '例：数字化转型对制造企业全要素生产率的影响' },
    { k: 'targetJournal', label: '目标期刊（可选）', ph: '例：管理世界' },
    { k: 'directionId', label: '关联方向', type: 'select', options: [{ v: '', l: '不关联' }].concat(S.directions.map(d => ({ v: d.id, l: d.name }))) },
    { k: 'stageIdx', label: '当前阶段', type: 'select', options: stageOpts },
    { k: 'progress', label: '进度 %', type: 'number', min: 0, max: 100, step: 5 },
    { k: 'deadline', label: '截止日期', type: 'date' },
    { k: 'next', label: '下一步动作', type: 'textarea', rows: 2, ph: '写得越具体，越容易开始' },
    { k: 'stages', label: '阶段清单（逗号分隔，可自定义）', type: 'textarea', rows: 2, ph: PAPER_STAGES.join('、'), def: (v.stages || []).join('、') }
  ] : [
    { k: 'title', label: '项目名称', ph: '例：省科技厅软科学课题' },
    { k: 'kind', label: '项目类型', type: 'select', options: Object.entries(PROJECT_KINDS).map(([k, o]) => ({ v: k, l: o.label })) },
    { k: 'directionId', label: '关联方向', type: 'select', options: [{ v: '', l: '不关联' }].concat(S.directions.map(d => ({ v: d.id, l: d.name }))) },
    { k: 'stageIdx', label: '当前阶段', type: 'select', options: stageOpts },
    { k: 'progress', label: '进度 %', type: 'number', min: 0, max: 100, step: 5 },
    { k: 'deadline', label: '截止日期', type: 'date' },
    { k: 'next', label: '下一步动作', type: 'textarea', rows: 2, ph: '写得越具体，越容易开始' },
    { k: 'stages', label: '阶段清单（逗号分隔，可自定义）', type: 'textarea', rows: 2, ph: '阶段一、阶段二…', def: (v.stages || []).join('、') }
  ];
  openForm(isNew ? (kind === 'paper' ? '新建论文' : '新建项目') : '编辑', fields, v, d => {
    if (!d.title) { toast('请填写名称'); return false; }
    d.progress = clamp(Number(d.progress) || 0, 0, 100);
    d.stageIdx = Number(d.stageIdx) || 0;
    const stages = (d.stages || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    if (stages.length) { d.stages = stages; if (d.stageIdx >= stages.length) d.stageIdx = stages.length - 1; }
    else d.stages = v.stages || (kind === 'paper' ? PAPER_STAGES.slice() : PROJECT_KINDS.academic.stages.slice());
    if (isNew) {
      const base = { id: uid(), status: 'active', next: d.next || '', progress: d.progress, deadline: d.deadline || '', directionId: d.directionId || '', note: '' };
      if (kind === 'paper') S.papers.push(Object.assign(base, { title: d.title, targetJournal: d.targetJournal || '', stages: d.stages, stageIdx: d.stageIdx }));
      else S.projects.push(Object.assign(base, { title: d.title, kind: d.kind || 'academic', stages: d.stages, stageIdx: d.stageIdx }));
    } else {
      Object.assign(item, { title: d.title, stageIdx: d.stageIdx, stages: d.stages, progress: d.progress, deadline: d.deadline || '', next: d.next || '', directionId: d.directionId || '' });
      if (kind === 'paper') item.targetJournal = d.targetJournal || ''; else item.kind = d.kind || item.kind;
    }
    save(); renderAll();
  });
}

function archiveTrack(item, kind) {
  openForm('归档为成果', [
    { k: 'outcome', label: '成果说明', type: 'textarea', rows: 2, ph: '例：论文录用 / 项目通过验收 / 结题报告已提交' },
    { k: 'date', label: '归档日期', type: 'date', def: todayStr() }
  ], { date: todayStr(), outcome: item.outcome || '' }, d => {
    item.status = 'archived'; item.outcome = d.outcome; item.archivedAt = d.date || todayStr(); item.progress = 100;
    const atype = kind === 'paper' ? 'paper' : (item.kind === 'competition' ? 'competition' : 'project');
    S.achievements.unshift({ id: uid(), title: item.title, type: atype, directionId: item.directionId || '', date: item.archivedAt, outcome: d.outcome, note: '' });
    save(); renderAll(); toast('已归档到成果记录中心');
  });
}

/* ---- 研究方向 ---- */
function renderDirections() {
  const box = $('#dirList'); $('#dirCount').textContent = S.directions.length + ' 个';
  if (!S.directions.length) { box.innerHTML = '<div class="empty">还没有研究方向。定义 2–4 个方向，既能聚焦积累，也会加权顶刊推荐。</div>'; return; }
  box.innerHTML = '';
  S.directions.forEach(dir => {
    const notes = S.researchNotes.filter(n => n.directionId === dir.id).length;
    const tracks = [...S.papers, ...S.projects].filter(p => p.directionId === dir.id).length;
    const c = el(`<div class="dir">
      <div class="dir-head"><div style="flex:1;min-width:0">
        <div class="dir-name">${esc(dir.name)}</div>
        <div class="dir-meta"><span class="chip-mini">笔记 ${notes}</span><span class="chip-mini">追踪 ${tracks}</span></div>
        ${dir.keywords ? `<div class="dir-kw">${dir.keywords.split(/[,，\s]+/).filter(Boolean).map(k => `<span class="chip-tag">${esc(k)}</span>`).join('')}</div>` : ''}
        ${dir.note ? `<div class="dir-note">${esc(dir.note)}</div>` : ''}
      </div><div class="row-actions">
        <button class="mini-icon ed" title="编辑">${ICON.edit}</button>
        <button class="mini-icon del" title="删除">${ICON.del}</button>
      </div></div>
    </div>`);
    c.querySelector('.ed').onclick = () => editDirection(dir);
    c.querySelector('.del').onclick = () => confirmDel(`方向「${dir.name}」`, () => {
      S.directions = S.directions.filter(x => x.id !== dir.id);
      S.papers.forEach(p => { if (p.directionId === dir.id) p.directionId = ''; });
      S.projects.forEach(p => { if (p.directionId === dir.id) p.directionId = ''; });
      S.researchNotes.forEach(n => { if (n.directionId === dir.id) n.directionId = ''; });
      save(); renderResearch();
    });
    box.appendChild(c);
  });
}
function editDirection(dir) {
  const isNew = !dir;
  openForm(isNew ? '新建研究方向' : '编辑方向', [
    { k: 'name', label: '方向名称', ph: '例：数字化转型与企业生产率' },
    { k: 'keywords', label: '关键词（逗号分隔，用于加权推荐）', ph: '例：digital transformation, productivity, AI', def: (dir && dir.keywords) || '' },
    { k: 'note', label: '方向说明', type: 'textarea', rows: 2, ph: '这个方向我想解决什么问题', def: (dir && dir.note) || '' }
  ], dir || {}, d => {
    if (!d.name) { toast('请填写方向名称'); return false; }
    if (isNew) S.directions.push({ id: uid(), name: d.name, keywords: d.keywords, note: d.note });
    else Object.assign(dir, d);
    save(); renderResearch(); toast(isNew ? '已添加' : '已更新');
  });
}

/* ---- 成果档案 ---- */
function exportAchievements() {
  if (!S.achievements.length) { toast('暂无归档成果'); return; }
  const sorted = S.achievements.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let md = `# 个人成果记录\n\n生成时间：${todayStr()}\n\n`;
  ACH_TYPES.forEach(t => {
    const g = sorted.filter(a => a.type === t.v);
    if (!g.length) return;
    md += `## ${t.l}（${g.length}）\n\n`;
    g.forEach((a, i) => {
      const dir = S.directions.find(d => d.id === a.directionId);
      md += `${i + 1}. **${a.title}**\n   - 归档日期：${a.date || '—'}\n   - 成果说明：${a.outcome || '—'}\n   - 方向：${dir ? dir.name : '—'}\n\n`;
    });
  });
  download('个人成果记录_' + todayStr() + '.md', md, 'text/markdown');
  toast('成果清单已导出');
}

function renderResearch() {
  renderPaperDaily();
  /* 论文追踪 */
  const pw = $('#paperTrackList'); pw.innerHTML = '';
  const pf = S.papers.filter(p => paperTrackFilter === 'all' || p.status === paperTrackFilter);
  if (!pf.length) pw.innerHTML = '<div class="empty">还没有追踪的论文，点「＋ 新建论文」</div>';
  pf.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.stageIdx - b.stageIdx).forEach(p => pw.appendChild(trackCard(p, 'paper')));
  /* 项目追踪 */
  const pjw = $('#projTrackList'); pjw.innerHTML = '';
  const pjf = S.projects.filter(p => projTrackFilter === 'all' || p.status === projTrackFilter);
  if (!pjf.length) pjw.innerHTML = '<div class="empty">还没有追踪的项目，点「＋ 新建项目」</div>';
  pjf.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.stageIdx - b.stageIdx).forEach(p => pjw.appendChild(trackCard(p, 'project')));
  /* 方向 / 笔记 / 成果 */
  renderDirections();
  const nl = $('#noteList'); $('#noteCount').textContent = S.researchNotes.length + ' 条';
  if (!S.researchNotes.length) nl.innerHTML = '<div class="empty">还没有笔记，读顶刊时点「记笔记」</div>';
  S.researchNotes.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach(n => {
    const dir = S.directions.find(d => d.id === n.directionId);
    const row = el(`<div class="row"><div class="row-main">
      <div class="row-title" style="font-weight:400">${esc(n.text)}</div>
      <div class="row-meta">
        ${n.paperTitle ? `<span class="chip-tag">${esc(n.paperTitle).slice(0, 30)}</span>` : ''}
        ${dir ? `<span class="chip-mini">${esc(dir.name)}</span>` : ''}
        <span>${esc((n.createdAt || '').slice(0, 16).replace('T', ' '))}</span>
      </div>
    </div><div class="row-actions"><button class="mini-icon del" title="删除">${ICON.del}</button></div></div>`);
    nl.appendChild(row);
    row.querySelector('.del').onclick = () => confirmDel('这条笔记', () => { S.researchNotes = S.researchNotes.filter(x => x.id !== n.id); save(); renderResearch(); });
  });
  /* 成果 */
  const arch = S.achievements;
  $('#archCount').textContent = arch.length + ' 项';
  const byType = {};
  ACH_TYPES.forEach(t => byType[t.v] = arch.filter(a => a.type === t.v).length);
  $('#achStats').innerHTML = `<div class="ach-stat"><b>${arch.length}</b><span>累计成果</span></div>` +
    ACH_TYPES.map(t => `<div class="ach-stat"><b class="accent-blue">${byType[t.v]}</b><span>${t.l}</span></div>`).join('');
  const al = $('#archList');
  al.innerHTML = arch.length ? '' : '<div class="empty">完成论文或项目后点「归档」，成果会沉淀在这里</div>';
  arch.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(a => {
    const dir = S.directions.find(d => d.id === a.directionId);
    const typeLabel = (ACH_TYPES.find(t => t.v === a.type) || { l: a.type }).l;
    const r = el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(a.title)}</div>
      <div class="row-meta"><span class="chip-tag">${esc(typeLabel)}</span>
        <span>归档于 ${esc(a.date || '—')}</span>${dir ? `<span class="chip-mini">${esc(dir.name)}</span>` : ''}${a.outcome ? `<span>${esc(a.outcome)}</span>` : ''}</div>
    </div><div class="row-actions">
      <button class="mini-icon ed" title="编辑">${ICON.edit}</button>
      <button class="mini-icon del" title="删除">${ICON.del}</button>
    </div></div>`);
    r.querySelector('.ed').onclick = () => openForm('成果信息', [
      { k: 'title', label: '名称' },
      { k: 'type', label: '类型', type: 'select', options: ACH_TYPES },
      { k: 'outcome', label: '成果说明', type: 'textarea', rows: 2 },
      { k: 'date', label: '归档日期', type: 'date' }
    ], a, d => { Object.assign(a, d); save(); renderAll(); });
    r.querySelector('.del').onclick = () => confirmDel(`成果「${a.title}」`, () => { S.achievements = S.achievements.filter(x => x.id !== a.id); save(); renderAll(); });
    al.appendChild(r);
  });
}

/* ============================================================
   生活页
   ============================================================ */
let lifeTab = 'sport';

function renderLife() {
  $$('.life-panel').forEach(p => p.classList.toggle('is-active', p.id === 'life-' + lifeTab));
  renderSport(); renderMedia(); renderTravel(); renderHabit();
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

/* ---- 阅读观影（深度阅读） ---- */
function renderMedia() {
  const bl = $('#bookList');
  bl.innerHTML = S.books.length ? '' : '<div class="empty">还没有书</div>';
  S.books.forEach(b => {
    const row = el(`<div class="row"><div class="row-main">
      <div class="row-title">${esc(b.title)}</div>
      <div class="row-meta"><span class="chip-tag">${esc(b.status)}</span>${b.author ? `<span>${esc(b.author)}</span>` : ''}<span>${b.progress || 0}%</span>${b.rating ? `<span>${'★'.repeat(Number(b.rating))}</span>` : ''}</div>
      ${b.note ? `<div class="row-meta" style="color:var(--text-2);margin-top:4px">📝 ${esc(b.note)}</div>` : ''}
    </div><div class="row-actions"><button class="mini-icon note" title="深度阅读笔记">${ICON.star}</button><button class="mini-icon ed">${ICON.edit}</button><button class="mini-icon del">${ICON.del}</button></div></div>`);
    row.querySelector('.ed').onclick = () => editBook(b);
    row.querySelector('.note').onclick = () => editBookNote(b);
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
    { k: 'title', label: '书名' }, { k: 'author', label: '作者' },
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
function editBookNote(b) {
  openForm('深度阅读笔记 · ' + (b.title || ''), [
    { k: 'core', label: '核心问题', type: 'textarea', rows: 2, ph: '这本书/文献想回答什么', def: (b.deep && b.deep.core) || '' },
    { k: 'framework', label: '理论框架', type: 'textarea', rows: 2, ph: '用了什么理论视角', def: (b.deep && b.deep.framework) || '' },
    { k: 'method', label: '研究方法 / 可取之处', type: 'textarea', rows: 2, ph: '方法能否迁移到我的研究', def: (b.deep && b.deep.method) || '' },
    { k: 'critique', label: '批判性思考', type: 'textarea', rows: 2, ph: '局限、与我的方向如何结合', def: (b.deep && b.deep.critique) || '' },
    { k: 'directionId', label: '关联方向', type: 'select', options: [{ v: '', l: '不关联' }].concat(S.directions.map(d => ({ v: d.id, l: d.name }))) }
  ], b.deep || {}, d => {
    b.deep = { core: d.core, framework: d.framework, method: d.method, critique: d.critique };
    b.directionId = d.directionId || '';
    if (b.directionId) {
      const dir = S.directions.find(x => x.id === b.directionId);
      const txt = `《${b.title}》阅读笔记：核心问题——${d.core || '—'}；可取之处——${d.method || '—'}；批判——${d.critique || '—'}`;
      S.researchNotes.unshift({ id: uid(), text: txt, paperTitle: b.title, directionId: b.directionId, createdAt: new Date().toISOString() });
      toast('已存入研读笔记' + (dir ? `（${dir.name}）` : ''));
    } else toast('阅读笔记已保存');
    save(); renderAll();
  });
}
function editMovie(mv) {
  const isNew = !mv;
  openForm(isNew ? '新增影片' : '编辑影片', [
    { k: 'title', label: '片名' }, { k: 'date', label: '观看日期', type: 'date', def: todayStr() },
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

/* ---- 习惯打卡 ---- */
function habitStreak(h) {
  let streak = 0; const d = new Date();
  while (h.records[ymd(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function renderHabit() {
  const w = $('#habitList');
  if (!S.habits.length) { w.innerHTML = '<div class="empty">添加一个习惯，每天点一下打卡，连续天数会累计。</div>'; return; }
  w.innerHTML = '';
  const today = todayStr();
  S.habits.forEach(h => {
    const done = !!h.records[today];
    const streak = habitStreak(h);
    // 最近 21 天热力图
    let dots = '';
    for (let i = 20; i >= 0; i--) { const d = ymd(new Date(Date.now() - i * 86400000)); dots += `<i class="hb-dot ${h.records[d] ? 'on' : ''}"></i>`; }
    const c = el(`<div class="habit">
      <div class="habit-top">
        <div style="flex:1;min-width:0"><div class="habit-name">${esc(h.name)}</div>
          <div class="habit-meta"><span class="chip-mini">连续 ${streak} 天</span></div></div>
        <button class="hb-toggle ${done ? 'on' : ''}">${done ? '已打卡 ✓' : '今日打卡'}</button>
        <div class="row-actions"><button class="mini-icon ed">${ICON.edit}</button><button class="mini-icon del">${ICON.del}</button></div>
      </div>
      <div class="hb-heat">${dots}</div>
    </div>`);
    c.querySelector('.hb-toggle').onclick = () => {
      if (h.records[today]) delete h.records[today]; else h.records[today] = true;
      save(); renderAll();
    };
    c.querySelector('.ed').onclick = () => openForm('编辑习惯', [{ k: 'name', label: '习惯名称', ph: '例：每天阅读 30 分钟' }], h, d => {
      if (!d.name) { toast('请填写名称'); return false; } h.name = d.name; save(); renderAll();
    });
    c.querySelector('.del').onclick = () => confirmDel(`习惯「${h.name}」`, () => { S.habits = S.habits.filter(x => x.id !== h.id); save(); renderAll(); });
    w.appendChild(c);
  });
}
function addHabit() { openForm('新增习惯', [{ k: 'name', label: '习惯名称', ph: '例：每天阅读 30 分钟 / 运动 / 冥想' }], {}, d => {
  if (!d.name) { toast('请填写名称'); return false; } S.habits.push({ id: uid(), name: d.name, records: {} }); save(); renderAll();
}); }

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
  const arch = S.achievements.filter(a => inR(a.date));
  const activeP = [...S.papers, ...S.projects].filter(p => p.status !== 'archived');
  const avgProg = activeP.length ? Math.round(activeP.reduce((a, p) => a + (Number(p.progress) || 0), 0) / activeP.length) : 0;
  const notesN = S.researchNotes.filter(n => inR((n.createdAt || '').slice(0, 10))).length;
  $('#rvResearch').innerHTML = [
    ['进行中论文', S.papers.filter(p => p.status !== 'archived').length + ' 篇'],
    ['进行中项目', S.projects.filter(p => p.status !== 'archived').length + ' 个'],
    ['平均进度', avgProg + '%'],
    ['本期归档成果', arch.length + ' 项'],
    ['本期新增笔记', notesN + ' 条'],
    ['研究方向', S.directions.length + ' 个']
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

  /* 阅读与思考 */
  const deepBooks = S.books.filter(b => b.deep && (Object.values(b.deep).some(v => v)));
  $('#rvReading').innerHTML = [
    ['深度阅读笔记', deepBooks.length + ' 本'],
    ['研读笔记总数', S.researchNotes.length + ' 条'],
    ['本期新增笔记', notesN + ' 条'],
    ['累计读完', readDone + ' 本']
  ].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join('');

  /* 习惯 */
  const hb = S.habits.map(h => ({ name: h.name, streak: habitStreak(h) }));
  $('#rvHabit').innerHTML = hb.length
    ? hb.map(h => `<div class="kv"><span>${esc(h.name)}</span><span>连续 ${h.streak} 天</span></div>`).join('')
    : '<div class="empty">还没有习惯</div>';

  /* 文字小结 */
  const rangeName = { week: '本周', month: '本月', year: '今年' }[reviewRange];
  const rate = tAll ? Math.round(tDone / tAll * 100) : 0;
  let txt = `${rangeName}共安排 ${tAll} 项任务，完成 ${tDone} 项，完成率 ${rate}%。`;
  txt += rate >= 80 ? '节奏保持得很好。' : rate >= 50 ? '整体推进正常，可以再收紧一点计划密度。' : tAll ? '完成率偏低，建议把大任务拆成更小的下一步动作。' : '还没有记录任务，先从今天写下三件事开始。';
  txt += ` 科研方面有 ${activeP.length} 项在推进，平均进度 ${avgProg}%${arch.length ? `，${rangeName}归档了 ${arch.length} 项成果` : ''}；研读笔记新增 ${notesN} 条。`;
  txt += ` 生活上运动 ${sp.length} 次、观影 ${mv.length} 部，累计读完 ${readDone} 本；习惯打卡${hb.length ? '：' + hb.map(h => `${h.name}${h.streak}天`).join('、') : '尚未开始'}。`;
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
  const count = S.tasks.length + S.inbox.length + S.calendar.length + S.papers.length + S.projects.length +
    S.directions.length + S.researchNotes.length + S.achievements.length + S.sports.length +
    S.books.length + S.movies.length + S.trips.length + S.habits.length;
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
    /* 凭据立即落盘，确保不丢；先拉云端再决定是否上传，避免覆盖已有云端数据 */
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    if (Sync.enabled()) Sync.startup(S, adoptCloud);
  };
  body.querySelector('#setBinId').onchange = bindSync;
  body.querySelector('#setApiKey').onchange = bindSync;
  body.querySelector('#btnTestSync').onclick = async () => {
    const r = $('#syncTestResult');
    if (!Sync.enabled()) { r.textContent = '请先填写 Bin ID 与 API Key'; r.style.color = 'var(--danger)'; return; }
    r.textContent = '同步中…'; r.style.color = '';
    try {
      const res = await Sync.syncNow(S, adoptCloud); // 按「最新编辑端为准」收敛
      if (res.action === 'off') { r.textContent = '请先填写 Bin ID 与 API Key'; r.style.color = 'var(--danger)'; }
      else if (res.action === 'error') { r.textContent = res.message; r.style.color = 'var(--danger)'; }
      else if (res.action === 'pull') { r.textContent = '连接成功 ✓ 已从云端拉取最新数据'; r.style.color = 'var(--ok)'; }
      else { r.textContent = '连接成功 ✓ 本机较新，已推到云端'; r.style.color = 'var(--ok)'; }
    }
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
  body.querySelector('#btnExport').onclick = () => { download(`研习台备份_${todayStr()}.json`, JSON.stringify(S, null, 2)); toast('已导出备份文件'); };
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
  S.directions.push(
    { id: uid(), name: '数字化转型与企业生产率', keywords: 'digital transformation, productivity, 全要素生产率', note: '关注 AI / 自动化对制造企业效率的因果识别' },
    { id: uid(), name: 'AI 与组织创新', keywords: 'AI, innovation, 组织', note: '人工智能采纳对研发与组织惯例的影响' }
  );
  const did = S.directions[0].id;
  S.papers.push(
    { id: uid(), title: '数字化转型对制造企业全要素生产率的影响', targetJournal: '管理世界', stages: PAPER_STAGES.slice(), stageIdx: 4, progress: 55, deadline: d(28), next: '补充中介效应检验并重跑稳健性', status: 'active', directionId: did, archivedAt: '', outcome: '' },
    { id: uid(), title: '工业机器人渗透度与企业创新产出', targetJournal: '经济研究', stages: PAPER_STAGES.slice(), stageIdx: 2, progress: 30, deadline: d(60), next: '构建城市-行业层面机器人存量', status: 'active', directionId: S.directions[1].id, archivedAt: '', outcome: '' }
  );
  S.projects.push(
    { id: uid(), title: '省科技厅软科学课题：区域创新效率评价', kind: 'academic', stages: PROJECT_KINDS.academic.stages.slice(), stageIdx: 1, progress: 30, deadline: d(60), next: '整理 2015—2024 年省级面板数据', status: 'active', directionId: did, archivedAt: '', outcome: '' }
  );
  S.achievements.push(
    { id: uid(), title: '本科毕业论文：智能制造与就业结构', type: 'paper', directionId: did, date: d(-120), outcome: '校级优秀毕业论文', note: '' }
  );
  S.calendar.push(
    { id: uid(), title: '开题答辩', date: d(10), end: '', type: '科研', note: '准备 15 分钟 PPT' },
    { id: uid(), title: '导师组会', date: d(2), end: '', type: '科研', note: '' }
  );
  S.researchNotes.push(
    { id: uid(), title: '', text: 'Bartik 工具变量思路：用行业层面机器人渗透度 × 地区行业就业份额做 IV，识别自动化对生产率的因果效应。', paperTitle: '', directionId: did, createdAt: new Date().toISOString() }
  );
  S.sports.push({ id: uid(), type: '跑步', minutes: 40, date: t, note: '5 公里' });
  S.books.push({ id: uid(), title: '技术与经济增长', author: '—', status: '在读', progress: 40, rating: '4', note: '第 3 章与选题相关' });
  S.movies.push({ id: uid(), title: '奥本海默', date: d(-6), rating: '5', note: '' });
  S.trips.push({ id: uid(), title: '成都 · 学术会议 + 短途', start: d(35), end: d(38), budget: 2600, note: '会议报销部分交通', items: [{ text: '提交参会回执', ok: true }, { text: '订往返机票', ok: false }] });
  S.habits.push({ id: uid(), name: '每天阅读 30 分钟', records: { [d(0)]: true, [d(-1)]: true, [d(-2)]: true } });
  S.inbox.push({ id: uid(), text: '能不能用工业机器人渗透度做 Bartik 工具变量？', tag: '选题', createdAt: new Date().toISOString() });
  save(); renderAll(); toast('示例数据已载入');
}

/* ============================================================
   快速记录
   ============================================================ */
let quickTag = '灵感';
function openQuick() { $('#quickMask').classList.add('show'); setTimeout(() => $('#quickText').focus(), 150); }
function closeQuick() { $('#quickMask').classList.remove('show'); }
function saveQuick(asTask) {
  const txt = $('#quickText').value.trim();
  if (!txt) { toast('先写点什么吧'); return; }
  if (asTask) { S.tasks.push({ id: uid(), title: txt.slice(0, 80), date: todayStr(), done: false, tag: quickTag === '待办' ? '' : quickTag, note: '' }); toast('已加入今日任务'); }
  else { S.inbox.unshift({ id: uid(), text: txt, tag: quickTag, createdAt: new Date().toISOString() }); toast('已存入收集箱'); }
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
  $('#taskFilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; taskFilter = b.dataset.tf; $$('#taskFilter button').forEach(x => x.classList.toggle('is-active', x === b)); renderHome(); };
  $('#calPrev').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); };
  $('#calNext').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); };
  $('#calToday').onclick = () => { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); calSelDate = todayStr(); renderCalendar(); };
  $('#icsInput').onchange = e => { const f = e.target.files[0]; if (f) importICS(f); e.target.value = ''; };
  $('#inboxMoreBtn').onclick = openInboxAll;
  $('#inspireSave').onclick = saveInspire;
  $('#inspireInput').onkeydown = e => { if (e.key === 'Enter') saveInspire(); };

  /* 科研 */
  $('#paperShuffle').onclick = () => { S.settings.paperShift = (S.settings.paperShift || 0) + 1; save(); renderPaperDaily(); };
  $('#paperRefresh').onclick = () => loadFeed(true);
  $('#paperMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.settings.feedMode = b.dataset.pm; save(); renderPaperDaily(); };
  $('#addPaperBtn').onclick = () => editTrack(null, 'paper');
  $('#addProjBtn').onclick = () => editTrack(null, 'project');
  $('#paperTrackFilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; paperTrackFilter = b.dataset.ptf; $$('#paperTrackFilter button').forEach(x => x.classList.toggle('is-active', x === b)); renderResearch(); };
  $('#projTrackFilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; projTrackFilter = b.dataset.prf; $$('#projTrackFilter button').forEach(x => x.classList.toggle('is-active', x === b)); renderResearch(); };
  $('#addDirBtn').onclick = () => editDirection(null);
  $('#addNoteBtn').onclick = () => openNoteEditor({});
  $('#addAchBtn').onclick = () => openForm('手动添加成果', [
    { k: 'title', label: '名称' }, { k: 'type', label: '类型', type: 'select', options: ACH_TYPES },
    { k: 'outcome', label: '成果说明', type: 'textarea', rows: 2 }, { k: 'date', label: '归档日期', type: 'date', def: todayStr() }
  ], { date: todayStr() }, d => { if (!d.title) { toast('请填写名称'); return false; } S.achievements.unshift({ id: uid(), title: d.title, type: d.type, directionId: '', date: d.date || todayStr(), outcome: d.outcome, note: '' }); save(); renderAll(); toast('已添加'); });
  $('#archExport').onclick = exportAchievements;

  /* 生活 */
  $('#lifeTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; lifeTab = b.dataset.life; $$('#lifeTabs button').forEach(x => x.classList.toggle('is-active', x === b)); renderLife(); };
  $('#addSportBtn').onclick = () => editSport(null);
  $('#addBookBtn').onclick = () => editBook(null);
  $('#addMovieBtn').onclick = () => editMovie(null);
  $('#addTripBtn').onclick = () => editTrip(null);
  $('#addHabitBtn').onclick = addHabit;

  /* 回顾 */
  $('#reviewRange').onclick = e => { const b = e.target.closest('button'); if (!b) return; reviewRange = b.dataset.rr; $$('#reviewRange button').forEach(x => x.classList.toggle('is-active', x === b)); renderReview(); };

  /* 快速记录 */
  $('#fab').onclick = openQuick;
  $('#quickClose').onclick = closeQuick;
  $('#quickMask').onclick = e => { if (e.target.id === 'quickMask') closeQuick(); };
  $('#quickTags').onclick = e => { const b = e.target.closest('button'); if (!b) return; quickTag = b.dataset.qt; $$('#quickTags button').forEach(x => x.classList.toggle('is-active', x === b)); };
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

function checkUpdate() {
  fetch('version.txt', { cache: 'no-store' })
    .then(r => r.ok ? r.text() : null)
    .then(t => {
      const v = (t || '').trim();
      if (!v) return;
      const seen = localStorage.getItem('yanxitai.seenVersion');
      if (seen !== v) {
        localStorage.setItem('yanxitai.seenVersion', v);
        if (seen) {
          toast('发现新版本，正在刷新…');
          setTimeout(() => location.reload(true), 900);
        }
      }
    })
    .catch(() => {});
}

})();
