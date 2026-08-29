const express = require('express');
const router = express.Router();
const { getData, save, saveSync } = require('../lib/db');
const { hashPin } = require('../lib/auth');
const { requireAuth, requireAdmin, requireSuperAdmin, visibleEmployeeIds, isPrivileged } = require('../middleware/authMiddleware');
const { getPositions, TIERS, allItemsOfPosition, competenciesFor, PHASE_LABELS } = require('../lib/positionsStore');
const { computeEmployeeToday, classify, suggestBonus } = require('../lib/kpi');

function publicEmployee(emp) {
  const db = getData();
  const pos = getPositions()[emp.position];
  const c = computeEmployeeToday(emp);
  return {
    id: emp.id, employeeCode: emp.employeeCode, name: emp.name, position: emp.position,
    positionLabel: pos ? pos.label : emp.position, tier: pos ? pos.tier : null,
    branch: emp.branch, phone: emp.phone, startDate: emp.startDate, status: emp.status,
    isAdmin: !!emp.isAdmin, isRegionalManager: !!emp.isRegionalManager, isManager: !!(pos && pos.hasLeadership),
    competency: db.competency[emp.id] || {},
    today: { taskScore: c.taskScore, compScore: c.compScore, kpi: c.kpi, phases: c.phases, missingCount: c.missing.length, missingCriticalCount: c.missingCritical.length },
    classification: classify(c.kpi),
    bonusSuggestion: suggestBonus(c.kpi),
  };
}

// Danh sách cấu hình (tầng, vị trí) - để frontend dựng form / sơ đồ. Đọc động từ Postgres.
router.get('/config/positions', requireAuth, (req, res) => {
  const POSITIONS = getPositions();
  const positions = Object.entries(POSITIONS).map(([key, p]) => ({
    key, label: p.label, tier: p.tier, reportsTo: p.reportsTo, hasLeadership: !!p.hasLeadership,
    isTopManager: !!p.isTopManager, itemCount: allItemsOfPosition(key).length,
  }));
  res.json({ tiers: TIERS, positions, phaseLabels: PHASE_LABELS });
});

// Danh sách nhân sự trong phạm vi được xem (chính mình / đội mình / toàn bộ nếu admin hoặc quản lý vùng)
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

// Admin hoặc Quản Lý Vùng: thêm nhân sự.
// Chỉ Admin gốc (super admin) mới được cấp cờ isAdmin / isRegionalManager cho người khác.
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { employeeCode, pin, name, position, branch, phone, startDate, status, isAdmin, isRegionalManager } = req.body || {};
  if (!employeeCode || !pin || !name || !position) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
  if (!getPositions()[position]) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
  if ((isAdmin || isRegionalManager) && !req.employee.isAdmin) {
    return res.status(403).json({ error: 'Chỉ Admin mới được cấp quyền Admin hoặc Quản Lý Vùng cho người khác' });
  }
  const db = getData();
  if (db.employees.some((e) => e.employeeCode.toLowerCase() === String(employeeCode).trim().toLowerCase())) {
    return res.status(400).json({ error: 'Mã nhân viên đã tồn tại' });
  }
  const emp = {
    id: 'e' + Math.random().toString(36).slice(2, 10),
    employeeCode: String(employeeCode).trim(),
    pinHash: hashPin(pin),
    name: name.trim(), position, branch: branch || '', phone: phone || '',
    startDate: startDate || '', status: status || 'Đang làm',
    isAdmin: !!isAdmin, isRegionalManager: !!isRegionalManager,
  };
  db.employees.push(emp);
  saveSync();
  res.json(publicEmployee(emp));
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getData();
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });

  // Quản Lý Vùng (không phải Admin gốc) không được đụng vào tài khoản Admin gốc.
  if (emp.isAdmin && !req.employee.isAdmin) {
    return res.status(403).json({ error: 'Chỉ Admin mới được sửa tài khoản Admin' });
  }

  const { name, position, branch, phone, startDate, status, isAdmin, isRegionalManager, resetPin } = req.body || {};
  if ((isAdmin !== undefined || isRegionalManager !== undefined) && !req.employee.isAdmin) {
    return res.status(403).json({ error: 'Chỉ Admin mới được cấp/thu hồi quyền Admin hoặc Quản Lý Vùng' });
  }
  if (position && !getPositions()[position]) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
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
  if (isRegionalManager !== undefined) emp.isRegionalManager = !!isRegionalManager;
  if (resetPin) {
    if (!/^\d{4}$/.test(String(resetPin))) return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
    emp.pinHash = hashPin(resetPin);
  }
  saveSync();
  res.json(publicEmployee(emp));
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getData();
  const target = db.employees.find((e) => e.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy' });

  // Quyền tối thượng: KHÔNG AI xoá được tài khoản Admin, kể cả Quản Lý Vùng — chỉ chính
  // Admin đó (hoặc 1 Admin khác) mới xoá được 1 Admin, và không được xoá Admin cuối cùng.
  if (target.isAdmin) {
    if (!req.employee.isAdmin) return res.status(403).json({ error: 'Không có quyền xoá tài khoản Admin' });
    const adminCount = db.employees.filter((e) => e.isAdmin).length;
    if (adminCount <= 1) return res.status(400).json({ error: 'Không thể xoá Admin cuối cùng của hệ thống' });
  }

  db.employees = db.employees.filter((e) => e.id !== req.params.id);
  delete db.dailyChecklists[req.params.id];
  saveSync();
  res.json({ ok: true });
});

// Chấm điểm năng lực (Admin, Quản Lý Vùng, hoặc Quản lý trong phạm vi mình phụ trách)
router.put('/:id/competency', requireAuth, (req, res) => {
  const db = getData();
  const ids = visibleEmployeeIds(req.employee);
  if (!ids.includes(req.params.id) || req.params.id === req.employee.id) {
    if (!isPrivileged(req.employee)) return res.status(403).json({ error: 'Bạn không có quyền chấm điểm nhân sự này' });
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
