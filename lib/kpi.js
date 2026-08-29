const { getPositions, descendantPositions, competenciesFor } = require('./positionsStore');
const { getData } = require('./db');

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function getOrCreateTodayChecklist(employeeId) {
  const db = getData();
  const today = todayStr();
  const existing = db.dailyChecklists[employeeId];
  if (existing && existing.date === today) return existing;
  const fresh = { date: today, moCa: {}, giaoCa: {}, dongCa: {} };
  db.dailyChecklists[employeeId] = fresh;
  return fresh;
}

// % hoàn thành 1 giai đoạn, theo trọng số các việc
function phasePct(items, checkedMap) {
  const totalW = items.reduce((s, it) => s + it.weight, 0) || 1;
  const doneW = items.reduce((s, it) => s + (checkedMap[it.id] ? it.weight : 0), 0);
  return (doneW / totalW) * 100;
}

// Điểm % việc SOP hôm nay của 1 nhân viên (tổng hợp cả 3 giai đoạn theo trọng số)
function ownTaskScoreToday(emp) {
  const pos = getPositions()[emp.position];
  if (!pos) return { taskScore: 0, missing: [], missingCritical: [], phases: {} };
  const checklist = getOrCreateTodayChecklist(emp.id);
  const phases = {};
  let totalW = 0, doneW = 0;
  const missing = [], missingCritical = [];
  for (const phaseKey of ['moCa', 'giaoCa', 'dongCa']) {
    const items = pos.phases[phaseKey] || [];
    const checkedMap = checklist[phaseKey] || {};
    phases[phaseKey] = phasePct(items, checkedMap);
    items.forEach((it) => {
      totalW += it.weight;
      if (checkedMap[it.id]) doneW += it.weight;
      else {
        missing.push({ ...it, phase: phaseKey });
        if (it.weight === 3) missingCritical.push({ ...it, phase: phaseKey });
      }
    });
  }
  const taskScore = totalW ? (doneW / totalW) * 100 : 0;
  return { taskScore, missing, missingCritical, phases };
}

function compScoreOf(emp) {
  const db = getData();
  const comps = competenciesFor(emp.position);
  const vals = db.competency[emp.id] || {};
  const scores = comps.map((c) => vals[c.id] || 0).filter((v) => v > 0);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return (avg / 5) * 100;
}

// % SOP trung bình của toàn bộ đội nhóm CÙNG CHI NHÁNH (cấp dưới, mọi tầng) - dùng cho vị trí có hasLeadership
function teamScoreFor(managerEmployee) {
  const db = getData();
  const posKey = managerEmployee.position;
  const descPos = descendantPositions(posKey);
  if (!descPos.length) return null;
  const emps = db.employees.filter((e) => {
    if (!descPos.includes(e.position) || e.status === 'Nghỉ việc') return false;
    if (managerEmployee.branch && e.branch && managerEmployee.branch !== e.branch) return false;
    return true;
  });
  if (!emps.length) return null;
  const scores = emps.map((e) => ownTaskScoreToday(e).taskScore);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function computeEmployeeToday(emp) {
  const db = getData();
  const pos = getPositions()[emp.position];
  const { taskScore, missing, missingCritical, phases } = ownTaskScoreToday(emp);
  const compScore = compScoreOf(emp);
  const wt = db.weights.task, wc = db.weights.comp;
  const wsum = (wt + wc) || 1;

  if (pos && pos.hasLeadership) {
    const team = teamScoreFor(emp);
    let wOwn = 40, wTeam = 30, wComp = 30;
    if (pos.isTopManager) { wOwn = 25; wTeam = 50; wComp = 25; }
    const teamVal = team == null ? taskScore : team;
    const kpi = (taskScore * wOwn + teamVal * wTeam + compScore * wComp) / 100;
    return { taskScore, compScore, kpi, missing, missingCritical, team, teamWeights: { wOwn, wTeam, wComp }, phases };
  }
  const kpi = (taskScore * wt + compScore * wc) / wsum;
  return { taskScore, compScore, kpi, missing, missingCritical, team: null, phases };
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

// Đề xuất thưởng — CHỈ mang tính GỢI Ý để Admin/Quản Lý Vùng tham khảo khi xét
// thưởng, không tự động chi trả bất kỳ khoản tiền nào. Dựa trên mức KPI hôm nay.
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

// Chốt ngày: lưu snapshot điểm hôm nay vào lịch sử, KHÔNG xoá checklist (checklist tự làm mới khi sang ngày mới)
function closeDayForEmployee(employeeId) {
  const db = getData();
  const emp = db.employees.find((e) => e.id === employeeId);
  if (!emp) throw new Error('Không tìm thấy nhân sự');
  const c = computeEmployeeToday(emp);
  const checklist = getOrCreateTodayChecklist(employeeId);
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
    closedAt: new Date().toISOString(),
  };
  // nếu đã chốt hôm nay rồi thì cập nhật thay vì tạo trùng
  const existingIdx = db.history.findIndex((h) => h.employeeId === employeeId && h.date === checklist.date);
  if (existingIdx >= 0) db.history[existingIdx] = { ...db.history[existingIdx], ...entry, id: db.history[existingIdx].id };
  else db.history.push(entry);
  return entry;
}

// Tổng hợp KPI theo khoảng ngày [from, to] (định dạng 'YYYY-MM-DD'), trả về cả trung bình cộng và tỉ lệ đạt chuẩn
function rollupForEmployee(employeeId, fromDate, toDate) {
  const db = getData();
  const entries = db.history.filter((h) => h.employeeId === employeeId && h.date >= fromDate && h.date <= toDate);
  if (!entries.length) return { count: 0, avgKpi: 0, pctAchieved: 0, avgTaskScore: 0, avgCompScore: 0 };
  const avgKpi = entries.reduce((s, e) => s + e.kpi, 0) / entries.length;
  const avgTaskScore = entries.reduce((s, e) => s + e.taskScore, 0) / entries.length;
  const avgCompScore = entries.reduce((s, e) => s + e.compScore, 0) / entries.length;
  const achieved = entries.filter((e) => e.kpi >= 80).length;
  const pctAchieved = (achieved / entries.length) * 100;
  return { count: entries.length, avgKpi, pctAchieved, avgTaskScore, avgCompScore };
}

function dateRangeFor(period, year, quarter, month) {
  // period: 'month' | 'quarter' | 'year'
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

// Xu hướng KPI theo THÁNG cho 1 nhân viên, N tháng gần nhất (mặc định 12) — dùng vẽ biểu đồ cột
// để thấy "sự tiến bộ qua từng tháng". Trả về mảng theo thứ tự thời gian tăng dần.
function monthlyTrendForEmployee(employeeId, months = 12) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const { from, to } = dateRangeFor('month', year, null, month);
    const r = rollupForEmployee(employeeId, from, to);
    out.push({
      year, month,
      label: `${String(month).padStart(2, '0')}/${year}`,
      avgKpi: Math.round(r.avgKpi * 10) / 10,
      count: r.count,
    });
  }
  return out;
}

module.exports = {
  todayStr,
  getOrCreateTodayChecklist,
  ownTaskScoreToday,
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
