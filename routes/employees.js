const express = require('express');
const router = express.Router();
const { getData, save, saveSync } = require('../lib/db');
const { hashPin } = require('../lib/auth');
const {
  requireAuth, requireAdmin, requireSuperAdmin, visibleEmployeeIds, isPrivileged,
  blockedFromAdminAccount, isSelfEditingOwnAdminAccount,
} = require('../middleware/authMiddleware');
const { getPositions, TIERS, allItemsOfPosition, competenciesFor, PHASE_LABELS } = require('../lib/positionsStore');
const { computeEmployeeToday, classify, suggestBonus, contributionShare } = require('../lib/kpi');

function publicEmployee(emp) {
  const db = getData();
  const isSystemAccount = emp.isAdmin || emp.isRegionalManager;
  const pos = emp.position ? getPositions()[emp.position] : null;
  const base = {
    id: emp.id, employeeCode: emp.employeeCode, name: emp.name,
    position: emp.position || null,
    positionLabel: isSystemAccount ? 'Tài khoản quản trị' : (pos ? pos.label : emp.position),
    tier: pos ? pos.tier : null,
    branch: emp.branch, phone: emp.phone, startDate: emp.startDate, status: emp.status,
    managerId: emp.managerId || null,
    isAdmin: !!emp.isAdmin, isRegionalManager: !!emp.isRegionalManager, isManager: !!(pos && pos.hasLeadership),
    competency: db.competency[emp.id] || {},
  };
  if (isSystemAccount) {
    // Admin / Quản Lý Vùng không tham gia checklist & KPI — không trả số liệu gây hiểu nhầm.
    base.today = null;
    base.classification = null;
    base.bonusSuggestion = null;
    base.contribution = null;
  } else {
    const c = computeEmployeeToday(emp);
    base.today = { taskScore: c.taskScore, compScore: c.compScore, kpi: c.kpi, phases: c.phases, missingCount: c.missing.length, missingCriticalCount: c.missingCritical.length };
    base.classification = classify(c.kpi);
    base.bonusSuggestion = suggestBonus(c.kpi);
    base.contribution = c.contribution; // { myWeight, groupDoneWeight, pct, myCount, groupDoneCount }
  }
  return base;
}

router.get('/config/positions', requireAuth, (req, res) => {
  const POSITIONS = getPositions();
  const positions = Object.entries(POSITIONS).map(([key, p]) => ({
    key, label: p.label, tier: p.tier, reportsTo: p.reportsTo, hasLeadership: !!p.hasLeadership,
    isTopManager: !!p.isTopManager, itemCount: allItemsOfPosition(key).length,
  }));
  res.json({ tiers: TIERS, positions, phaseLabels: PHASE_LABELS });
});

