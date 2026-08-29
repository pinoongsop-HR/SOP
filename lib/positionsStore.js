/**
 * ============================================================================
 *  KHO VỊ TRÍ / CHECKLIST — ĐỘNG, LƯU TRONG POSTGRES (chỉnh sửa được qua UI)
 * ============================================================================
 *  Trước đây POSITIONS nằm cố định trong config/positions.js (sửa phải vào
 *  code, deploy lại). Giờ đây, lúc khởi động server sẽ COPY nội dung mặc định
 *  đó vào Postgres (chỉ 1 lần, nếu Postgres chưa có dữ liệu), rồi từ đó về
 *  sau, mọi lần đọc đều lấy bản đang lưu trong Postgres — Admin / Quản Lý
 *  Vùng sửa checklist qua trang "Quản lý Checklist", lưu thẳng vào đây,
 *  không cần đụng tới code hay deploy lại.
 *
 *  config/positions.default.js CHỈ còn tác dụng làm "bản khởi tạo lần đầu"
 *  hoặc để KHÔI PHỤC nếu cần — không còn được đọc trực tiếp lúc chạy.
 * ============================================================================
 */
const { getData } = require('./db');
const DEFAULTS = require('../config/positions.default');

const { TIERS, PHASE_LABELS, BASE_COMPETENCIES, LEADERSHIP_COMP } = DEFAULTS;

// Gọi 1 lần lúc khởi động (trong server.js, sau db.load()) — nếu Postgres
// chưa có "positions" (project mới toanh) thì nạp bộ mặc định vào.
function seedIfEmpty() {
  const data = getData();
  if (!data.positions || Object.keys(data.positions).length === 0) {
    data.positions = JSON.parse(JSON.stringify(DEFAULTS.POSITIONS));
    return true; // báo hiệu cần lưu xuống DB
  }
  return false;
}

function getPositions() {
  return getData().positions || {};
}

function directReports(posKey) {
  const POSITIONS = getPositions();
  return Object.entries(POSITIONS).filter(([, p]) => p.reportsTo === posKey).map(([k]) => k);
}
function descendantPositions(posKey) {
  const direct = directReports(posKey);
  let all = [...direct];
  direct.forEach((d) => all.push(...descendantPositions(d)));
  return all;
}
function allItemsOfPosition(posKey) {
  const pos = getPositions()[posKey];
  if (!pos) return [];
  const out = [];
  for (const phase of ['moCa', 'giaoCa', 'dongCa']) {
    (pos.phases[phase] || []).forEach((it) => out.push({ ...it, phase }));
  }
  return out;
}
function competenciesFor(posKey) {
  const pos = getPositions()[posKey];
  return pos && pos.hasLeadership ? [...BASE_COMPETENCIES, LEADERSHIP_COMP] : BASE_COMPETENCIES;
}

// Kiểm tra & lưu 1 vị trí đã sửa (dùng cho route PUT /api/positions/:key)
const VALID_PHASES = ['moCa', 'giaoCa', 'dongCa'];
function validateAndSavePosition(posKey, patch) {
  const POSITIONS = getPositions();
  const pos = POSITIONS[posKey];
  if (!pos) throw new Error('Không tìm thấy vị trí');

  if (patch.label !== undefined) {
    const label = String(patch.label).trim();
    if (!label) throw new Error('Tên vị trí không được để trống');
    pos.label = label;
  }

  if (patch.phases !== undefined) {
    const seenIds = new Set();
    // các id đã dùng ở VỊ TRÍ KHÁC vẫn được phép trùng (mỗi vị trí độc lập),
    // chỉ cấm trùng id NGAY TRONG vị trí đang sửa (để tránh nhân đôi điểm).
    for (const phaseKey of VALID_PHASES) {
      const items = patch.phases[phaseKey];
      if (!Array.isArray(items)) throw new Error(`Thiếu danh sách việc cho giai đoạn "${phaseKey}"`);
      for (const it of items) {
        if (!it || typeof it.label !== 'string' || !it.label.trim()) {
          throw new Error('Mỗi việc phải có nội dung (label)');
        }
        if (![1, 2, 3].includes(Number(it.weight))) {
          throw new Error('Trọng số phải là 1, 2 hoặc 3');
        }
        let id = it.id && String(it.id).trim();
        if (!id) id = posKey + '-' + Math.random().toString(36).slice(2, 8);
        if (seenIds.has(id)) id = id + '-' + Math.random().toString(36).slice(2, 5);
        seenIds.add(id);
        it.id = id;
        it.label = it.label.trim();
        it.weight = Number(it.weight);
      }
    }
    pos.phases = {
      moCa: patch.phases.moCa.map((it) => ({ id: it.id, label: it.label, weight: it.weight })),
      giaoCa: patch.phases.giaoCa.map((it) => ({ id: it.id, label: it.label, weight: it.weight })),
      dongCa: patch.phases.dongCa.map((it) => ({ id: it.id, label: it.label, weight: it.weight })),
    };
  }

  return pos;
}

module.exports = {
  TIERS,
  PHASE_LABELS,
  BASE_COMPETENCIES,
  LEADERSHIP_COMP,
  seedIfEmpty,
  getPositions,
  directReports,
  descendantPositions,
  allItemsOfPosition,
  competenciesFor,
  validateAndSavePosition,
};
