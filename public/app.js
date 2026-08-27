/* ============================================================================
   STATE
   ========================================================================= */
let TOKEN = localStorage.getItem('kk_token') || null;
let ME = null;
let CONFIG = null; // { tiers, positions, phaseLabels }
let currentView = 'checklist';
let currentChecklistEmployeeId = null; // ai đang được xem trong "Checklist của tôi" (thường là ME.id)
let currentChecklistTab = 'moCa';

const PHASE_ORDER = ['moCa', 'giaoCa', 'dongCa'];

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
  document.getElementById('sidebarRole').textContent = ME.isAdmin ? 'Admin · ' + ME.positionLabel : ME.positionLabel;
  buildNav();
  currentChecklistEmployeeId = ME.id;
  switchView('checklist');
  fillPositionSelect();
}
boot();

/* ============================================================================
   NAV
   ========================================================================= */
function buildNav() {
  const nav = document.getElementById('navButtons');
  const items = [{ key: 'checklist', label: '✅ Checklist của tôi' }];
  if (ME.isManager || ME.isAdmin) items.push({ key: 'team', label: '👥 Đội nhóm của tôi' });
  items.push({ key: 'kpi', label: '📊 Bảng KPI tổng hợp' });
  if (ME.isAdmin) items.push({ key: 'staff', label: '🗂️ Quản lý nhân sự' });
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
}

/* ============================================================================
   VIEW: CHECKLIST CỦA TÔI (3 giai đoạn)
   ========================================================================= */
