const express = require('express');
const router = express.Router();
const { getData, save } = require('../lib/db');
const { requireAuth, visibleEmployeeIds } = require('../middleware/authMiddleware');
const { POSITIONS } = require('../config/positions');
const { getOrCreateTodayChecklist, computeEmployeeToday, closeDayForEmployee, classify } = require('../lib/kpi');

function canAccess(req, employeeId) {
  return visibleEmployeeIds(req.employee).includes(employeeId);
}

// Lấy checklist hôm nay của 1 nhân viên (kèm trạng thái tick)
router.get('/:employeeId', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền xem' });
  const db = getData();
  const emp = db.employees.find((e) => e.id === req.params.employeeId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  const pos = POSITIONS[emp.position];
  if (!pos) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
  const checklist = getOrCreateTodayChecklist(emp.id);
  const c = computeEmployeeToday(emp);
  res.json({
    date: checklist.date,
    phases: ['moCa', 'giaoCa', 'dongCa'].map((key) => ({
      key,
      items: (pos.phases[key] || []).map((it) => ({ ...it, checked: !!checklist[key][it.id] })),
      pct: c.phases[key],
    })),
    taskScore: c.taskScore, compScore: c.compScore, kpi: c.kpi,
    missing: c.missing, missingCritical: c.missingCritical,
    classification: classify(c.kpi),
  });
});

// Tick / bỏ tick 1 việc
router.patch('/:employeeId/item', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền' });
  const { phase, itemId, checked } = req.body || {};
  if (!['moCa', 'giaoCa', 'dongCa'].includes(phase)) return res.status(400).json({ error: 'Giai đoạn không hợp lệ' });
  const db = getData();
  const emp = db.employees.find((e) => e.id === req.params.employeeId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  const pos = POSITIONS[emp.position];
  const validItem = (pos.phases[phase] || []).some((it) => it.id === itemId);
  if (!validItem) return res.status(400).json({ error: 'Việc không hợp lệ cho vị trí này' });
  const checklist = getOrCreateTodayChecklist(emp.id);
  checklist[phase][itemId] = !!checked;
  save();
  const c = computeEmployeeToday(emp);
  res.json({ ok: true, phasePct: c.phases[phase], taskScore: c.taskScore, kpi: c.kpi });
});

// Chốt ngày - lưu snapshot vào lịch sử (nhân viên tự chốt cuối ca, hoặc quản lý chốt hộ)
router.post('/:employeeId/close-day', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền' });
  try {
    const entry = closeDayForEmployee(req.params.employeeId);
    save();
    res.json({ ok: true, entry });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Lịch sử các ngày đã chốt của 1 nhân viên (mới nhất trước)
router.get('/:employeeId/history', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền' });
  const db = getData();
  const list = db.history.filter((h) => h.employeeId === req.params.employeeId).slice().reverse().slice(0, 60);
  res.json(list);
});

module.exports = router;
