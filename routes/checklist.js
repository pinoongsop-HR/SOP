const express = require('express');
const router = express.Router();
const { getData, save } = require('../lib/db');
const { requireAuth, visibleEmployeeIds } = require('../middleware/authMiddleware');
const { getPositions } = require('../lib/positionsStore');
const { groupKeyFor, getOrCreateGroupChecklist, computeEmployeeToday, closeDayForEmployee, classify } = require('../lib/kpi');

function canAccess(req, employeeId) {
  return visibleEmployeeIds(req.employee).includes(employeeId);
}
function findEmp(db, id) { return db.employees.find((e) => e.id === id); }

// Lấy checklist hôm nay — ĐÂY LÀ BẢNG DÙNG CHUNG cho mọi nhân sự cùng vị trí +
// chi nhánh. Mỗi việc đã hoàn thành sẽ kèm tên người đã ký nhận (signedBy).
router.get('/:employeeId', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền xem' });
  const db = getData();
  const emp = findEmp(db, req.params.employeeId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  if (!emp.position) return res.status(400).json({ error: 'Tài khoản quản trị không có checklist' });
  const pos = getPositions()[emp.position];
  if (!pos) return res.status(400).json({ error: 'Vị trí không hợp lệ' });

  const checklist = getOrCreateGroupChecklist(groupKeyFor(emp));
  const c = computeEmployeeToday(emp);

  const groupMates = db.employees.filter((e) => e.id !== emp.id && e.position === emp.position && (e.branch || '') === (emp.branch || '') && e.status !== 'Nghỉ việc')
    .map((e) => ({ id: e.id, name: e.name }));

  res.json({
    date: checklist.date,
    sharedWith: groupMates,
    phases: ['moCa', 'giaoCa', 'dongCa'].map((key) => ({
      key,
      items: (pos.phases[key] || []).map((it) => {
        const isAuto = !!it.auto;
        const entry = isAuto ? null : checklist[key][it.id];
        const checked = isAuto ? (c.team != null && c.team >= 100) : !!entry;
        return { ...it, checked, auto: isAuto, signedBy: entry ? entry.byName : null, signedAt: entry ? entry.at : null };
      }),
      pct: c.phases[key],
    })),
    taskScore: c.taskScore, compScore: c.compScore, kpi: c.kpi,
    missing: c.missing, missingCritical: c.missingCritical,
    classification: classify(c.kpi),
    contribution: c.contribution,
  });
});

// Tick / bỏ tick 1 việc — GHI LẠI người tick (chữ ký), không chỉ true/false.
router.patch('/:employeeId/item', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền' });
  const { phase, itemId, checked } = req.body || {};
  if (!['moCa', 'giaoCa', 'dongCa'].includes(phase)) return res.status(400).json({ error: 'Giai đoạn không hợp lệ' });
  const db = getData();
  const emp = findEmp(db, req.params.employeeId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  if (!emp.position) return res.status(400).json({ error: 'Tài khoản quản trị không có checklist' });
  const pos = getPositions()[emp.position];
  const item = (pos.phases[phase] || []).find((it) => it.id === itemId);
  if (!item) return res.status(400).json({ error: 'Việc không hợp lệ cho vị trí này' });
  if (item.auto) return res.status(400).json({ error: 'Việc này tự động theo % đội nhóm, không tick tay được' });

  const checklist = getOrCreateGroupChecklist(groupKeyFor(emp));
  if (checked) {
    // Ghi chữ ký của CHÍNH người đang thao tác (req.employee) — kể cả khi quản lý
    // tick hộ nhân viên, hệ thống vẫn ghi đúng ai là người thực sự bấm tick, để
    // minh bạch (không để lộ trường hợp "A làm nhưng B tick nhận").
    checklist[phase][itemId] = { by: req.employee.id, byName: req.employee.name, at: new Date().toISOString() };
  } else {
    delete checklist[phase][itemId];
  }
  save();
  const c = computeEmployeeToday(emp);
  res.json({ ok: true, phasePct: c.phases[phase], taskScore: c.taskScore, kpi: c.kpi, contribution: c.contribution });
});

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

router.get('/:employeeId/history', requireAuth, (req, res) => {
  if (!canAccess(req, req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền' });
  const db = getData();
  const list = db.history.filter((h) => h.employeeId === req.params.employeeId).slice().reverse().slice(0, 60);
  res.json(list);
});

module.exports = router;