// Danh sách nhân sự trong phạm vi quản lý (dùng cho trang Quản Lý Nhân Sự — CÓ
// bao gồm cả tài khoản Admin/Quản Lý Vùng để còn quản lý được tài khoản hệ thống;
// các trang checklist/KPI tự lọc riêng, xem routes/kpi.js và routes/checklist.js).
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

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { employeeCode, pin, name, position, branch, phone, startDate, status, isAdmin, isRegionalManager, managerId } = req.body || {};
  if (!employeeCode || !pin || !name) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
  if ((isAdmin || isRegionalManager) && !req.employee.isAdmin) {
    return res.status(403).json({ error: 'Chỉ Admin mới được cấp quyền Admin hoặc Quản Lý Vùng cho người khác' });
  }
  const db = getData();
  if (db.employees.some((e) => e.employeeCode.toLowerCase() === String(employeeCode).trim().toLowerCase())) {
    return res.status(400).json({ error: 'Mã nhân viên đã tồn tại' });
  }

  const isSystemAccount = !!(isAdmin || isRegionalManager);
  let finalPosition = null;
  if (!isSystemAccount) {
    if (!position || !getPositions()[position]) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
    finalPosition = position;
  }
  if (managerId && !db.employees.some((e) => e.id === managerId)) {
    return res.status(400).json({ error: 'Không tìm thấy quản lý được chọn' });
  }

  const emp = {
    id: 'e' + Math.random().toString(36).slice(2, 10),
    employeeCode: String(employeeCode).trim(),
    pinHash: hashPin(pin),
    name: name.trim(), position: finalPosition, branch: isSystemAccount ? '' : (branch || ''),
    phone: phone || '', startDate: startDate || '', status: status || 'Đang làm',
    isAdmin: !!isAdmin, isRegionalManager: !!isRegionalManager,
    managerId: !isSystemAccount && managerId ? managerId : null,
  };
  db.employees.push(emp);
  saveSync();
  res.json(publicEmployee(emp));
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getData();
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });

  // KHOÁ ADMIN TUYỆT ĐỐI: không ai được sửa 1 tài khoản Admin, kể cả Admin khác —
  // chỉ chính tài khoản đó tự sửa thông tin/PIN của mình.
  if (blockedFromAdminAccount(req, emp)) {
    return res.status(403).json({ error: 'Không ai được sửa tài khoản Admin, kể cả Admin khác — chỉ chính chủ tài khoản tự sửa được.' });
  }

  const { name, position, branch, phone, startDate, status, isAdmin, isRegionalManager, resetPin, managerId } = req.body || {};
  if ((isAdmin !== undefined || isRegionalManager !== undefined) && !req.employee.isAdmin) {
    return res.status(403).json({ error: 'Chỉ Admin mới được cấp/thu hồi quyền Admin hoặc Quản Lý Vùng' });
  }

  const willBeSystemAccount = (isAdmin !== undefined ? !!isAdmin : emp.isAdmin) || (isRegionalManager !== undefined ? !!isRegionalManager : emp.isRegionalManager);

  if (willBeSystemAccount) {
    emp.position = null; emp.branch = ''; emp.managerId = null;
  } else {
    if (position !== undefined) {
      if (!getPositions()[position]) return res.status(400).json({ error: 'Vị trí không hợp lệ' });
      if (position !== emp.position) delete db.dailyChecklists[emp.id]; // (dọn dữ liệu cũ nếu còn sót kiểu cũ theo employeeId)
      emp.position = position;
    }
    if (branch !== undefined) emp.branch = branch;
    if (managerId !== undefined) {
      if (managerId && !db.employees.some((e) => e.id === managerId)) return res.status(400).json({ error: 'Không tìm thấy quản lý được chọn' });
      emp.managerId = managerId || null;
    }
  }

  if (name) emp.name = name.trim();
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

  // KHOÁ ADMIN TUYỆT ĐỐI: không ai xoá được tài khoản Admin — kể cả chính họ qua
  // API này (tránh tự khoá hệ thống ngoài ý muốn). Muốn gỡ 1 Admin phải thao tác
  // trực tiếp trên dữ liệu (ngoài phạm vi ứng dụng).
  if (target.isAdmin) {
    return res.status(403).json({ error: 'Không ai xoá được tài khoản Admin trong ứng dụng này.' });
  }

  db.employees = db.employees.filter((e) => e.id !== req.params.id);
  delete db.dailyChecklists[req.params.id];
  // gỡ tham chiếu managerId nếu nhân sự bị xoá từng là quản lý của ai đó
  db.employees.forEach((e) => { if (e.managerId === req.params.id) e.managerId = null; });
  saveSync();
  res.json({ ok: true });
});

router.put('/:id/competency', requireAuth, (req, res) => {
  const db = getData();
  const ids = visibleEmployeeIds(req.employee);
  if (!ids.includes(req.params.id) || req.params.id === req.employee.id) {
    if (!isPrivileged(req.employee)) return res.status(403).json({ error: 'Bạn không có quyền chấm điểm nhân sự này' });
  }
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  if (!emp.position) return res.status(400).json({ error: 'Tài khoản quản trị không có khung năng lực để chấm' });
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
