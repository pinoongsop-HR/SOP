const express = require('express');
const router = express.Router();
const { getData, save } = require('../lib/db');
const { requireAuth, visibleEmployeeIds } = require('../middleware/authMiddleware');
const { computeEmployeeToday } = require('../lib/kpi');

router.get('/:employeeId', requireAuth, (req, res) => {
  if (!visibleEmployeeIds(req.employee).includes(req.params.employeeId)) return res.status(403).json({ error: 'Không có quyền' });
  const db = getData();
  const list = db.reviews.filter((r) => r.employeeId === req.params.employeeId).slice().reverse();
  res.json(list);
});

router.post('/:employeeId', requireAuth, (req, res) => {
  const ids = visibleEmployeeIds(req.employee);
  if (!ids.includes(req.params.employeeId) || req.params.employeeId === req.employee.id) {
    if (!req.employee.isAdmin) return res.status(403).json({ error: 'Bạn không có quyền đánh giá nhân sự này' });
  }
  const { reviewer, period, notes } = req.body || {};
  if (!reviewer || !reviewer.trim()) return res.status(400).json({ error: 'Vui lòng nhập tên người đánh giá' });
  const db = getData();
  const emp = db.employees.find((e) => e.id === req.params.employeeId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy' });
  const c = computeEmployeeToday(emp);
  const entry = {
    id: 'r' + Math.random().toString(36).slice(2, 10),
    employeeId: emp.id, date: new Date().toISOString(),
    reviewer: reviewer.trim(), period: (period || '').trim(), notes: (notes || '').trim(),
    taskScore: c.taskScore, compScore: c.compScore, kpi: c.kpi,
  };
  db.reviews.push(entry);
  save();
  res.json(entry);
});

module.exports = router;
