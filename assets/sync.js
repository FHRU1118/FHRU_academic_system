/* ============================================================
   研习台 · 云端同步模块（JSONBin）
   数据存到 JSONBin 云端，手机/电脑共享同一份，且与代码分离。
   - 单文件存储整份应用状态（一个 JSON Bin）
   - 启动拉取云端，本地更旧则采用云端（last-write-wins + 时间戳）
   - 每次保存防抖后推送到云端
   - 断网/未配置时自动降级为纯本地（localStorage）
   ============================================================ */
window.Sync = (function () {
  'use strict';

  const API = 'https://api.jsonbin.io/v3/b';
  let binId = '', apiKey = '';
  let statusCb = null;
  let lastSyncedAt = 0;
  let inFlight = false;
  let pushTimer = null;

  function setCreds(b, k) { binId = (b || '').trim(); apiKey = (k || '').trim(); }
  function enabled() { return !!binId && !!apiKey; }
  function onStatus(cb) { statusCb = cb; }
  function emit(s, detail) { if (statusCb) statusCb(s, detail || ''); }

  async function pull() {
    if (!enabled()) return null;
    const res = await fetch(`${API}/${binId}/latest`, {
      headers: { 'X-Master-Key': apiKey, 'X-Bin-Meta': 'false' }
    });
    if (!res.ok) throw new Error('读取失败(' + res.status + ')');
    const data = await res.json();
    // JSONBin v3 把数据包在 {record, metadata} 里；X-Bin-Meta:false 时仍是 {record}
    // 必须拆包，否则上层读 cloud.savedAt / cloud.settings 全部落空，导致永远不采用云端数据
    return (data && data.record !== undefined) ? data.record : data;
  }

  async function push(state) {
    if (!enabled()) return;
    const res = await fetch(`${API}/${binId}`, {
      method: 'PUT',
      headers: {
        'X-Master-Key': apiKey,
        'Content-Type': 'application/json',
        'X-Bin-Meta': 'false',
        'versioning': 'false' // 只保留当前版本，避免刷爆免费额度
      },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw new Error('写入失败(' + res.status + ')');
    lastSyncedAt = state.savedAt || Date.now();
  }

  async function createBin(state) {
    if (!apiKey) throw new Error('请先填写 API Key');
    const res = await fetch(`${API}`, {
      method: 'POST',
      headers: {
        'X-Master-Key': apiKey,
        'Content-Type': 'application/json',
        'X-Bin-Name': 'yanxitai-state'
      },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw new Error('创建失败(' + res.status + ')');
    const d = await res.json();
    return d.metadata.id; // 新 Bin ID
  }

  // 启动：拉取云端，以云端为唯一真相（多端收敛），凭据已由 app 端保留
  async function startup(localState, adoptFn) {
    if (!enabled()) { emit('off', '未开启云端同步（仅本机）'); return; }
    emit('syncing', '正在连接云端…');
    try {
      const cloud = await pull();
      if (cloud && cloud.savedAt) {
        adoptFn(cloud); // 用云端覆盖本地（凭据已在 app 内保留，不会被冲掉）
        emit('ok', '已从云端恢复');
      } else {
        // 云端为空：把本机状态推上去作为初始种子，避免「空状态」覆盖已有数据
        emit('syncing', '云端暂无数据，正在上传本机…');
        try {
          if (localState) {
            localState.savedAt = localState.savedAt || Date.now();
            await push(localState);
          }
          emit('ok', '本机已上传为云端初始数据');
        } catch (e2) {
          emit('error', '上传本机失败：' + e2.message);
        }
      }
      lastSyncedAt = (cloud && cloud.savedAt) || (localState && localState.savedAt) || 0;
    } catch (e) {
      emit('error', e.message + ' · 暂用本机数据');
    }
  }

  // 保存：防抖后推送（单飞，避免并发）
  function save(state) {
    if (!enabled()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      if (inFlight) { // 上一次还没完，稍后重试一次
        setTimeout(() => save(state), 500); return;
      }
      inFlight = true;
      emit('syncing', '同步中…');
      try {
        await push(state);
        emit('ok', '已同步');
      } catch (e) {
        emit('error', e.message);
      } finally { inFlight = false; }
    }, 700);
  }

  return {
    setCreds, enabled, onStatus, startup, save, pull, push, createBin,
    get lastSyncedAt() { return lastSyncedAt; }
  };
})();
