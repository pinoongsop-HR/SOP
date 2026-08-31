/* ============================================================================
   STATE
   ========================================================================= */
let TOKEN = localStorage.getItem('kk_token') || null;
let ME = null;
let CONFIG = null; // { tiers, positions, phaseLabels } — tổng quan (đọc từ /employees/config/positions)
let currentView = 'checklist';
let currentChecklistEmployeeId = null; // ai đang được xem trong "Checklist của tôi" (thường là ME.id)

const PHASE_ORDER = ['moCa', 'giaoCa', 'dongCa'];

function isPrivileged(me) { return !!(me && (me.isAdmin || me.isRegionalManager)); }

/* ============================================================================
   API HELPER
   ========================================================================= */
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch('/api' + path, Object.assign({}, opts, { headers }));
  if (res.status === 401) {
    doLogout();
    throw new Error('Phiên đăng nhập hết hạn');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function barColor(pct) {
  if (pct >= 90) return '#3FD07A';
  if (pct >= 80) return '#6BD98F';
  if (pct >= 65) return '#F5B84E';
  if (pct >= 50) return '#F0954E';
  return '#F5636F';
}
function classCls(label) {
  if (label === 'Xuất sắc' || label === 'Tốt') return 'pill-xs';
  if (label === 'Khá') return 'pill-t';
  if (label === 'Trung bình') return 'pill-tb';
  return 'pill-k';
}
function bonusCls(tone) {
  return { excellent: 'bonus-excellent', good: 'bonus-good', ok: 'bonus-ok', warn: 'bonus-warn', danger: 'bonus-danger' }[tone] || 'bonus-warn';
}
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

/* ============================================================================
   LOGIN / LOGOUT
   ========================================================================= */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const employeeCode = document.getElementById('loginCode').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ employeeCode, pin }) });
    TOKEN = data.token;
    localStorage.setItem('kk_token', TOKEN);
    await boot();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Đăng nhập';
  }
});

function doLogout() {
  TOKEN = null; ME = null;
  localStorage.removeItem('kk_token');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}
document.getElementById('logoutBtn').addEventListener('click', doLogout);

/* ============================================================================
   BOOT
   ========================================================================= */
async function boot() {
  if (!TOKEN) { doLogout(); return; }
  try {
    ME = await api('/auth/me');
    CONFIG = await api('/employees/config/positions');
  } catch (e) {
    doLogout(); return;
  }
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('sidebarName').textContent = ME.name;
  document.getElementById('sidebarRole').textContent = ME.isAdmin ? 'Admin' : ME.isRegionalManager ? 'Quản Lý Vùng' : ME.positionLabel;
  buildNav();
  currentChecklistEmployeeId = ME.id;
  // Admin/Quản Lý Vùng không có vị trí -> không có checklist cá nhân, mở thẳng
  // "Đội nhóm của tôi" (chính là toàn bộ nhân sự vì họ thấy hết).
  switchView(ME.position ? 'checklist' : 'team');
  fillPositionSelect();
}
boot();

/* ============================================================================
   NAV
   ========================================================================= */
function buildNav() {
  const nav = document.getElementById('navButtons');
  const items = [];
  if (ME.position) items.push({ key: 'checklist', label: '✅ Checklist của tôi' });
  if (ME.isManager || isPrivileged(ME)) items.push({ key: 'team', label: isPrivileged(ME) ? '👥 Toàn Bộ Nhân Sự' : '👥 Đội nhóm của tôi' });
  if (ME.position) items.push({ key: 'kpi', label: '📊 Bảng KPI tổng hợp' });
  if (isPrivileged(ME)) items.push({ key: 'staff', label: '🗂️ Quản lý nhân sự' });
  if (isPrivileged(ME)) items.push({ key: 'positions', label: '🧩 Quản lý Checklist' });
  nav.innerHTML = items.map((it) => `<button class="navbtn" data-view="${it.key}">${it.label}</button>`).join('');
  nav.querySelectorAll('.navbtn').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
}
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.style.display = 'none');
  document.getElementById('view-' + view).style.display = 'block';
  if (view === 'checklist') renderChecklistView();
  if (view === 'team') renderTeamView();
  if (view === 'kpi') renderKpiView();
  if (view === 'staff') renderStaffView();
  if (view === 'positions') renderPositionsView();
}

/* ============================================================================
   CHECKLIST WIDGET — DÙNG CHUNG cho "Checklist của tôi" VÀ Detail Panel.
   Tick 1 việc CHỈ cập nhật đúng dòng đó + vài con số tổng — KHÔNG render lại
   toàn bộ khối, nên không "chớp" màn hình và không mất vị trí cuộn.
   ========================================================================= */
