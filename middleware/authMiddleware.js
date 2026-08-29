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

// "Quyền tối thượng" — CHỈ Admin gốc (isAdmin === true), KHÔNG bao gồm Quản Lý Vùng.
// Dùng cho: cấp/thu hồi quyền Admin & Quản Lý Vùng cho người khác, sửa/xoá tài khoản Admin.
function requireSuperAdmin(req, res, next) {
  if (!req.employee || !req.employee.isAdmin) return res.status(403).json({ error: 'Chỉ Admin mới được thực hiện thao tác này' });
  next();
}

// Admin HOẶC Quản Lý Vùng — quyền hạn coi như tương đương nhau ở hầu hết thao tác
// (xem toàn bộ, sửa nhân sự, sửa checklist...), CHỈ KHÁC ở chỗ Quản Lý Vùng không được
// đụng tới tài khoản Admin (xem requireSuperAdmin) và không được cấp quyền Admin/Quản Lý Vùng.
function isPrivileged(emp) {
  return !!(emp && (emp.isAdmin || emp.isRegionalManager));
}
function requireAdmin(req, res, next) {
  if (!isPrivileged(req.employee)) return res.status(403).json({ error: 'Chỉ Admin hoặc Quản Lý Vùng mới được thực hiện thao tác này' });
  next();
}

// Quản lý (hasLeadership) hoặc Admin/Quản Lý Vùng
function requireManagerOrAdmin(req, res, next) {
  const pos = getPositions()[req.employee.position];
  if (isPrivileged(req.employee) || (pos && pos.hasLeadership)) return next();
  return res.status(403).json({ error: 'Chỉ Quản lý, Quản Lý Vùng hoặc Admin mới xem được mục này' });
}

// Trả về danh sách employeeId mà req.employee được phép xem.
// - Admin / Quản Lý Vùng: thấy TẤT CẢ nhân sự, mọi chi nhánh.
// - Quản lý (hasLeadership) thường: chính mình + toàn bộ cấp dưới CÙNG CHI NHÁNH.
// - Nhân viên thường: chỉ chính mình.
function visibleEmployeeIds(employee) {
  const db = getData();
  if (isPrivileged(employee)) return db.employees.map((e) => e.id);
  const pos = getPositions()[employee.position];
  const subordinatePositions = pos && pos.hasLeadership ? descendantPositions(employee.position) : [];
  return db.employees.filter((e) => {
    if (e.id === employee.id) return true;
    if (!subordinatePositions.includes(e.position)) return false;
    if (employee.branch && e.branch && employee.branch !== e.branch) return false; // khác chi nhánh -> không thấy
    return true;
  }).map((e) => e.id);
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requireManagerOrAdmin, visibleEmployeeIds, isPrivileged };
