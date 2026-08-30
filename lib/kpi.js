const { getPositions, descendantPositions, competenciesFor } = require('./positionsStore');
const { getData } = require('./db');

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// Nhiều nhân sự có thể CÙNG giữ 1 vị trí (VD 2 người cùng là "NV Xôi") — checklist
// của họ là 1 BẢNG DÙNG CHUNG theo vị trí + chi nhánh, không phải mỗi người 1 bảng
// riêng. groupKey xác định "bảng chung" đó.
function groupKeyFor(emp) {
  return `${emp.position || ''}::${emp.branch || ''}`;
}

function getOrCreateGroupChecklist(groupKey) {
  const db = getData();
  const today = todayStr();
  const existing = db.dailyChecklists[groupKey];
  if (existing && existing.date === today) return existing;
  const fresh = { date: today, moCa: {}, giaoCa: {}, dongCa: {} };
  db.dailyChecklists[groupKey] = fresh;
  return fresh;
}

function phasePctFromMap(items, doneMap) {
  const totalW = items.reduce((s, it) => s + it.weight, 0) || 1;
  const doneW = items.reduce((s, it) => s + (doneMap[it.id] ? it.weight : 0), 0);
  return (doneW / totalW) * 100;
}

// Tính % hoàn thành SOP hôm nay — DÙNG CHUNG cho mọi nhân sự cùng vị trí + chi nhánh
// (vì checklist là bảng chung). Các đầu việc auto:true (chỉ có ở Tầng 2-3-4) không
// đọc từ bảng tick tay, mà tự suy ra từ % hoàn thành của đội nhóm cấp dưới.
function ownTaskScoreToday(emp) {
  if (!emp.position) return { taskScore: 0, missing: [], missingCritical: [], phases: { moCa: 0, giaoCa: 0, dongCa: 0 } };
  const pos = getPositions()[emp.position];
  if (!pos) return { taskScore: 0, missing: [], missingCritical: [], phases: { moCa: 0, giaoCa: 0, dongCa: 0 } };

  const groupKey = groupKeyFor(emp);
  const checklist = getOrCreateGroupChecklist(groupKey);
  const teamPctForAuto = pos.hasLeadership ? teamScoreFor(emp) : null;

  const phases = {};
  let totalW = 0, doneW = 0;
  const missing = [], missingCritical = [];
  for (const phaseKey of ['moCa', 'giaoCa', 'dongCa']) {
    const items = pos.phases[phaseKey] || [];
    const doneMap = checklist[phaseKey] || {};
    let phaseTotalW = 0, phaseDoneW = 0;
    items.forEach((it) => {
      totalW += it.weight; phaseTotalW += it.weight;
      const isDone = it.auto ? (teamPctForAuto != null && teamPctForAuto >= 100) : !!doneMap[it.id];
      if (isDone) { doneW += it.weight; phaseDoneW += it.weight; }
      else {
        missing.push({ ...it, phase: phaseKey });
        if (it.weight === 3) missingCritical.push({ ...it, phase: phaseKey });
      }
    });
    phases[phaseKey] = phaseTotalW ? (phaseDoneW / phaseTotalW) * 100 : 0;
  }
  const taskScore = totalW ? (doneW / totalW) * 100 : 0;
  return { taskScore, missing, missingCritical, phases };
}

// "Chữ ký" — trong 1 vị trí dùng chung, tỷ lệ % số đầu việc (theo trọng số) mà
// CHÍNH nhân sự này đã tick / tổng số đầu việc CẢ NHÓM đã hoàn thành hôm nay.
// Dùng để so sánh hiệu suất cá nhân giữa những người cùng vị trí (VD A và B cùng
// làm NV Xôi, B ký nhận nhiều việc hơn A thì contributionShare của B cao hơn).
function contributionShare(emp) {
  if (!emp.position) return { myWeight: 0, groupDoneWeight: 0, pct: 0, myCount: 0, groupDoneCount: 0 };
  const pos = getPositions()[emp.position];
  if (!pos) return { myWeight: 0, groupDoneWeight: 0, pct: 0, myCount: 0, groupDoneCount: 0 };
  const groupKey = groupKeyFor(emp);
  const checklist = getOrCreateGroupChecklist(groupKey);
  let myWeight = 0, groupDoneWeight = 0, myCount = 0, groupDoneCount = 0;
  for (const phaseKey of ['moCa', 'giaoCa', 'dongCa']) {
    const items = pos.phases[phaseKey] || [];
    const doneMap = checklist[phaseKey] || {};
    items.forEach((it) => {
      if (it.auto) return; // việc tự động không tính "ai ký"
      const entry = doneMap[it.id];
      if (entry) {
        groupDoneWeight += it.weight; groupDoneCount++;
        if (entry.by === emp.id) { myWeight += it.weight; myCount++; }
      }
    });
  }
  return { myWeight, groupDoneWeight, myCount, groupDoneCount, pct: groupDoneWeight ? (myWeight / groupDoneWeight) * 100 : 0 };
}