function createChecklistWidget(rootEl, employeeId, opts) {
  opts = opts || {};
  const editable = opts.editable !== false;
  const showCloseDay = !!opts.showCloseDay;
  let data = null;
  let activeTab = 'moCa';

  function recomputePhasePct(phaseKey) {
    const ph = data.phases.find((p) => p.key === phaseKey);
    const totalW = ph.items.reduce((s, it) => s + it.weight, 0) || 1;
    const doneW = ph.items.reduce((s, it) => s + (it.checked ? it.weight : 0), 0);
    ph.pct = (doneW / totalW) * 100;
  }
  function recomputeMissing() {
    const missing = [], missingCritical = [];
    data.phases.forEach((ph) => {
      ph.items.forEach((it) => {
        if (!it.checked) {
          missing.push({ ...it, phase: ph.key });
          if (it.weight === 3) missingCritical.push({ ...it, phase: ph.key });
        }
      });
    });
    data.missing = missing;
    data.missingCritical = missingCritical;
  }

  async function load() {
    rootEl.innerHTML = `<div class="empty-state">Đang tải checklist...</div>`;
    try { data = await api('/checklist/' + employeeId); }
    catch (e) { rootEl.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    renderFull();
  }

  function renderFull() {
    const cls = { label: data.classification.label, cls: classCls(data.classification.label) };
    const shared = data.sharedWith || [];
    rootEl.innerHTML = `
      ${showCloseDay ? `
        <div class="topbar">
          <div><h1>Checklist Hôm Nay</h1><div class="sub">${new Date(data.date).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
          <button class="btn btn-teal" data-act="close-day">✓ Chốt ngày — lưu vào lịch sử KPI</button>
        </div>` : ''}
      ${shared.length ? `
        <div class="shared-with-box">
          🤝 Bảng checklist DÙNG CHUNG với: <b>${shared.map((s) => escapeHtml(s.name)).join(', ')}</b> — ai tick trước thì việc đó được tính chung, hệ thống tự ghi lại người đã ký.
        </div>` : ''}
      <div class="kpi-summary" data-role="summary">
        <div class="kpi-card"><div class="num" data-f="taskScore" style="color:${barColor(data.taskScore)}">${data.taskScore.toFixed(0)}%</div><div class="lbl">Hoàn thành SOP${shared.length ? ' (chung)' : ''}</div></div>
        <div class="kpi-card"><div class="num" data-f="compScore" style="color:${barColor(data.compScore)}">${data.compScore.toFixed(0)}%</div><div class="lbl">Năng lực</div></div>
        <div class="kpi-card"><div class="num" data-f="kpi">${data.kpi.toFixed(1)}</div><div class="lbl">KPI · <span class="pill ${cls.cls}" data-f="classPill">${cls.label}</span></div></div>
      </div>
      ${shared.length ? `
        <div class="contribution-box" data-role="contribution">
          👤 Đóng góp cá nhân của bạn: <span class="cnum" data-f="contribPct">${data.contribution.pct.toFixed(0)}%</span>
          <span data-f="contribDetail"> (bạn đã ký ${data.contribution.myCount}/${data.contribution.groupDoneCount} việc cả nhóm đã hoàn thành)</span>
        </div>` : ''}
      <div data-role="missingBanner"></div>
      <div class="tabs" data-role="tabs">
        ${PHASE_ORDER.map((key) => {
          const ph = data.phases.find((p) => p.key === key);
          return `<button class="tab-btn ${activeTab === key ? 'active' : ''}" data-tab="${key}">${CONFIG.phaseLabels[key]} <span class="pct" data-phasepct="${key}" style="color:${barColor(ph.pct)}">${ph.pct.toFixed(0)}%</span></button>`;
        }).join('')}
      </div>
      <div class="card pad" data-role="items"></div>
    `;
    renderMissingBanner();
    renderItems();

    rootEl.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => { activeTab = b.dataset.tab; rootEl.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b)); renderItems(); });
    });
    const closeBtn = rootEl.querySelector('[data-act="close-day"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        if (!confirm(`Chốt ngày với KPI ${data.kpi.toFixed(1)} (${data.missing.length} việc còn thiếu)?\nDữ liệu sẽ được lưu vào lịch sử KPI tháng/quý/năm.`)) return;
        try {
          await api('/checklist/' + employeeId + '/close-day', { method: 'POST' });
          toast('Đã chốt ngày và lưu vào lịch sử');
          load();
        } catch (e) { toast(e.message); }
      });
    }
  }

  function renderMissingBanner() {
    const box = rootEl.querySelector('[data-role="missingBanner"]');
    if (!box) return;
    if (data.missingCritical.length) {
      box.innerHTML = `
        <div class="missing-box">
          <div class="mh">⚠ ${data.missingCritical.length} việc TRỌNG YẾU chưa hoàn thành</div>
          <ul>${data.missingCritical.slice(0, 12).map((m) => `<li>${escapeHtml(m.label)} <em style="color:var(--muted); font-style:normal;">(${CONFIG.phaseLabels[m.phase]})</em></li>`).join('')}</ul>
        </div>`;
    } else if (data.missing.length === 0) {
      box.innerHTML = `<div class="all-done-box">✓ Đã hoàn thành 100% checklist</div>`;
    } else {
      box.innerHTML = '';
    }
  }

  function renderItems() {
    const wrap = rootEl.querySelector('[data-role="items"]');
    const phase = data.phases.find((p) => p.key === activeTab);
    if (!phase.items.length) {
      wrap.innerHTML = `<div class="empty-state">Vị trí này chưa có đầu việc nào cho giai đoạn "${CONFIG.phaseLabels[activeTab]}".</div>`;
      return;
    }
    wrap.innerHTML = phase.items.map((it) => {
      const signedHtml = it.auto
        ? `🔄 Tự động theo % đội nhóm cấp dưới`
        : (it.signedBy ? `✓ Đã ký bởi <b>${escapeHtml(it.signedBy)}</b>` : '');
      return `
      <label class="check-item ${it.checked ? 'checked' : ''} ${!it.checked && it.weight === 3 ? 'critical' : ''} ${it.auto ? 'auto-item' : ''}" data-row="${it.id}">
        <input type="checkbox" ${it.checked ? 'checked' : ''} data-item="${it.id}" ${(editable && !it.auto) ? '' : 'disabled'}>
        <span style="flex:1;">
          <span class="check-label">${escapeHtml(it.label)}</span>
          <div class="check-signed">${signedHtml}</div>
        </span>
        ${it.auto ? '<span class="badge-auto">Tự động</span>' : ''}
        <span class="check-weight w${it.weight}">${it.weight === 3 ? 'Trọng yếu' : it.weight === 2 ? 'Quan trọng' : 'Thường quy'}</span>
      </label>
    `; }).join('');
    if (!editable) return;
    wrap.querySelectorAll('input[type=checkbox]:not([disabled])').forEach((cb) => {
      cb.addEventListener('change', (ev) => onToggle(ev.target.dataset.item, ev.target.checked, ev.target.closest('[data-row]')));
    });
  }

  function updateTabPctText(phaseKey) {
    const ph = data.phases.find((p) => p.key === phaseKey);
    const el = rootEl.querySelector(`[data-phasepct="${phaseKey}"]`);
    if (el) { el.textContent = ph.pct.toFixed(0) + '%'; el.style.color = barColor(ph.pct); }
  }
  function updateSummaryNumbers() {
    const sum = rootEl.querySelector('[data-role="summary"]');
    if (!sum) return;
    const t = sum.querySelector('[data-f="taskScore"]'); if (t) { t.textContent = data.taskScore.toFixed(0) + '%'; t.style.color = barColor(data.taskScore); }
    const c = sum.querySelector('[data-f="compScore"]'); if (c) { c.textContent = data.compScore.toFixed(0) + '%'; c.style.color = barColor(data.compScore); }
    const k = sum.querySelector('[data-f="kpi"]'); if (k) k.textContent = data.kpi.toFixed(1);
    const cp = rootEl.querySelector('[data-f="contribPct"]'); if (cp && data.contribution) cp.textContent = data.contribution.pct.toFixed(0) + '%';
    const cd = rootEl.querySelector('[data-f="contribDetail"]');
    if (cd && data.contribution) cd.textContent = ` (bạn đã ký ${data.contribution.myCount}/${data.contribution.groupDoneCount} việc cả nhóm đã hoàn thành)`;
  }

  function onToggle(itemId, checked, rowEl) {
    const phase = data.phases.find((p) => p.key === activeTab);
    const it = phase.items.find((i) => i.id === itemId);
    const prevChecked = it.checked;
    const prevSignedBy = it.signedBy;

    // 1) Cập nhật NGAY LẬP TỨC trên giao diện (optimistic) — không đợi API
    it.checked = checked;
    it.signedBy = checked ? ME.name : null;
    if (rowEl) {
      rowEl.classList.toggle('checked', checked);
      rowEl.classList.toggle('critical', !checked && it.weight === 3);
      const signedEl = rowEl.querySelector('.check-signed');
      const newSignedHtml = checked ? `✓ Đã ký bởi <b>${escapeHtml(ME.name)}</b>` : '';
      if (signedEl) signedEl.innerHTML = newSignedHtml;
    }
    recomputePhasePct(activeTab);
    recomputeMissing();
    updateTabPctText(activeTab);
    renderMissingBanner();

    // 2) Gửi API ở nền, khi có kết quả CHÍNH XÁC (kể cả % đóng góp cá nhân) thì cập nhật
    api('/checklist/' + employeeId + '/item', {
      method: 'PATCH',
      body: JSON.stringify({ phase: activeTab, itemId, checked }),
    }).then((res) => {
      phase.pct = res.phasePct;
      data.taskScore = res.taskScore;
      data.kpi = res.kpi;
      data.contribution = res.contribution;
      updateTabPctText(activeTab);
      updateSummaryNumbers();
    }).catch((e) => {
      it.checked = prevChecked;
      it.signedBy = prevSignedBy;
      if (rowEl) {
        rowEl.classList.toggle('checked', prevChecked);
        rowEl.classList.toggle('critical', !prevChecked && it.weight === 3);
        const signedEl = rowEl.querySelector('.check-signed');
        if (signedEl) signedEl.innerHTML = prevSignedBy ? `✓ Đã ký bởi <b>${escapeHtml(prevSignedBy)}</b>` : '';
      }
      recomputePhasePct(activeTab);
      recomputeMissing();
      updateTabPctText(activeTab);
      renderMissingBanner();
      toast(e.message);
    });
  }

  return { load };
}

