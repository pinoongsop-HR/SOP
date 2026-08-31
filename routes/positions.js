const express = require('express');
const router = express.Router();
const { saveSync } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { getPositions, TIERS, PHASE_LABELS, validateAndSavePosition, createPosition, deletePosition } = require('../lib/positionsStore');

router.get('/', requireAuth, (req, res) => {
  res.json({ tiers: TIERS, phaseLabels: PHASE_LABELS, positions: getPositions() });
});

router.get('/:key', requireAuth, (req, res) => {
  const pos = getPositions()[req.params.key];
  if (!pos) return res.status(404).json({ error: 'Không tìm thấy vị trí' });
  res.json(pos);
});

// Thêm 1 vị trí HOÀN TOÀN MỚI — VD Admin muốn thêm "NV Rửa Bát" ở Tầng 1.
// Body: { label, tier(1-4), reportsTo?(key vị trí cha), hasLeadership? }
router.post('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const created = createPosition(req.body || {});
    saveSync();
    res.json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Sửa checklist / tên / tầng / báo cáo lên ai của 1 vị trí.
router.put('/:key', requireAuth, requireAdmin, (req, res) => {
  try {
    const updated = validateAndSavePosition(req.params.key, req.body || {});
    saveSync();
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Xoá vị trí — chặn nếu còn nhân sự đang giữ hoặc còn vị trí khác báo cáo lên nó.
router.delete('/:key', requireAuth, requireAdmin, (req, res) => {
  try {
    deletePosition(req.params.key);
    saveSync();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