async function renderChecklistView() {
  const empId = currentChecklistEmployeeId || ME.id;
  const el = document.getElementById('view-checklist');
  el.innerHTML = `<div class="empty-state">Đang tải checklist...</div>`;
  let data;
  try { data = await api('/checklist/' + empId); }
  catch (e) { el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  const cls = { label: data.classification.label, cls: classCls(data.classification.label) };
  const phaseLabels = CONFIG.phaseLabels;

  el.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Checklist Hôm Nay</h1>
        <div class="sub">${new Date(data.date).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      <button class="btn btn-teal" id="closeDayBtn">✓ Chốt ngày — lưu vào lịch sử KPI</button>
    </div>

    <div class="kpi-summary">
      <div class="kpi-card"><div class="num" style="color:${barColor(data.taskScore)}">${data.taskScore.toFixed(0)}%</div><div class="lbl">Hoàn thành SOP</div></div>
      <div class="kpi-card"><div class="num" style="color:${barColor(data.compScore)}">${data.compScore.toFixed(0)}%</div><div class="lbl">Năng lực</div></div>
      <div class="kpi-card"><div class="num">${data.kpi.toFixed(1)}</div><div class="lbl">KPI hôm nay · <span class="pill ${cls.cls}">${cls.label}</span></div></div>
    </div>

    ${data.missingCritical.length ? `
      <div class="missing-box">
        <div class="mh">⚠ ${data.missingCritical.length} việc TRỌNG YẾU chưa hoàn thành</div>
        <ul>${data.missingCritical.map((m) => `<li>${escapeHtml(m.label)} <em style="color:var(--muted); font-style:normal;">(${phaseLabels[m.phase]})</em></li>`).join('')}</ul>
      </div>` : ''}

    <div class="tabs" id="checklistTabs">
      ${PHASE_ORDER.map((key) => {
        const ph = data.phases.find((p) => p.key === key);
        return `<button class="tab-btn ${currentChecklistTab === key ? 'active' : ''}" data-tab="${key}">${phaseLabels[key]} <span class="pct" style="color:${barColor(ph.pct)}">${ph.pct.toFixed(0)}%</span></button>`;
      }).join('')}
    </div>

    <div class="card pad" id="checklistItemsWrap"></div>
  `;

  renderChecklistItems(data);

  el.querySelectorAll('#checklistTabs .tab-btn').forEach((b) => {
    b.addEventListener('click', () => { currentChecklistTab = b.dataset.tab; renderChecklistView(); });
  });

  document.getElementById('closeDayBtn').addEventListener('click', async () => {
    if (!confirm(`Chốt ngày với KPI ${data.kpi.toFixed(1)} (${data.missing.length} việc còn thiếu)?\nDữ liệu sẽ được lưu vào lịch sử KPI tháng/quý/năm.`)) return;
    try {
      await api('/checklist/' + empId + '/close-day', { method: 'POST' });
      toast('Đã chốt ngày và lưu vào lịch sử');
      renderChecklistView();
    } catch (e) { toast(e.message); }
  });
}

function renderChecklistItems(data) {
  const wrap = document.getElementById('checklistItemsWrap');
  const phase = data.phases.find((p) => p.key === currentChecklistTab);
  if (!phase.items.length) {
    wrap.innerHTML = `<div class="empty-state">Vị trí này chưa có đầu việc nào cho giai đoạn "${CONFIG.phaseLabels[currentChecklistTab]}".</div>`;
    return;
  }
  wrap.innerHTML = phase.items.map((it) => `
    <label class="check-item ${it.checked ? 'checked' : ''} ${!it.checked && it.weight === 3 ? 'critical' : ''}">
      <input type="checkbox" ${it.checked ? 'checked' : ''} data-item="${it.id}">
      <span class="check-label">${escapeHtml(it.label)}</span>
      <span class="check-weight w${it.weight}">${it.weight === 3 ? 'Trọng yếu' : it.weight === 2 ? 'Quan trọng' : 'Thường quy'}</span>
    </label>
  `).join('');
  wrap.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', async (ev) => {
      const itemId = ev.target.dataset.item;
      try {
        await api('/checklist/' + (currentChecklistEmployeeId || ME.id) + '/item', {
          method: 'PATCH',
          body: JSON.stringify({ phase: currentChecklistTab, itemId, checked: ev.target.checked }),
        });
        renderChecklistView();
      } catch (e) { toast(e.message); ev.target.checked = !ev.target.checked; }
    });
  });
}

/* ============================================================================
   VIEW: ĐỘI NHÓM CỦA TÔI (Quản lý / Admin)
   ========================================================================= */
async function renderTeamView() {
  const el = document.getElementById('view-team');
  el.innerHTML = `<div class="empty-state">Đang tải...</div>`;
  let list;
  try { list = await api('/kpi/today'); }
  catch (e) { el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  list.sort((a, b) => b.kpi - a.kpi);
  const total = list.length;
  const avg = total ? list.reduce((s, e) => s + e.kpi, 0) / total : 0;
  const good = list.filter((e) => e.kpi >= 80).length;
  const withCritical = list.filter((e) => e.missingCritical && e.missingCritical.length);

  el.innerHTML = `
    <div class="topbar">
      <div><h1>Đội Nhóm Của Tôi</h1><div class="sub">Tiến độ SOP hôm nay theo 3 giai đoạn · Mở ca / Giao ca / Đóng ca</div></div>
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
          <thead><tr><th>Tên</th><th>Vị trí</th><th>Tầng</th><th>Mở ca</th><th>Giao ca</th><th>Đóng ca</th><th>% SOP</th><th>KPI</th><th>Xếp loại</th><th></th></tr></thead>
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
      <td><button class="btn btn-sm" data-open="${e.id}">Xem chi tiết</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
}

/* ============================================================================
   VIEW: BẢNG KPI TỔNG HỢP (tháng / quý / năm)
   ========================================================================= */
let kpiPeriod = { period: 'month', year: new Date().getFullYear(), month: new Date().getMonth() + 1, quarter: Math.ceil((new Date().getMonth() + 1) / 3) };

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
  `;
  document.getElementById('periodType').addEventListener('change', (e) => { kpiPeriod.period = e.target.value; renderKpiView(); });
  document.getElementById('periodMonth').addEventListener('change', (e) => { kpiPeriod.month = Number(e.target.value); loadKpiTable(); });
  document.getElementById('periodQuarter').addEventListener('change', (e) => { kpiPeriod.quarter = Number(e.target.value); loadKpiTable(); });
  document.getElementById('periodYear').addEventListener('change', (e) => { kpiPeriod.year = Number(e.target.value); loadKpiTable(); });
  document.getElementById('exportKpiCsv').addEventListener('click', exportKpiCsv);
  await loadKpiTable();
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

/* ============================================================================
   DETAIL PANEL (xem 1 nhân sự: checklist hôm nay, năng lực, đánh giá, lịch sử)
   ========================================================================= */
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
  let emp, checklist, reviews, rollup;
  try {
    emp = await api('/employees/' + employeeId);
    checklist = await api('/checklist/' + employeeId);
    reviews = await api('/reviews/' + employeeId);
    rollup = await api('/kpi/rollup/' + employeeId + '?period=month&year=' + new Date().getFullYear() + '&month=' + (new Date().getMonth() + 1));
  } catch (e) { panel.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }

  currentCompValues = emp.competency || {};
  const compList = await getCompetencyList(emp.position);
  const isSelf = emp.id === ME.id;
  const canScore = (ME.isAdmin || ME.isManager) && !isSelf;

  panel.innerHTML = `
    <div class="emp-detail-head">
      <div>
        <h3>${escapeHtml(emp.name)}</h3>
        <div class="sub" style="color:var(--muted); font-size:12px;">${escapeHtml(emp.positionLabel)} · Tầng ${emp.tier} · Mã ${escapeHtml(emp.employeeCode)}</div>
      </div>
      <button class="close-x" id="closeDetailBtn">&times;</button>
    </div>
    <div class="emp-detail-body">
      <div class="kpi-summary">
        <div class="kpi-card"><div class="num" style="color:${barColor(emp.today.taskScore)}">${emp.today.taskScore.toFixed(0)}%</div><div class="lbl">SOP hôm nay</div></div>
        <div class="kpi-card"><div class="num" style="color:${barColor(emp.today.compScore)}">${emp.today.compScore.toFixed(0)}%</div><div class="lbl">Năng lực</div></div>
        <div class="kpi-card"><div class="num">${emp.today.kpi.toFixed(1)}</div><div class="lbl">KPI hôm nay</div></div>
      </div>

      <div class="section-title">Tiến độ checklist hôm nay (chỉ xem)</div>
      <div class="tabs">
        ${PHASE_ORDER.map((k) => {
          const ph = checklist.phases.find((p) => p.key === k);
          return `<div class="tab-btn" style="cursor:default;">${CONFIG.phaseLabels[k]} <span class="pct" style="color:${barColor(ph.pct)}">${ph.pct.toFixed(0)}%</span></div>`;
        }).join('')}
      </div>
      ${checklist.missing.length ? `
        <div class="missing-box">
          <div class="mh">⚠ ${checklist.missing.length} việc chưa hoàn thành</div>
          <ul>${checklist.missing.slice(0, 12).map((m) => `<li>${escapeHtml(m.label)} <em style="color:var(--muted); font-style:normal;">(${CONFIG.phaseLabels[m.phase]})</em></li>`).join('')}</ul>
        </div>` : `<div class="all-done-box">✓ Đã hoàn thành 100% checklist hôm nay</div>`}

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

// Lấy danh sách tiêu chí năng lực áp dụng cho vị trí (kèm giá trị hiện tại) — dùng chung config đã tải + gọi lại info nhân sự
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
   VIEW: QUẢN LÝ NHÂN SỰ (Admin)
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
  body.innerHTML = list.map((e) => `
    <tr>
      <td><b>${escapeHtml(e.name)}</b></td>
      <td>${escapeHtml(e.employeeCode)}</td>
      <td>${escapeHtml(e.positionLabel)}</td>
      <td>${escapeHtml(e.branch || '—')}</td>
      <td style="color:var(--muted);">${escapeHtml(e.phone || '—')}</td>
      <td>${escapeHtml(e.status)}</td>
      <td>${e.isAdmin ? '<span class="pill pill-xs">Admin</span>' : (e.isManager ? '<span class="pill pill-t">Quản lý</span>' : '—')}</td>
      <td><strong>${e.today.kpi.toFixed(1)}</strong></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-open="${e.id}">Xem</button>
        <button class="btn btn-sm" data-edit="${e.id}">Sửa</button>
        <button class="btn btn-danger btn-sm" data-del="${e.id}">Xoá</button>
      </td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openStaffModal(b.dataset.edit, list)));
  body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const emp = list.find((e) => e.id === b.dataset.del);
    if (!emp) return;
    if (!confirm(`Xoá nhân sự "${emp.name}"? Toàn bộ checklist hôm nay của người này sẽ bị xoá theo (lịch sử KPI vẫn giữ nguyên).`)) return;
    try { await api('/employees/' + emp.id, { method: 'DELETE' }); toast('Đã xoá nhân sự'); renderStaffView(); }
    catch (e) { toast(e.message); }
  }));
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
  document.getElementById('f_position').value = emp ? emp.position : (CONFIG.positions[0] ? CONFIG.positions[0].key : '');
  document.getElementById('f_branch').value = emp ? (emp.branch || 'Khạp Khun') : 'Khạp Khun';
  document.getElementById('f_phone').value = emp ? (emp.phone || '') : '';
  document.getElementById('f_start').value = emp ? (emp.startDate || '') : '';
  document.getElementById('f_status').value = emp ? emp.status : 'Đang làm';
  document.getElementById('f_isAdmin').checked = emp ? !!emp.isAdmin : false;
  openModal('staffModalBackdrop');
}

document.getElementById('saveStaffBtn').addEventListener('click', async () => {
  const id = document.getElementById('f_id').value;
  const payload = {
    name: document.getElementById('f_name').value.trim(),
    position: document.getElementById('f_position').value,
    branch: document.getElementById('f_branch').value,
    phone: document.getElementById('f_phone').value.trim(),
    startDate: document.getElementById('f_start').value,
    status: document.getElementById('f_status').value,
    isAdmin: document.getElementById('f_isAdmin').checked,
  };
  const pin = document.getElementById('f_pin').value.trim();
  if (!payload.name) { toast('Vui lòng nhập họ tên'); return; }
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