/* ============================================================================
   VIEW: CHECKLIST CỦA TÔI
   ========================================================================= */
function renderChecklistView() {
  const empId = currentChecklistEmployeeId || ME.id;
  const el = document.getElementById('view-checklist');
  const widget = createChecklistWidget(el, empId, { editable: true, showCloseDay: true });
  widget.load();
}

/* ============================================================================
   VIEW: ĐỘI NHÓM CỦA TÔI (Quản lý / Admin / Quản Lý Vùng)
   ========================================================================= */
async function renderTeamView() {
  const el = document.getElementById('view-team');
  el.innerHTML = `<div class="empty-state">Đang tải...</div>`;
  let resp;
  try { resp = await api('/kpi/today'); }
  catch (e) { el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  const list = resp.list;
  const showBonus = resp.viewerIsPrivileged; // chỉ Admin / Quản Lý Vùng thấy cột đề xuất thưởng
  list.sort((a, b) => b.kpi - a.kpi);
  const total = list.length;
  const avg = total ? list.reduce((s, e) => s + e.kpi, 0) / total : 0;
  const good = list.filter((e) => e.kpi >= 80).length;
  const withCritical = list.filter((e) => e.missingCritical && e.missingCritical.length);

  el.innerHTML = `
    <div class="topbar">
      <div><h1>${isPrivileged(ME) ? 'Toàn Bộ Nhân Sự' : 'Đội Nhóm Của Tôi'}</h1><div class="sub">Tiến độ SOP hôm nay theo 3 giai đoạn · Mở ca / Giao ca / Đóng ca${showBonus ? ' · Kèm đề xuất thưởng' : ''}</div></div>
    </div>
    <div class="grid grid-4" style="margin-bottom:16px;">
      <div class="card stat"><div class="k">Tổng nhân sự</div><div class="v">${total}</div></div>
      <div class="card stat"><div class="k">KPI trung bình</div><div class="v">${avg.toFixed(1)}</div></div>
      <div class="card stat"><div class="k">Đạt chuẩn (≥80)</div><div class="v" style="color:#7FEBAA;">${good}</div></div>
      <div class="card stat"><div class="k">Cần can thiệp (&lt;80)</div><div class="v" style="color:#FFB3BA;">${total - good}</div></div>
    </div>
    ${withCritical.length ? `
      <div class="missing-box">
        <div class="mh">⚠ ${withCritical.length} người có việc TRỌNG YẾU chưa hoàn thành hôm nay</div>
        <ul>${withCritical.map((e) => `<li><b>${escapeHtml(e.name)}</b> (${escapeHtml(e.positionLabel)}) — ${e.missingCritical.map((m) => escapeHtml(m.label)).join('; ')}</li>`).join('')}</ul>
      </div>` : ''}
    <div class="card">
      <div style="overflow-x:auto;">
        <table>
          <thead><tr>
            <th>Tên</th><th>Vị trí</th><th>Tầng</th><th>Mở ca</th><th>Giao ca</th><th>Đóng ca</th><th>% SOP</th><th>KPI</th><th>Xếp loại</th>
            ${showBonus ? '<th>Đề xuất thưởng</th>' : ''}
            <th></th>
          </tr></thead>
          <tbody id="teamBody"></tbody>
        </table>
      </div>
      ${!total ? '<div class="empty-state">Chưa có nhân sự nào trong phạm vi của bạn.</div>' : ''}
    </div>
  `;
  const body = document.getElementById('teamBody');
  body.innerHTML = list.map((e) => `
    <tr>
      <td><b>${escapeHtml(e.name)}</b></td>
      <td>${escapeHtml(e.positionLabel)}</td>
      <td><span class="tier-pill">Tầng ${e.tier}</span></td>
      <td>${e.phases.moCa.toFixed(0)}%</td>
      <td>${e.phases.giaoCa.toFixed(0)}%</td>
      <td>${e.phases.dongCa.toFixed(0)}%</td>
      <td>${e.taskScore.toFixed(0)}%</td>
      <td><strong>${e.kpi.toFixed(1)}</strong></td>
      <td><span class="pill ${classCls(e.classification.label)}">${e.classification.label}</span></td>
      ${showBonus ? `<td><span class="pill-bonus ${bonusCls(e.bonusSuggestion.tone)}" title="${escapeHtml(e.bonusSuggestion.reason)}">${escapeHtml(e.bonusSuggestion.label)}</span></td>` : ''}
      <td><button class="btn btn-sm" data-open="${e.id}">Xem chi tiết</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
}

/* ============================================================================
   VIEW: BẢNG KPI TỔNG HỢP (tháng / quý / năm) + biểu đồ xu hướng theo tháng
   ========================================================================= */
let kpiPeriod = { period: 'month', year: new Date().getFullYear(), month: new Date().getMonth() + 1, quarter: Math.ceil((new Date().getMonth() + 1) / 3) };
let trendEmployeeId = null;

async function renderKpiView() {
  const el = document.getElementById('view-kpi');
  const y = kpiPeriod.year;
  el.innerHTML = `
    <div class="topbar">
      <div><h1>Bảng KPI Tổng Hợp</h1><div class="sub">Trung bình cộng KPI &amp; tỉ lệ số ngày đạt chuẩn (≥80 điểm) trong kỳ</div></div>
      <button class="btn btn-teal" id="exportKpiCsv">⭳ Xuất CSV</button>
    </div>
    <div class="period-bar card pad">
      <select id="periodType" style="width:140px;">
        <option value="month" ${kpiPeriod.period === 'month' ? 'selected' : ''}>Theo tháng</option>
        <option value="quarter" ${kpiPeriod.period === 'quarter' ? 'selected' : ''}>Theo quý</option>
        <option value="year" ${kpiPeriod.period === 'year' ? 'selected' : ''}>Theo năm</option>
      </select>
      <select id="periodMonth" style="width:110px; ${kpiPeriod.period !== 'month' ? 'display:none;' : ''}">
        ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${m}" ${m === kpiPeriod.month ? 'selected' : ''}>Tháng ${m}</option>`).join('')}
      </select>
      <select id="periodQuarter" style="width:110px; ${kpiPeriod.period !== 'quarter' ? 'display:none;' : ''}">
        ${[1, 2, 3, 4].map((q) => `<option value="${q}" ${q === kpiPeriod.quarter ? 'selected' : ''}>Quý ${q}</option>`).join('')}
      </select>
      <select id="periodYear" style="width:110px;">
        ${Array.from({ length: 5 }, (_, i) => y - 2 + i).map((yy) => `<option value="${yy}" ${yy === y ? 'selected' : ''}>Năm ${yy}</option>`).join('')}
      </select>
    </div>
    <div class="card">
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Tên</th><th>Vị trí</th><th>Số ngày đã chốt</th><th>KPI trung bình</th><th>% Ngày đạt chuẩn</th><th>% SOP TB</th><th>% Năng lực TB</th><th>Xếp loại</th></tr></thead>
          <tbody id="kpiBody"></tbody>
        </table>
      </div>
      <div class="empty-state hidden" id="kpiEmpty">Chưa có dữ liệu lịch sử trong kỳ này.</div>
    </div>

    <div class="section-title" style="margin-top:22px;">Xu hướng KPI theo tháng — theo dõi sự tiến bộ từng người</div>
    <div class="card pad">
      <div class="period-bar" style="margin-bottom:4px;">
        <select id="trendEmpSelect" style="min-width:240px;"></select>
      </div>
      <div class="bar-chart-wrap" id="trendChart"></div>
      <div class="empty-state hidden" id="trendEmpty">Chưa có dữ liệu lịch sử cho nhân sự này.</div>
    </div>
  `;
  document.getElementById('periodType').addEventListener('change', (e) => { kpiPeriod.period = e.target.value; renderKpiView(); });
  document.getElementById('periodMonth').addEventListener('change', (e) => { kpiPeriod.month = Number(e.target.value); loadKpiTable(); });
  document.getElementById('periodQuarter').addEventListener('change', (e) => { kpiPeriod.quarter = Number(e.target.value); loadKpiTable(); });
  document.getElementById('periodYear').addEventListener('change', (e) => { kpiPeriod.year = Number(e.target.value); loadKpiTable(); });
  document.getElementById('exportKpiCsv').addEventListener('click', exportKpiCsv);
  await loadKpiTable();
  await loadTrendSelector();
}

let lastKpiRollup = null;
async function loadKpiTable() {
  const q = new URLSearchParams({ period: kpiPeriod.period, year: kpiPeriod.year, month: kpiPeriod.month, quarter: kpiPeriod.quarter });
  let data;
  try { data = await api('/kpi/rollup?' + q.toString()); }
  catch (e) { toast(e.message); return; }
  lastKpiRollup = data;
  const list = data.employees.slice().sort((a, b) => b.avgKpi - a.avgKpi);
  document.getElementById('kpiEmpty').classList.toggle('hidden', list.some((e) => e.count > 0));
  document.getElementById('kpiBody').innerHTML = list.map((e) => `
    <tr>
      <td><b>${escapeHtml(e.name)}</b></td>
      <td>${escapeHtml(e.positionLabel)}</td>
      <td>${e.count}</td>
      <td><strong>${e.avgKpi.toFixed(1)}</strong></td>
      <td>${e.pctAchieved.toFixed(0)}%</td>
      <td>${e.avgTaskScore.toFixed(0)}%</td>
      <td>${e.avgCompScore.toFixed(0)}%</td>
      <td><span class="pill ${classCls(e.classification.label)}">${e.classification.label}</span></td>
    </tr>
  `).join('');
}
function exportKpiCsv() {
  if (!lastKpiRollup) return;
  const rows = [['Tên', 'Vị trí', 'Số ngày', 'KPI TB', '% Đạt chuẩn', '% SOP TB', '% Năng lực TB', 'Xếp loại']];
  lastKpiRollup.employees.forEach((e) => rows.push([e.name, e.positionLabel, e.count, e.avgKpi.toFixed(1), e.pctAchieved.toFixed(0), e.avgTaskScore.toFixed(0), e.avgCompScore.toFixed(0), e.classification.label]));
  const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `kpi-${lastKpiRollup.from}-den-${lastKpiRollup.to}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function loadTrendSelector() {
  let listRaw;
  try { listRaw = await api('/employees'); } catch (e) { toast(e.message); return; }
  const list = listRaw.filter((e) => e.position); // Admin/Quản Lý Vùng không có KPI để xem xu hướng
  const sel = document.getElementById('trendEmpSelect');
  if (!sel) return;
  sel.innerHTML = list.map((e) => `<option value="${e.id}">${e.id === ME.id ? '👤 Bản thân — ' : ''}${escapeHtml(e.name)} (${escapeHtml(e.positionLabel)})</option>`).join('');
  trendEmployeeId = trendEmployeeId && list.some((e) => e.id === trendEmployeeId) ? trendEmployeeId : (list.find((e) => e.id === ME.id) ? ME.id : (list[0] && list[0].id));
  if (trendEmployeeId) sel.value = trendEmployeeId;
  sel.addEventListener('change', () => { trendEmployeeId = sel.value; loadTrendChart(); });
  await loadTrendChart();
}
async function loadTrendChart() {
  const chart = document.getElementById('trendChart');
  const emptyBox = document.getElementById('trendEmpty');
  if (!trendEmployeeId) { chart.innerHTML = ''; emptyBox.classList.remove('hidden'); return; }
  let data;
  try { data = await api('/kpi/trend/' + trendEmployeeId + '?months=12'); } catch (e) { toast(e.message); return; }
  const months = data.months;
  const hasAny = months.some((m) => m.count > 0);
  emptyBox.classList.toggle('hidden', hasAny);
  chart.innerHTML = months.map((m) => {
    const h = Math.max(2, (m.avgKpi / 100) * 160);
    return `
      <div class="bar-chart-col">
        <div class="bar-chart-val">${m.count ? m.avgKpi.toFixed(0) : '–'}</div>
        <div class="bar-chart-bar" style="height:${h}px; background:${barColor(m.avgKpi)};" title="${m.label}: KPI TB ${m.avgKpi.toFixed(1)} (${m.count} ngày đã chốt)"></div>
        <div class="bar-chart-label">${m.label}</div>
      </div>`;
  }).join('');
}

/* ============================================================================
   DETAIL PANEL (xem 1 nhân sự: checklist CÓ THỂ SỬA, năng lực, đánh giá, lịch sử)
   ========================================================================= */
let detailChecklistWidget = null;

async function openDetail(employeeId) {
  document.getElementById('detailOverlay').classList.add('show');
  document.getElementById('detailPanel').classList.add('show');
  await renderDetail(employeeId);
}
function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('show');
  document.getElementById('detailPanel').classList.remove('show');
}
document.getElementById('detailOverlay').addEventListener('click', closeDetail);

async function renderDetail(employeeId) {
  const panel = document.getElementById('detailPanel');
  panel.innerHTML = `<div class="empty-state">Đang tải...</div>`;
  let emp;
  try { emp = await api('/employees/' + employeeId); }
  catch (e) { panel.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  // Tài khoản Admin / Quản Lý Vùng: không có vị trí -> không checklist, không KPI,
  // không năng lực, không đánh giá định kỳ. Chỉ hiển thị hồ sơ cơ bản.
  if (!emp.position) {
    const editLocked = emp.isAdmin && !ME.isAdmin; // chỉ Quản Lý Vùng bị chặn, Admin thì sửa được Admin khác
    panel.innerHTML = `
      <div class="emp-detail-head">
        <div>
          <h3>${escapeHtml(emp.name)} ${emp.isAdmin ? '<span class="pill pill-xs">Admin</span>' : '<span class="pill pill-t">Quản Lý Vùng</span>'}</h3>
          <div class="sub" style="color:var(--muted); font-size:12px;">Tài khoản quản trị · Mã ${escapeHtml(emp.employeeCode)}</div>
        </div>
        <button class="close-x" id="closeDetailBtn">&times;</button>
      </div>
      <div class="emp-detail-body">
        <div class="missing-box" style="background:var(--primary-soft); border-color:rgba(124,108,246,.3);">
          <div class="mh" style="color:#C9C1FF;">ℹ Tài khoản quản trị chỉ giao việc, không tham gia checklist hay KPI.</div>
        </div>
        <div class="form-row"><label class="flabel">SĐT</label><div>${escapeHtml(emp.phone || '—')}</div></div>
        <div class="form-row"><label class="flabel">Trạng thái</label><div>${escapeHtml(emp.status)}</div></div>
        ${emp.isAdmin ? `<div class="review-hint">${editLocked ? 'Chỉ Admin mới sửa được tài khoản Admin này (Quản Lý Vùng không có quyền).' : 'Vào Quản lý nhân sự để sửa thông tin tài khoản này.'}</div>` : ''}
      </div>
    `;
    document.getElementById('closeDetailBtn').addEventListener('click', closeDetail);
    return;
  }

  let reviews, rollup;
  try {
    reviews = await api('/reviews/' + employeeId);
    rollup = await api('/kpi/rollup/' + employeeId + '?period=month&year=' + new Date().getFullYear() + '&month=' + (new Date().getMonth() + 1));
  } catch (e) { panel.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  currentCompValues = emp.competency || {};
  const compList = await getCompetencyList(emp.position);
  const isSelf = emp.id === ME.id;
  // Ai được phép TICK checklist của người khác: chính họ, Admin, Quản Lý Vùng, hoặc
  // Quản lý trực tiếp (ME.isManager — backend tự kiểm tra lại theo visibleEmployeeIds).
  const canEditChecklist = isSelf || isPrivileged(ME) || ME.isManager;
  const canScore = (isPrivileged(ME) || ME.isManager) && !isSelf;

  panel.innerHTML = `
    <div class="emp-detail-head">
      <div>
        <h3>${escapeHtml(emp.name)}</h3>
        <div class="sub" style="color:var(--muted); font-size:12px;">${escapeHtml(emp.positionLabel)} · Tầng ${emp.tier} · Mã ${escapeHtml(emp.employeeCode)}</div>
      </div>
      <button class="close-x" id="closeDetailBtn">&times;</button>
    </div>
    <div class="emp-detail-body">
      ${isPrivileged(ME) ? `
        <div style="margin-bottom:16px;">
          <span class="pill-bonus ${bonusCls(emp.bonusSuggestion.tone)}" title="${escapeHtml(emp.bonusSuggestion.reason)}">💰 ${escapeHtml(emp.bonusSuggestion.label)}</span>
        </div>` : ''}

      <div class="section-title">Checklist hôm nay ${canEditChecklist ? '— có thể tick trực tiếp tại đây' : '(chỉ xem)'}</div>
      <div id="detailChecklistWrap"></div>

      <div class="section-title">KPI tháng này (${rollup.count} ngày đã chốt)</div>
      <div class="kpi-summary">
        <div class="kpi-card"><div class="num">${rollup.avgKpi.toFixed(1)}</div><div class="lbl">KPI trung bình</div></div>
        <div class="kpi-card"><div class="num">${rollup.pctAchieved.toFixed(0)}%</div><div class="lbl">% Ngày đạt chuẩn</div></div>
        <div class="kpi-card"><div class="num">${rollup.avgTaskScore.toFixed(0)}%</div><div class="lbl">% SOP TB</div></div>
      </div>

      <div class="section-title">Khung năng lực (chấm 1–5)</div>
      <div class="comp-grid" id="compGrid"></div>

      ${canScore ? `
        <div class="section-title">Đánh giá định kỳ</div>
        <div class="review-form">
          <div class="form-grid" style="margin-bottom:10px;">
            <div><label class="flabel">Người đánh giá</label><input type="text" id="reviewerName" value="${escapeHtml(ME.name)}"></div>
            <div><label class="flabel">Kỳ đánh giá</label><input type="text" id="reviewPeriod" placeholder="VD: Tháng 8/2026"></div>
          </div>
          <label class="flabel">Nhận xét</label>
          <textarea id="reviewNotes" rows="3" placeholder="Điểm mạnh, điểm cần cải thiện..." style="margin-bottom:10px;"></textarea>
          <div class="review-actions">
            <span class="review-hint">Lưu sẽ chốt điểm năng lực + KPI hiện tại vào lịch sử đánh giá.</span>
            <button class="btn btn-primary btn-sm" id="saveReviewBtn">💾 Lưu đánh giá</button>
          </div>
        </div>` : ''}

      <div class="section-title">Lịch sử đánh giá định kỳ</div>
      <div id="reviewHistory">${renderReviewHistory(reviews)}</div>
    </div>
  `;

  document.getElementById('closeDetailBtn').addEventListener('click', closeDetail);

  detailChecklistWidget = createChecklistWidget(document.getElementById('detailChecklistWrap'), employeeId, { editable: canEditChecklist, showCloseDay: false });
  detailChecklistWidget.load();

  const compGrid = document.getElementById('compGrid');
  compGrid.innerHTML = compList.map((c) => `
    <div class="comp-item">
      <label>${escapeHtml(c.label)}</label>
      <div class="comp-scale">
        ${[1, 2, 3, 4, 5].map((n) => `<button data-comp="${c.id}" data-val="${n}" class="${c.value === n ? 'active' : ''}" ${canScore ? '' : 'disabled'}>${n}</button>`).join('')}
      </div>
    </div>
  `).join('');
  if (canScore) {
    compGrid.querySelectorAll('button[data-comp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('/employees/' + employeeId + '/competency', { method: 'PUT', body: JSON.stringify({ compId: btn.dataset.comp, value: Number(btn.dataset.val) }) });
          renderDetail(employeeId);
        } catch (e) { toast(e.message); }
      });
    });
    document.getElementById('saveReviewBtn').addEventListener('click', async () => {
      const reviewer = document.getElementById('reviewerName').value.trim();
      const period = document.getElementById('reviewPeriod').value.trim();
      const notes = document.getElementById('reviewNotes').value.trim();
      try {
        await api('/reviews/' + employeeId, { method: 'POST', body: JSON.stringify({ reviewer, period, notes }) });
        toast('Đã lưu đánh giá định kỳ');
        renderDetail(employeeId);
      } catch (e) { toast(e.message); }
    });
  }
}

