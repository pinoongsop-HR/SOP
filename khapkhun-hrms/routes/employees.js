const express = require('express');
const router = express.Router();
const { getData, save, saveSync } = require('../lib/db');
const { hashPin } = require('../lib/auth');
const { requireAuth, requireAdmin, visibleEmployeeIds } = require('../middleware/authMiddleware');
const { POSITIONS, TIERS, descendantPositions, allItemsOfPosition, competenciesFor, PHASE_LABELS } = require('../config/positions');
const { computeEmployeeToday, classify } = require('../lib/kpi');

function publicEmployee(emp) {
  const db = getData();
  const pos = POSITIONS[emp.position];
  const c = computeEmployeeToday(emp);
  return {
    id: emp.id, employeeCode: emp.employeeCode, name: emp.name, position: emp.position,
    positionLabel: pos ? pos.label : emp.position, tier: pos ? pos.tier : null,
    branch: emp.branch, phone: emp.phone, startDate: emp.startDate, status: emp.status,
    isAdmin: !!emp.isAdmin, isManager: !!(pos && pos.hasLeadership),
    competency: db.competency[emp.id] || {},
    today: { taskScore: c.taskScore, compScore: c.compScore, kpi: c.kpi, phases: c.phases, missingCount: c.missing.length, missingCriticalCount: c.missingCritical.length },
    classification: classify(c.kpi),
  };
}

// Danh sách cấu hình tĩnh (tầng, vị trí) - để frontend dựng form / sơ đồ
router.get('/config/positions', requireAuth, (req, res) => {
  const positions = Object.entries(POSITIONS).map(([key, p]) => ({
    key, label: p.label, tier: p.tier, reportsTo: p.reportsTo, hasLeadership: !!p.hasLeadership,
    isTopManager: !!p.isTopManager, itemCount: allItemsOfPosition(key).length,
  }));
  res.json({ tiers: TIERS, positions, phaseLabels: PHASE_LABELS });
});

// Danh sách nhân sự trong phạm vi được xem (chính mình / đội mình / toàn bộ nếu admin)
router.get('/', requireAuth, (req, res) => {
  const db = getData();
  const ids = visibleEmployeeIds(req.employee);
  const list = db.employees.filter((e) => ids.includes(e.id)).map(publicEmployee);
  res.json(list);
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getData();
  const ids = visibleEmployeeIds(req.employee);
  if (!ids.includes(req.params.id)) return res.status(403).json({ error: 'Bạn không có quyền xem nhân sự này' });
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(publicEmployee(emp));
});

// Chỉ Admin: thêm / sửa / xoá nhân sự
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { employeeCode, pin, name, position, branch, phone, startDate, status, isAdmin } = req.body || {};
  if (!employeeCode || !pin || !name || !position) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
  if (!POSITIONS[position]) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
  const db = getData();
  if (db.employees.some((e) => e.employeeCode.toLowerCase() === String(employeeCode).trim().toLowerCase())) {
    return res.status(400).json({ error: 'Mã nhân viên đã tồn tại' });
  }
  const emp = {
    id: 'e' + Math.random().toString(36).slice(2, 10),
    employeeCode: String(employeeCode).trim(),
    pinHash: hashPin(pin),
    name: name.trim(), position, branch: branch || '', phone: phone || '',
    startDate: startDate || '', status: status || 'Đang làm', isAdmin: !!isAdmin,
  };
  db.employees.push(emp);
  saveSync();
  res.json(publicEmployee(emp));
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getData();
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  const { name, position, branch, phone, startDate, status, isAdmin, resetPin } = req.body || {};
  if (position && !POSITIONS[position]) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
  if (position && position !== emp.position) {
    delete db.dailyChecklists[emp.id]; // đổi vị trí -> checklist cũ không còn phù hợp
  }
  if (name) emp.name = name.trim();
  if (position) emp.position = position;
  if (branch !== undefined) emp.branch = branch;
  if (phone !== undefined) emp.phone = phone;
  if (startDate !== undefined) emp.startDate = startDate;
  if (status !== undefined) emp.status = status;
  if (isAdmin !== undefined) emp.isAdmin = !!isAdmin;
  if (resetPin) {
    if (!/^\d{4}$/.test(String(resetPin))) return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
    emp.pinHash = hashPin(resetPin);
  }
  saveSync();
  res.json(publicEmployee(emp));
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getData();
  const before = db.employees.length;
  db.employees = db.employees.filter((e) => e.id !== req.params.id);
  if (db.employees.length === before) return res.status(404).json({ error: 'Không tìm thấy' });
  delete db.dailyChecklists[req.params.id];
  saveSync();
  res.json({ ok: true });
});

// Chấm điểm năng lực (Admin hoặc Quản lý trong phạm vi mình phụ trách)
router.put('/:id/competency', requireAuth, (req, res) => {
  const db = getData();
  const ids = visibleEmployeeIds(req.employee);
  if (!ids.includes(req.params.id) || req.params.id === req.employee.id) {
    if (!req.employee.isAdmin) return res.status(403).json({ error: 'Bạn không có quyền chấm điểm nhân sự này' });
  }
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  const { compId, value } = req.body || {};
  const validIds = competenciesFor(emp.position).map((c) => c.id);
  if (!validIds.includes(compId)) return res.status(400).json({ error: 'Tiêu chí năng lực không hợp lệ' });
  const v = Number(value);
  if (!(v >= 1 && v <= 5)) return res.status(400).json({ error: 'Điểm phải từ 1 đến 5' });
  if (!db.competency[emp.id]) db.competency[emp.id] = {};
  db.competency[emp.id][compId] = v;
  save();
  res.json(publicEmployee(emp));
});

module.exports = router;
