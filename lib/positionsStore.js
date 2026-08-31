/**
 * ============================================================================
 *  KHO VỊ TRÍ / CHECKLIST — ĐỘNG, LƯU TRONG POSTGRES (chỉnh sửa được qua UI)
 * ============================================================================
 *  - Admin / Quản Lý Vùng chỉnh sửa TÊN vị trí, đầu việc, trọng số, và có thể
 *    THÊM vị trí mới / XOÁ vị trí thừa ngay trên giao diện — không cần sửa code.
 *  - Mỗi đầu việc có thể đánh dấu `auto: true` ("Tự động theo đội nhóm") — áp
 *    dụng cho các việc kiểu "kiểm tra / giám sát" của Tầng 2-3-4: việc này KHÔNG
 *    tick tay được, hệ thống tự đánh dấu hoàn thành khi toàn bộ đội nhóm cấp
 *    dưới (tính theo lib/kpi.js -> teamScoreFor) đạt đúng 100% việc của họ.
 * ============================================================================
 */
const { getData } = require('./db');
const DEFAULTS = require('../config/positions.default');

const { TIERS, PHASE_LABELS, BASE_COMPETENCIES, LEADERSHIP_COMP } = DEFAULTS;
const VALID_PHASES = ['moCa', 'giaoCa', 'dongCa'];

function seedIfEmpty() {
  const data = getData();
  if (!data.positions || Object.keys(data.positions).length === 0) {
    data.positions = JSON.parse(JSON.stringify(DEFAULTS.POSITIONS));
    return true;
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
  for (const phase of VALID_PHASES) {
    (pos.phases[phase] || []).forEach((it) => out.push({ ...it, phase }));
  }
  return out;
}
function competenciesFor(posKey) {
  const pos = getPositions()[posKey];
  return pos && pos.hasLeadership ? [...BASE_COMPETENCIES, LEADERSHIP_COMP] : BASE_COMPETENCIES;
}

function slugify(label) {
  return String(label).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'vi-tri';
}

// Sửa 1 vị trí đã có: tên, tầng, báo cáo lên ai, có phải cấp quản lý không, và/hoặc checklist.
function validateAndSavePosition(posKey, patch) {
  const POSITIONS = getPositions();
  const pos = POSITIONS[posKey];
  if (!pos) throw new Error('Không tìm thấy vị trí');

  if (patch.label !== undefined) {
    const label = String(patch.label).trim();
    if (!label) throw new Error('Tên vị trí không được để trống');
    pos.label = label;
  }
  if (patch.tier !== undefined) {
    const tier = Number(patch.tier);
    if (![1, 2, 3, 4].includes(tier)) throw new Error('Tầng phải từ 1 đến 4');
    pos.tier = tier;
  }
  if (patch.reportsTo !== undefined) {
    const rt = patch.reportsTo || null;
    if (rt && !POSITIONS[rt]) throw new Error('Vị trí báo cáo lên không tồn tại');
    if (rt === posKey) throw new Error('Vị trí không thể tự báo cáo lên chính mình');
    pos.reportsTo = rt;
  }
  if (patch.hasLeadership !== undefined) pos.hasLeadership = !!patch.hasLeadership;

  if (patch.phases !== undefined) {
    const seenIds = new Set();
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
        it.auto = !!it.auto;
      }
    }
    pos.phases = {
      moCa: patch.phases.moCa.map((it) => ({ id: it.id, label: it.label, weight: it.weight, auto: !!it.auto })),
      giaoCa: patch.phases.giaoCa.map((it) => ({ id: it.id, label: it.label, weight: it.weight, auto: !!it.auto })),
      dongCa: patch.phases.dongCa.map((it) => ({ id: it.id, label: it.label, weight: it.weight, auto: !!it.auto })),
    };
  }

  return pos;
}

// Tạo 1 vị trí HOÀN TOÀN MỚI (VD: thêm "NV Rửa Bát" ở Tầng 1).
function createPosition({ label, tier, reportsTo, hasLeadership }) {
  const POSITIONS = getPositions();
  label = String(label || '').trim();
  if (!label) throw new Error('Tên vị trí không được để trống');
  tier = Number(tier);
  if (![1, 2, 3, 4].includes(tier)) throw new Error('Tầng phải từ 1 đến 4');
  if (reportsTo && !POSITIONS[reportsTo]) throw new Error('Vị trí báo cáo lên không tồn tại');

  let key = slugify(label);
  let n = 2;
  while (POSITIONS[key]) { key = slugify(label) + '-' + n; n++; }

  POSITIONS[key] = {
    label,
    tier,
    reportsTo: reportsTo || null,
    hasLeadership: !!hasLeadership,
    phases: { moCa: [], giaoCa: [], dongCa: [] },
  };
  return { key, ...POSITIONS[key] };
}

// Xoá 1 vị trí — CHẶN nếu còn nhân sự đang giữ, hoặc còn vị trí khác báo cáo lên nó
// (phải dời hết trước để tránh sơ đồ tổ chức bị "treo" / dữ liệu KPI sai lệch).
function deletePosition(posKey) {
  const POSITIONS = getPositions();
  if (!POSITIONS[posKey]) throw new Error('Không tìm thấy vị trí');
  const db = getData();
  const empCount = db.employees.filter((e) => e.position === posKey).length;
  if (empCount > 0) {
    throw new Error(`Còn ${empCount} nhân sự đang giữ vị trí này — hãy chuyển họ sang vị trí khác trước khi xoá.`);
  }
  const childCount = directReports(posKey).length;
  if (childCount > 0) {
    throw new Error(`Còn ${childCount} vị trí khác đang báo cáo lên vị trí này — hãy đổi "báo cáo lên" của các vị trí đó trước khi xoá.`);
  }
  delete POSITIONS[posKey];
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
  createPosition,
  deletePosition,
};