function renderReviewHistory(reviews) {
  if (!reviews.length) return `<div class="empty-state" style="padding:16px 0;">Chưa có đánh giá định kỳ nào.</div>`;
  const rows = reviews.map((r) => `
    <tr>
      <td>${new Date(r.date).toLocaleDateString('vi-VN')}</td>
      <td>${escapeHtml(r.period || '—')}</td>
      <td>${escapeHtml(r.reviewer || '—')}</td>
      <td>${r.compScore.toFixed(0)}%</td>
      <td><strong>${r.kpi.toFixed(1)}</strong></td>
      <td style="max-width:200px; white-space:normal; color:var(--muted);">${escapeHtml(r.notes || '')}</td>
    </tr>`).join('');
  return `<table><thead><tr><th>Ngày</th><th>Kỳ</th><th>Người ĐG</th><th>Năng lực</th><th>KPI</th><th>Nhận xét</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Lấy danh sách tiêu chí năng lực áp dụng cho vị trí (kèm giá trị hiện tại)
const BASE_COMP_STATIC = [
  { id: 'chuyen-mon', label: 'Kiến thức chuyên môn / nghiệp vụ' },
  { id: 'tuan-thu', label: 'Tuân thủ quy trình & an toàn vệ sinh (ATTP)' },
  { id: 'xu-ly', label: 'Kỹ năng xử lý tình huống phát sinh' },
  { id: 'thai-do', label: 'Thái độ & kỷ luật làm việc' },
  { id: 'giao-tiep', label: 'Giao tiếp / phối hợp đồng đội' },
];
const LEADERSHIP_COMP_STATIC = { id: 'lanh-dao', label: 'Khả năng đào tạo / lãnh đạo đội nhóm' };
async function getCompetencyList(positionKey) {
  const posInfo = CONFIG.positions.find((p) => p.key === positionKey);
  const list = posInfo && posInfo.hasLeadership ? [...BASE_COMP_STATIC, LEADERSHIP_COMP_STATIC] : BASE_COMP_STATIC;
  return list.map((c) => ({ ...c, value: currentCompValues[c.id] || 0 }));
}
let currentCompValues = {};

/* ============================================================================
   VIEW: QUẢN LÝ NHÂN SỰ (Admin / Quản Lý Vùng)
   ========================================================================= */
function fillPositionSelect() {
  const sel = document.getElementById('f_position');
  if (!sel || !CONFIG) return;
  sel.innerHTML = '';
  CONFIG.tiers.forEach((tier) => {
    const keys = CONFIG.positions.filter((p) => p.tier === tier.id);
    if (!keys.length) return;
    const og = document.createElement('optgroup');
    og.label = tier.label;
    keys.forEach((p) => { const o = document.createElement('option'); o.value = p.key; o.textContent = p.label; og.appendChild(o); });
    sel.appendChild(og);
  });
}

async function renderStaffView() {
  const el = document.getElementById('view-staff');
  el.innerHTML = `<div class="empty-state">Đang tải...</div>`;
  let list;
  try { list = await api('/employees'); }
  catch (e) { el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  el.innerHTML = `
    <div class="topbar">
      <div><h1>Quản Lý Nhân Sự</h1><div class="sub">Thêm / sửa / xoá tài khoản nhân sự, cấp quyền, đặt lại mã PIN</div></div>
      <button class="btn btn-primary" id="addStaffBtn">+ Thêm nhân sự</button>
    </div>
    <div class="card">
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Tên</th><th>Mã NV</th><th>Vị trí</th><th>Chi nhánh</th><th>SĐT</th><th>Trạng thái</th><th>Quyền</th><th>KPI hôm nay</th><th></th></tr></thead>
          <tbody id="staffBody"></tbody>
        </table>
      </div>
      ${!list.length ? '<div class="empty-state">Chưa có nhân sự nào.</div>' : ''}
    </div>
  `;
  document.getElementById('addStaffBtn').addEventListener('click', () => openStaffModal(null));
  const body = document.getElementById('staffBody');
  const adminCount = list.filter((e) => e.isAdmin).length;
  body.innerHTML = list.map((e) => {
    // Bảo vệ Admin: Quản Lý Vùng không sửa/xoá được bất kỳ Admin nào. Admin thì
    // sửa/xoá được Admin khác, TRỪ khi đó là Admin CUỐI CÙNG (phải giữ lại ít
    // nhất 1 Admin để không ai bị khoá khỏi hệ thống vĩnh viễn).
    const editLocked = e.isAdmin && !ME.isAdmin;
    const deleteLocked = e.isAdmin && (!ME.isAdmin || adminCount <= 1);
    const deleteLockMsg = !ME.isAdmin ? 'Chỉ Admin mới xoá được tài khoản Admin' : 'Không thể xoá Admin cuối cùng của hệ thống';
    const kpiCell = e.today ? `<strong>${e.today.kpi.toFixed(1)}</strong>` : '<span style="color:var(--muted-2);">— (không áp dụng)</span>';
    return `
    <tr>
      <td><b>${escapeHtml(e.name)}</b></td>
      <td>${escapeHtml(e.employeeCode)}</td>
      <td>${escapeHtml(e.positionLabel)}</td>
      <td>${escapeHtml(e.branch || '—')}</td>
      <td style="color:var(--muted);">${escapeHtml(e.phone || '—')}</td>
      <td>${escapeHtml(e.status)}</td>
      <td>${e.isAdmin ? '<span class="pill pill-xs">Admin</span>' : e.isRegionalManager ? '<span class="pill pill-t">Quản Lý Vùng</span>' : (e.isManager ? '<span class="pill pill-tb">Quản lý</span>' : '—')}</td>
      <td>${kpiCell}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-open="${e.id}">Xem</button>
        <button class="btn btn-sm" data-edit="${e.id}" ${editLocked ? 'disabled title="Chỉ Admin mới sửa được tài khoản Admin"' : ''}>Sửa</button>
        <button class="btn btn-danger btn-sm" data-del="${e.id}" ${deleteLocked ? `disabled title="${deleteLockMsg}"` : ''}>Xoá</button>
      </td>
    </tr>
  `;
  }).join('');
  body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
  body.querySelectorAll('[data-edit]:not([disabled])').forEach((b) => b.addEventListener('click', () => openStaffModal(b.dataset.edit, list)));
  body.querySelectorAll('[data-del]:not([disabled])').forEach((b) => b.addEventListener('click', async () => {
    const emp = list.find((e) => e.id === b.dataset.del);
    if (!emp) return;
    if (!confirm(`Xoá nhân sự "${emp.name}"? Toàn bộ checklist hôm nay của người này sẽ bị xoá theo (lịch sử KPI vẫn giữ nguyên).`)) return;
    try { await api('/employees/' + emp.id, { method: 'DELETE' }); toast('Đã xoá nhân sự'); renderStaffView(); }
    catch (e) { toast(e.message); }
  }));
}

function toggleStaffModalFields() {
  const isSystem = document.getElementById('f_isAdmin').checked || document.getElementById('f_isRegionalManager').checked;
  document.getElementById('positionFieldsWrap').style.display = isSystem ? 'none' : 'block';
  updateManagerRowVisibility();
}
function updateManagerRowVisibility() {
  const posKey = document.getElementById('f_position').value;
  const posInfo = CONFIG.positions.find((p) => p.key === posKey);
  document.getElementById('managerRow').style.display = (posInfo && posInfo.tier === 1) ? 'block' : 'none';
}
async function fillManagerSelect(currentManagerId) {
  const sel = document.getElementById('f_managerId');
  sel.innerHTML = '<option value="">— Tự suy ra theo vị trí + chi nhánh —</option>';
  try {
    const list = await api('/employees');
    list.filter((e) => e.isManager && !e.isAdmin && !e.isRegionalManager).forEach((e) => {
      const o = document.createElement('option');
      o.value = e.id; o.textContent = `${e.name} (${e.positionLabel}${e.branch ? ' · ' + e.branch : ''})`;
      sel.appendChild(o);
    });
  } catch (e) { /* im lặng - không chặn mở modal nếu lỗi tải danh sách */ }
  sel.value = currentManagerId || '';
}

function openStaffModal(empId, list) {
  document.getElementById('staffModalTitle').textContent = empId ? 'Sửa nhân sự' : 'Thêm nhân sự';
  const emp = empId && list ? list.find((e) => e.id === empId) : null;
  document.getElementById('f_id').value = empId || '';
  document.getElementById('f_name').value = emp ? emp.name : '';
  document.getElementById('f_code').value = emp ? emp.employeeCode : '';
  document.getElementById('f_code').disabled = !!emp; // không cho đổi mã NV sau khi tạo
  document.getElementById('f_pin').value = '';
  fillPositionSelect();
  document.getElementById('f_position').value = emp && emp.position ? emp.position : (CONFIG.positions[0] ? CONFIG.positions[0].key : '');
  document.getElementById('f_branch').value = emp ? (emp.branch || 'Khạp Khun') : 'Khạp Khun';
  document.getElementById('f_phone').value = emp ? (emp.phone || '') : '';
  document.getElementById('f_start').value = emp ? (emp.startDate || '') : '';
  document.getElementById('f_status').value = emp ? emp.status : 'Đang làm';
  document.getElementById('f_isAdmin').checked = emp ? !!emp.isAdmin : false;
  document.getElementById('f_isRegionalManager').checked = emp ? !!emp.isRegionalManager : false;
  fillManagerSelect(emp ? emp.managerId : null);
  // Chỉ Admin gốc mới được thấy/sửa 2 ô cấp quyền này
  const privRow = document.getElementById('privilegeRow');
  privRow.style.display = ME.isAdmin ? 'block' : 'none';
  document.getElementById('f_isAdmin').disabled = !ME.isAdmin;
  document.getElementById('f_isRegionalManager').disabled = !ME.isAdmin;
  toggleStaffModalFields();
  openModal('staffModalBackdrop');
}
document.getElementById('f_isAdmin').addEventListener('change', toggleStaffModalFields);
document.getElementById('f_isRegionalManager').addEventListener('change', toggleStaffModalFields);
document.getElementById('f_position').addEventListener('change', updateManagerRowVisibility);

document.getElementById('saveStaffBtn').addEventListener('click', async () => {
  const id = document.getElementById('f_id').value;
  const isSystem = document.getElementById('f_isAdmin').checked || document.getElementById('f_isRegionalManager').checked;
  const payload = {
    name: document.getElementById('f_name').value.trim(),
    startDate: document.getElementById('f_start').value,
    status: document.getElementById('f_status').value,
  };
  if (!isSystem) {
    payload.position = document.getElementById('f_position').value;
    payload.branch = document.getElementById('f_branch').value;
    payload.phone = document.getElementById('f_phone').value.trim();
    payload.managerId = document.getElementById('f_managerId').value || null;
  }
  if (ME.isAdmin) {
    payload.isAdmin = document.getElementById('f_isAdmin').checked;
    payload.isRegionalManager = document.getElementById('f_isRegionalManager').checked;
  }
  const pin = document.getElementById('f_pin').value.trim();
  if (!payload.name) { toast('Vui lòng nhập họ tên'); return; }
  if (!isSystem && !payload.position) { toast('Vui lòng chọn vị trí'); return; }
  try {
    if (id) {
      if (pin) payload.resetPin = pin;
      await api('/employees/' + id, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      const code = document.getElementById('f_code').value.trim();
      if (!code) { toast('Vui lòng nhập mã nhân viên'); return; }
      if (!pin || !/^\d{4}$/.test(pin)) { toast('Vui lòng nhập mã PIN gồm 4 chữ số'); return; }
      payload.employeeCode = code; payload.pin = pin;
      await api('/employees', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('staffModalBackdrop');
    toast('Đã lưu nhân sự');
    renderStaffView();
  } catch (e) { toast(e.message); }
});

/* ============================================================================
   VIEW: QUẢN LÝ CHECKLIST (Admin / Quản Lý Vùng) — sửa checklist theo vị trí
   ========================================================================= */
let posEditorData = null; // toàn bộ catalog { tiers, phaseLabels, positions }
let posEditorActiveKey = null;
let posEditorActivePhase = 'moCa';

async function renderPositionsView() {
  const el = document.getElementById('view-positions');
  el.innerHTML = `<div class="empty-state">Đang tải...</div>`;
  try { posEditorData = await api('/positions'); }
  catch (e) { el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  if (!posEditorActiveKey || !posEditorData.positions[posEditorActiveKey]) {
    posEditorActiveKey = Object.keys(posEditorData.positions)[0];
  }

  el.innerHTML = `
    <div class="topbar">
      <div><h1>Quản Lý Checklist</h1><div class="sub">Sửa tên vị trí, tầng, checklist — thêm hoặc xoá hẳn 1 vị trí — áp dụng ngay cho toàn bộ nhân sự giữ vị trí đó.</div></div>
      <button class="btn btn-primary" id="addPosBtn">+ Thêm vị trí mới</button>
    </div>
    <div class="pos-editor-grid">
      <div class="card">
        <div class="pos-list" id="posList"></div>
      </div>
      <div class="card pad" id="posEditorBody"></div>
    </div>
  `;
  document.getElementById('addPosBtn').addEventListener('click', openNewPosModal);
  renderPosList();
  renderPosEditor();
}

function renderPosList() {
  const wrap = document.getElementById('posList');
  const tiers = posEditorData.tiers;
  const positions = posEditorData.positions;
  let html = '';
  tiers.forEach((tier) => {
    const keys = Object.entries(positions).filter(([, p]) => p.tier === tier.id).map(([k]) => k);
    if (!keys.length) return;
    html += `<div class="pos-list-tier">${escapeHtml(tier.label)}</div>`;
    keys.forEach((k) => {
      const p = positions[k];
      const itemCount = ['moCa', 'giaoCa', 'dongCa'].reduce((s, ph) => s + (p.phases[ph] ? p.phases[ph].length : 0), 0);
      html += `
        <div class="pos-list-item ${k === posEditorActiveKey ? 'active' : ''}" data-key="${k}">
          <div class="plabel">${escapeHtml(p.label)}</div>
          <div class="pmeta">${itemCount} đầu việc${p.hasLeadership ? ' · Quản lý' : ''}</div>
        </div>`;
    });
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-key]').forEach((el) => el.addEventListener('click', () => {
    posEditorActiveKey = el.dataset.key;
    posEditorActivePhase = 'moCa';
    renderPosList();
    renderPosEditor();
  }));
}

function renderPosEditor() {
  const body = document.getElementById('posEditorBody');
  const pos = posEditorData.positions[posEditorActiveKey];
  if (!pos) { body.innerHTML = `<div class="empty-state">Chọn 1 vị trí bên trái để sửa checklist.</div>`; return; }

  const tierOptions = posEditorData.tiers.map((t) => `<option value="${t.id}" ${pos.tier === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
  const reportsToOptions = ['<option value="">— Không (đứng đầu) —</option>']
    .concat(Object.entries(posEditorData.positions).filter(([k]) => k !== posEditorActiveKey).map(([k, p]) => `<option value="${k}" ${pos.reportsTo === k ? 'selected' : ''}>${escapeHtml(p.label)}</option>`))
    .join('');

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
      <input type="text" id="posLabelInput" value="${escapeHtml(pos.label)}" style="font-weight:800; font-size:15px; flex:1; min-width:180px;">
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary btn-sm" id="savePosBtn">💾 Lưu thay đổi</button>
        <button class="btn btn-danger btn-sm" id="delPosBtn">🗑 Xoá vị trí</button>
      </div>
    </div>
    <div class="pos-meta-row">
      <div><label class="flabel">Thuộc tầng</label><select id="posTierSelect" style="width:100%;">${tierOptions}</select></div>
      <div><label class="flabel">Báo cáo lên</label><select id="posReportsToSelect" style="width:100%;">${reportsToOptions}</select></div>
      <div>
        <label class="flabel">Vị trí quản lý?</label>
        <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; padding-top:9px; cursor:pointer;">
          <input type="checkbox" id="posHasLeadership" ${pos.hasLeadership ? 'checked' : ''} style="width:16px;height:16px;"> KPI phụ thuộc đội nhóm cấp dưới
        </label>
      </div>
    </div>
    <div class="tabs" id="posPhaseTabs">
      ${PHASE_ORDER.map((k) => `<button class="tab-btn ${posEditorActivePhase === k ? 'active' : ''}" data-phase="${k}">${posEditorData.phaseLabels[k]} <span class="pct">(${(pos.phases[k] || []).length})</span></button>`).join('')}
    </div>
    <div style="display:grid; grid-template-columns:1fr 120px 90px 40px; gap:8px; padding:0 2px; margin-bottom:6px;">
      <span class="flabel" style="margin:0;">Nội dung công việc</span><span class="flabel" style="margin:0;">Trọng số</span><span class="flabel" style="margin:0; text-align:center;">Tự động*</span><span></span>
    </div>
    <div id="posItemsWrap"></div>
    <button class="btn btn-sm add-item-row" id="addItemBtn">+ Thêm việc vào giai đoạn này</button>
    <div class="review-hint" style="margin-top:10px;">* "Tự động" chỉ dùng cho việc kiểu giám sát (Tầng 2-3-4): hệ thống tự đánh dấu hoàn thành khi TOÀN BỘ đội nhóm cấp dưới đạt đúng 100% — không tick tay được.</div>
  `;
  document.getElementById('posPhaseTabs').querySelectorAll('[data-phase]').forEach((b) => {
    b.addEventListener('click', () => { posEditorActivePhase = b.dataset.phase; renderPosEditor(); });
  });
  renderPosItems();
  document.getElementById('posLabelInput').addEventListener('input', (e) => { pos.label = e.target.value; });
  document.getElementById('posTierSelect').addEventListener('change', (e) => { pos.tier = Number(e.target.value); });
  document.getElementById('posReportsToSelect').addEventListener('change', (e) => { pos.reportsTo = e.target.value || null; });
  document.getElementById('posHasLeadership').addEventListener('change', (e) => { pos.hasLeadership = e.target.checked; });
  document.getElementById('addItemBtn').addEventListener('click', () => {
    pos.phases[posEditorActivePhase].push({ id: '', label: '', weight: 2, auto: false });
    renderPosItems();
  });
  document.getElementById('savePosBtn').addEventListener('click', savePosition);
  document.getElementById('delPosBtn').addEventListener('click', deleteCurrentPosition);
}

function renderPosItems() {
  const wrap = document.getElementById('posItemsWrap');
  const pos = posEditorData.positions[posEditorActiveKey];
  const items = pos.phases[posEditorActivePhase];
  if (!items.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:20px 0;">Chưa có việc nào trong giai đoạn này. Bấm "+ Thêm việc" bên dưới.</div>`;
    return;
  }
  wrap.innerHTML = items.map((it, idx) => `
    <div class="item-row" data-idx="${idx}">
      <input type="text" value="${escapeHtml(it.label)}" placeholder="Nội dung công việc..." data-f="label">
      <select data-f="weight">
        <option value="3" ${it.weight === 3 ? 'selected' : ''}>Trọng yếu (3đ)</option>
        <option value="2" ${it.weight === 2 ? 'selected' : ''}>Quan trọng (2đ)</option>
        <option value="1" ${it.weight === 1 ? 'selected' : ''}>Thường quy (1đ)</option>
      </select>
      <label class="auto-toggle"><input type="checkbox" data-f="auto" ${it.auto ? 'checked' : ''}> Tự động</label>
      <button class="rm-item" title="Xoá việc này">×</button>
    </div>
  `).join('');
  wrap.querySelectorAll('.item-row').forEach((row) => {
    const idx = Number(row.dataset.idx);
    row.querySelector('[data-f="label"]').addEventListener('input', (e) => { items[idx].label = e.target.value; });
    row.querySelector('[data-f="weight"]').addEventListener('change', (e) => { items[idx].weight = Number(e.target.value); });
    row.querySelector('[data-f="auto"]').addEventListener('change', (e) => { items[idx].auto = e.target.checked; });
    row.querySelector('.rm-item').addEventListener('click', () => {
      items.splice(idx, 1);
      renderPosItems();
    });
  });
}

