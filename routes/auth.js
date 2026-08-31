const express = require('express');
const router = express.Router();
const { getData } = require('../lib/db');
const { verifyPin, signToken } = require('../lib/auth');
const { requireAuth } = require('../middleware/authMiddleware');
const { getPositions } = require('../lib/positionsStore');

router.post('/login', (req, res) => {
  const { employeeCode, pin } = req.body || {};
  if (!employeeCode || !pin) return res.status(400).json({ error: 'Vui lòng nhập mã nhân viên và mã PIN' });
  const db = getData();
  const emp = db.employees.find((e) => e.employeeCode.toLowerCase() === String(employeeCode).trim().toLowerCase());
  if (!emp) return res.status(401).json({ error: 'Mã nhân viên không tồn tại' });
  if (emp.status === 'Nghỉ việc') return res.status(401).json({ error: 'Tài khoản đã nghỉ việc, không thể đăng nhập' });
  if (!verifyPin(pin, emp.pinHash)) return res.status(401).json({ error: 'Mã PIN không đúng' });
  const token = signToken(emp);
  const pos = getPositions()[emp.position];
  res.json({
    token,
    employee: {
      id: emp.id, name: emp.name, employeeCode: emp.employeeCode, position: emp.position,
      positionLabel: (emp.isAdmin || emp.isRegionalManager) ? 'Tài khoản quản trị' : (pos ? pos.label : emp.position), tier: pos ? pos.tier : null,
      isAdmin: !!emp.isAdmin, isRegionalManager: !!emp.isRegionalManager, isManager: !!(pos && pos.hasLeadership), branch: emp.branch,
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  const emp = req.employee;
  const pos = getPositions()[emp.position];
  res.json({
    id: emp.id, name: emp.name, employeeCode: emp.employeeCode, position: emp.position,
    positionLabel: (emp.isAdmin || emp.isRegionalManager) ? 'Tài khoản quản trị' : (pos ? pos.label : emp.position), tier: pos ? pos.tier : null,
    isAdmin: !!emp.isAdmin, isRegionalManager: !!emp.isRegionalManager, isManager: !!(pos && pos.hasLeadership), branch: emp.branch,
  });
});

// Đổi PIN của chính mình
router.post('/change-pin', requireAuth, (req, res) => {
  const { oldPin, newPin } = req.body || {};
  if (!newPin || String(newPin).length !== 4 || !/^\d{4}$/.test(String(newPin))) {
    return res.status(400).json({ error: 'Mã PIN mới phải gồm đúng 4 chữ số' });
  }
  const db = getData();
  const emp = db.employees.find((e) => e.id === req.employee.id);
  if (!verifyPin(oldPin, emp.pinHash)) return res.status(401).json({ error: 'Mã PIN hiện tại không đúng' });
  const { hashPin } = require('../lib/auth');
  emp.pinHash = hashPin(newPin);
  require('../lib/db').saveSync();
  res.json({ ok: true });
});

module.exports = router;
