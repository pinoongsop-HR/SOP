const express = require('express');
const router = express.Router();
const { getData } = require('../lib/db');
const { requireAuth, visibleEmployeeIds, isPrivileged } = require('../middleware/authMiddleware');
const { getPositions } = require('../lib/positionsStore');
const { rollupForEmployee, dateRangeFor, computeEmployeeToday, classify, suggestBonus, monthlyTrendForEmployee } = require('../lib/kpi');

// Admin / Quản Lý Vùng chỉ GIAO việc, không tham gia checklist/KPI — luôn loại
// khỏi mọi danh sách liên quan tới chấm điểm.
function excludeSystemAccounts(list) {
  return list.filter((e) => !e.isAdmin && !e.isRegionalManager);
}

router.get('/today', requireAuth, (req, res) => {
  const db = getData();
  const POSITIONS = getPositions();
  const ids = visibleEmployeeIds(req.employee);
  const scoped = excludeSystemAccounts(db.employees.filter((e) => ids.includes(e.id)));
  const list = scoped.map((emp) => {
    const c = computeEmployeeToday(emp);
    const pos = POSITIONS[emp.position];
    return {
      id: emp.id, name: emp.name, position: emp.position, positionLabel: pos ? pos.label : emp.position,
      tier: pos ? pos.tier : null, branch: emp.branch,
      taskScore: c.taskScore, compScore: c.compScore, kpi: c.kpi, phases: c.phases,
      missingCount: c.missing.length, missingCritical: c.missingCritical,
      classification: classify(c.kpi),
      bonusSuggestion: suggestBonus(c.kpi),
      contribution: c.contribution,
    };
  });
  res.json({ list, viewerIsPrivileged: isPrivileged(req.employee) });
});

router.get('/rollup', requireAuth, (req, res) => {
  const { period = 'month', year, month, quarter } = req.query;
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const q = Number(quarter) || Math.ceil(m / 3);
  const { from, to } = dateRangeFor(period, y, q, m);

  const db = getData();
  const POSITIONS = getPositions();
  const ids = visibleEmployeeIds(req.employee);
  const scoped = excludeSystemAccounts(db.employees.filter((e) => ids.includes(e.id)));
  const list = scoped.map((emp) => {
    const pos = POSITIONS[emp.position];
    const r = rollupForEmployee(emp.id, from, to);
    return {
      id: emp.id, name: emp.name, position: emp.position, positionLabel: pos ? pos.label : emp.position,
      tier: pos ? pos.tier : null, branch: emp.branch,
      ...r,
      classification: classify(r.avgKpi),
      bonusSuggestion: suggestBonus(r.avgKpi),
    };
  });
  res.json({ period, from, to, employees: list });
});

router.get('/rollup/:employeeId', requireAuth, (req, res) => {
  if (!visibleEmployeeIds(req.employee).includes(req.params.employeeId)) {
    return res.status(403).json({ error: 'Không có quyền xem' });
  }
  const { period = 'month', year, month, quarter } = req.query;
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const q = Number(quarter) || Math.ceil(m / 3);
  const { from, to } = dateRangeFor(period, y, q, m);
  const r = rollupForEmployee(req.params.employeeId, from, to);
  res.json({ period, from, to, ...r, classification: classify(r.avgKpi) });
});

router.get('/trend/:employeeId', requireAuth, (req, res) => {
  if (!visibleEmployeeIds(req.employee).includes(req.params.employeeId)) {
    return res.status(403).json({ error: 'Không có quyền xem' });
  }
  const months = Math.min(24, Math.max(3, Number(req.query.months) || 12));
  res.json({ employeeId: req.params.employeeId, months: monthlyTrendForEmployee(req.params.employeeId, months) });
});

module.exports = router;
