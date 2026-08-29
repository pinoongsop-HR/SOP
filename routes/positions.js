const express = require('express');
const router = express.Router();
const { save, saveSync } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { getPositions, TIERS, PHASE_LABELS, validateAndSavePosition } = require('../lib/positionsStore');

// Toàn bộ checklist hiện tại của mọi vị trí (đầy đủ từng đầu việc) — dùng cho
// trang "Quản lý Checklist". Ai đăng nhập cũng xem được (để nhân viên hiểu rõ
// tiêu chí), nhưng chỉ Admin/Quản Lý Vùng mới sửa được (xem route PUT bên dưới).
router.get('/', requireAuth, (req, res) => {
  res.json({ tiers: TIERS, phaseLabels: PHASE_LABELS, positions: getPositions() });
});

router.get('/:key', requireAuth, (req, res) => {
  const pos = getPositions()[req.params.key];
  if (!pos) return res.status(404).json({ error: 'Không tìm thấy vị trí' });
  res.json(pos);
});

// Sửa checklist (thêm/xoá/sửa đầu việc, đổi trọng số) của 1 vị trí — Admin hoặc Quản Lý Vùng.
// Body: { label?: string, phases: { moCa:[{id?,label,weight}], giaoCa:[...], dongCa:[...] } }
router.put('/:key', requireAuth, requireAdmin, (req, res) => {
  try {
    const updated = validateAndSavePosition(req.params.key, req.body || {});
    saveSync();
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