function compScoreOf(emp) {
  const db = getData();
  const comps = competenciesFor(emp.position);
  const vals = db.competency[emp.id] || {};
  const scores = comps.map((c) => vals[c.id] || 0).filter((v) => v > 0);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return (avg / 5) * 100;
}

// % SOP trung bình của đội nhóm cấp dưới. Nếu 1 nhân sự Tầng 1 đã được gán
// managerId cụ thể (trường hợp nhiều Quản Lý Ca / nhiều Bếp Trưởng cùng vị trí,
// cần tách rõ ai quản ai), CHỈ tính người đó vào đúng quản lý được gán — không
// dùng suy luận theo vị trí+chi nhánh cho những người đã có managerId.
function teamScoreFor(managerEmployee) {
  const db = getData();
  const descPos = descendantPositions(managerEmployee.position);
  if (!descPos.length) return null;
  const emps = db.employees.filter((e) => {
    if (e.status === 'Nghỉ việc' || e.isAdmin || e.isRegionalManager) return false;
    if (e.managerId) return e.managerId === managerEmployee.id && descPos.includes(e.position);
    if (!descPos.includes(e.position)) return false;
    if (managerEmployee.branch && e.branch && managerEmployee.branch !== e.branch) return false;
    return true;
  });
  if (!emps.length) return null;
  // nhiều người cùng vị trí+chi nhánh dùng CHUNG 1 checklist -> loại trùng theo
  // groupKey để không tính lặp cùng 1 con số nhiều lần trong trung bình.
  const seenGroups = new Set();
  const scores = [];
  emps.forEach((e) => {
    const gk = groupKeyFor(e);
    if (seenGroups.has(gk)) return;
    seenGroups.add(gk);
    scores.push(ownTaskScoreToday(e).taskScore);
  });
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function computeEmployeeToday(emp) {
  const db = getData();
  const pos = getPositions()[emp.position];
  const { taskScore, missing, missingCritical, phases } = ownTaskScoreToday(emp);
  const compScore = compScoreOf(emp);
  const wt = db.weights.task, wc = db.weights.comp;
  const wsum = (wt + wc) || 1;
  const contribution = contributionShare(emp);

  if (pos && pos.hasLeadership) {
    const team = teamScoreFor(emp);
    let wOwn = 40, wTeam = 30, wComp = 30;
    if (pos.isTopManager) { wOwn = 25; wTeam = 50; wComp = 25; }
    const teamVal = team == null ? taskScore : team;
    const kpi = (taskScore * wOwn + teamVal * wTeam + compScore * wComp) / 100;
    return { taskScore, compScore, kpi, missing, missingCritical, team, teamWeights: { wOwn, wTeam, wComp }, phases, contribution };
  }
  const kpi = (taskScore * wt + compScore * wc) / wsum;
  return { taskScore, compScore, kpi, missing, missingCritical, team: null, phases, contribution };
}

const CLASS_THRESHOLDS = [
  { min: 90, label: 'Xuất sắc' },
  { min: 80, label: 'Tốt' },
  { min: 65, label: 'Khá' },
  { min: 50, label: 'Trung bình' },
  { min: 0, label: 'Yếu' },
];
function classify(kpi) {
  for (const t of CLASS_THRESHOLDS) if (kpi >= t.min) return t;
  return CLASS_THRESHOLDS[CLASS_THRESHOLDS.length - 1];
}

const BONUS_RULES = [
  { min: 95, label: 'Đề xuất thưởng nóng', tone: 'excellent', reason: 'KPI xuất sắc, vượt chuẩn rõ rệt' },
  { min: 90, label: 'Đề xuất thưởng đầy đủ', tone: 'excellent', reason: 'KPI xuất sắc, đạt chuẩn thưởng cao nhất' },
  { min: 80, label: 'Đề xuất thưởng chuẩn', tone: 'good', reason: 'KPI đạt chuẩn (≥80)' },
  { min: 65, label: 'Chưa đề xuất thưởng thêm', tone: 'ok', reason: 'KPI khá, cần cải thiện thêm để đạt thưởng' },
  { min: 50, label: 'Cần theo dõi, chưa thưởng', tone: 'warn', reason: 'KPI trung bình, dưới chuẩn thưởng' },
  { min: 0, label: 'Cần nhắc nhở / xem xét', tone: 'danger', reason: 'KPI yếu, dưới chuẩn nhiều' },
];
function suggestBonus(kpi) {
  for (const r of BONUS_RULES) if (kpi >= r.min) return r;
  return BONUS_RULES[BONUS_RULES.length - 1];
}

// Chốt ngày: chỉ LƯU SNAPSHOT điểm hôm nay vào lịch sử cá nhân — KHÔNG xoá bảng
// checklist (vì là bảng dùng chung cho cả vị trí, người khác có thể chưa xong).
// Bảng checklist tự làm mới khi sang ngày mới (theo groupKeyFor + kiểm tra date).
function closeDayForEmployee(employeeId) {
  const db = getData();
  const emp = db.employees.find((e) => e.id === employeeId);
  if (!emp) throw new Error('Không tìm thấy nhân sự');
  if (!emp.position) throw new Error('Tài khoản quản trị không có checklist để chốt');
  const c = computeEmployeeToday(emp);
  const checklist = getOrCreateGroupChecklist(groupKeyFor(emp));
  const entry = {
    id: 'h' + Math.random().toString(36).slice(2, 10),
    employeeId,
    date: checklist.date,
    moCaPct: c.phases.moCa,
    giaoCaPct: c.phases.giaoCa,
    dongCaPct: c.phases.dongCa,
    taskScore: c.taskScore,
    compScore: c.compScore,
    kpi: c.kpi,
    missingCount: c.missing.length,
    contributionPct: c.contribution.pct,
    closedAt: new Date().toISOString(),
  };
  const existingIdx = db.history.findIndex((h) => h.employeeId === employeeId && h.date === checklist.date);
  if (existingIdx >= 0) db.history[existingIdx] = { ...db.history[existingIdx], ...entry, id: db.history[existingIdx].id };
  else db.history.push(entry);
  return entry;
}

function rollupForEmployee(employeeId, fromDate, toDate) {
  const db = getData();
  const entries = db.history.filter((h) => h.employeeId === employeeId && h.date >= fromDate && h.date <= toDate);
  if (!entries.length) return { count: 0, avgKpi: 0, pctAchieved: 0, avgTaskScore: 0, avgCompScore: 0, avgContribution: 0 };
  const avgKpi = entries.reduce((s, e) => s + e.kpi, 0) / entries.length;
  const avgTaskScore = entries.reduce((s, e) => s + e.taskScore, 0) / entries.length;
  const avgCompScore = entries.reduce((s, e) => s + e.compScore, 0) / entries.length;
  const avgContribution = entries.reduce((s, e) => s + (e.contributionPct || 0), 0) / entries.length;
  const achieved = entries.filter((e) => e.kpi >= 80).length;
  const pctAchieved = (achieved / entries.length) * 100;
  return { count: entries.length, avgKpi, pctAchieved, avgTaskScore, avgCompScore, avgContribution };
}

function dateRangeFor(period, year, quarter, month) {
  if (period === 'month') {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
  }
  if (period === 'quarter') {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const to = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function monthlyTrendForEmployee(employeeId, months = 12) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const { from, to } = dateRangeFor('month', year, null, month);
    const r = rollupForEmployee(employeeId, from, to);
    out.push({ year, month, label: `${String(month).padStart(2, '0')}/${year}`, avgKpi: Math.round(r.avgKpi * 10) / 10, count: r.count });
  }
  return out;
}

module.exports = {
  todayStr,
  groupKeyFor,
  getOrCreateGroupChecklist,
  ownTaskScoreToday,
  contributionShare,
  compScoreOf,
  teamScoreFor,
  computeEmployeeToday,
  classify,
  suggestBonus,
  closeDayForEmployee,
  rollupForEmployee,
  dateRangeFor,
  monthlyTrendForEmployee,
};