async function savePosition() {
  const pos = posEditorData.positions[posEditorActiveKey];
  if (!pos.label || !pos.label.trim()) { toast('Tên vị trí không được để trống'); return; }
  for (const ph of PHASE_ORDER) {
    for (const it of pos.phases[ph]) {
      if (!it.label || !it.label.trim()) { toast('Còn 1 việc trống nội dung — vui lòng điền hoặc xoá dòng đó'); return; }
    }
  }
  try {
    const updated = await api('/positions/' + posEditorActiveKey, {
      method: 'PUT',
      body: JSON.stringify({ label: pos.label, tier: pos.tier, reportsTo: pos.reportsTo, hasLeadership: pos.hasLeadership, phases: pos.phases }),
    });
    posEditorData.positions[posEditorActiveKey] = updated;
    toast('Đã lưu — áp dụng ngay cho toàn bộ nhân sự vị trí này');
    renderPosList();
    renderPosEditor();
    CONFIG = await api('/employees/config/positions'); // đồng bộ lại nơi khác đang dùng danh mục vị trí
  } catch (e) { toast(e.message); }
}

async function deleteCurrentPosition() {
  const pos = posEditorData.positions[posEditorActiveKey];
  if (!confirm(`Xoá hẳn vị trí "${pos.label}"? Thao tác này không thể hoàn tác.`)) return;
  try {
    await api('/positions/' + posEditorActiveKey, { method: 'DELETE' });
    delete posEditorData.positions[posEditorActiveKey];
    posEditorActiveKey = Object.keys(posEditorData.positions)[0] || null;
    toast('Đã xoá vị trí');
    renderPosList();
    renderPosEditor();
    CONFIG = await api('/employees/config/positions');
  } catch (e) { toast(e.message); }
}

