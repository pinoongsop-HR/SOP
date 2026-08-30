const { verifyToken } = require('../lib/auth');
const { getData } = require('../lib/db');
const { getPositions, descendantPositions } = require('../lib/positionsStore');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = verifyToken(token);
    const db = getData();
    const emp = db.employees.find((e) => e.id === payload.id);
    if (!emp || emp.status === 'Nghỉ việc') return res.status(401).json({ error: 'Tài khoản không còn hiệu lực' });
    req.employee = emp;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' });
  }
}

function isPrivileged(emp) {
  return !!(emp && (emp.isAdmin || emp.isRegionalManager));
}
function requireAdmin(req, res, next) {
  if (!isPrivileged(req.employee)) return res.status(403).json({ error: 'Chỉ Admin hoặc Quản Lý Vùng mới được thực hiện thao tác này' });
  next();
}

// "Quyền tối thượng" — CHỈ Admin gốc (isAdmin === true) mới được cấp/thu hồi
// quyền Admin & Quản Lý Vùng cho người khác.
function requireSuperAdmin(req, res, next) {
  if (!req.employee || !req.employee.isAdmin) return res.status(403).json({ error: 'Chỉ Admin mới được thực hiện thao tác này' });
  next();
}

// KHOÁ ADMIN TUYỆT ĐỐI: không ai — kể cả Admin khác — được sửa hoặc xoá 1 tài
// khoản Admin, NGOẠI TRỪ chính tài khoản đó tự sửa thông tin/PIN của mình.
// targetEmployee: bản ghi nhân sự đang định sửa/xoá.
function isSelfEditingOwnAdminAccount(req, targetEmployee) {
  return !!(targetEmployee && targetEmployee.isAdmin && req.employee && req.employee.id === targetEmployee.id);
}
function blockedFromAdminAccount(req, targetEmployee) {
  return !!(targetEmployee && targetEmployee.isAdmin && req.employee.id !== targetEmployee.id);
}

function requireManagerOrAdmin(req, res, next) {
  const pos = getPositions()[req.employee.position];
  if (isPrivileged(req.employee) || (pos && pos.hasLeadership)) return next();
  return res.status(403).json({ error: 'Chỉ Quản lý, Quản Lý Vùng hoặc Admin mới xem được mục này' });
}

// Trả về danh sách employeeId mà req.employee được phép XEM/QUẢN LÝ (dùng cho
// trang Quản Lý Nhân Sự). Đây KHÔNG phải danh sách dùng cho checklist/KPI —
// Admin/Quản Lý Vùng vốn không có checklist/KPI (xem routes/kpi.js, routes/checklist.js
// tự lọc riêng loại isAdmin/isRegionalManager ra khỏi các trang đó).
function visibleEmployeeIds(employee) {
  const db = getData();
  if (isPrivileged(employee)) return db.employees.map((e) => e.id);
  const pos = getPositions()[employee.position];
  const subordinatePositions = pos && pos.hasLeadership ? descendantPositions(employee.position) : [];
  return db.employees.filter((e) => {
    if (e.id === employee.id) return true;
    if (!subordinatePositions.includes(e.position)) return false;
    if (employee.branch && e.branch && employee.branch !== e.branch) return false;
    return true;
  }).map((e) => e.id);
}

module.exports = {
  requireAuth, requireAdmin, requireSuperAdmin, requireManagerOrAdmin,
  visibleEmployeeIds, isPrivileged, blockedFromAdminAccount, isSelfEditingOwnAdminAccount,
};