function openNewPosModal() {
  document.getElementById('np_label').value = '';
  const tierSel = document.getElementById('np_tier');
  tierSel.innerHTML = posEditorData.tiers.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join('');
  const rtSel = document.getElementById('np_reportsTo');
  rtSel.innerHTML = '<option value="">— Không (đứng đầu) —</option>' + Object.entries(posEditorData.positions).map(([k, p]) => `<option value="${k}">${escapeHtml(p.label)}</option>`).join('');
  document.getElementById('np_hasLeadership').checked = false;
  openModal('newPosModalBackdrop');
}
document.getElementById('saveNewPosBtn').addEventListener('click', async () => {
  const label = document.getElementById('np_label').value.trim();
  const tier = Number(document.getElementById('np_tier').value);
  const reportsTo = document.getElementById('np_reportsTo').value || null;
  const hasLeadership = document.getElementById('np_hasLeadership').checked;
  if (!label) { toast('Vui lòng nhập tên vị trí'); return; }
  try {
    const created = await api('/positions', { method: 'POST', body: JSON.stringify({ label, tier, reportsTo, hasLeadership }) });
    closeModal('newPosModalBackdrop');
    toast('Đã tạo vị trí mới — vào sửa để thêm checklist cho vị trí này');
    posEditorData = await api('/positions');
    posEditorActiveKey = created.key;
    posEditorActivePhase = 'moCa';
    renderPosList();
    renderPosEditor();
    CONFIG = await api('/employees/config/positions');
    fillPositionSelect();
  } catch (e) { toast(e.message); }
});

/* ============================================================================
   ĐỔI PIN CỦA CHÍNH MÌNH
   ========================================================================= */
document.getElementById('changePinBtn').addEventListener('click', () => {
  document.getElementById('pinOld').value = '';
  document.getElementById('pinNew').value = '';
  openModal('pinModalBackdrop');
});
document.getElementById('savePinBtn').addEventListener('click', async () => {
  const oldPin = document.getElementById('pinOld').value.trim();
  const newPin = document.getElementById('pinNew').value.trim();
  try {
    await api('/auth/change-pin', { method: 'POST', body: JSON.stringify({ oldPin, newPin }) });
    toast('Đã đổi mã PIN thành công');
    closeModal('pinModalBackdrop');
  } catch (e) { toast(e.message); }
});
