const { verifyToken } = require('../lib/auth');
const { getData } = require('../lib/db');
const { POSITIONS, descendantPositions } = require('../config/positions');

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

function requireAdmin(req, res, next) {
  if (!req.employee || !req.employee.isAdmin) return res.status(403).json({ error: 'Chỉ Admin mới được thực hiện thao tác này' });
  next();
}

// Quản lý (hasLeadership) hoặc Admin
function requireManagerOrAdmin(req, res, next) {
  const pos = POSITIONS[req.employee.position];
  if (req.employee.isAdmin || (pos && pos.hasLeadership)) return next();
  return res.status(403).json({ error: 'Chỉ Quản lý hoặc Admin mới xem được mục này' });
}

// Trả về danh sách employeeId mà req.employee được phép xem (chính mình + toàn bộ cấp dưới CÙNG CHI NHÁNH nếu là quản lý; toàn bộ nếu admin)
// Lưu ý: chỉ tính CẤP DƯỚI (descendantPositions), không tính người cùng vị trí với mình,
// để tránh 1 quản lý nhìn thấy nhầm quản lý khác cùng chức danh (vd. 2 chi nhánh khác nhau).
// Đồng thời lọc theo chi nhánh (branch) của chính quản lý đó, vì sơ đồ chức danh dùng chung
// cho mọi chi nhánh — quản lý chi nhánh A không được thấy nhân sự chi nhánh B dù cùng chức danh cấp dưới.
function visibleEmployeeIds(employee) {
  const db = getData();
  if (employee.isAdmin) return db.employees.map((e) => e.id);
  const pos = POSITIONS[employee.position];
  const subordinatePositions = pos && pos.hasLeadership ? descendantPositions(employee.position) : [];
  return db.employees.filter((e) => {
    if (e.id === employee.id) return true;
    if (!subordinatePositions.includes(e.position)) return false;
    if (employee.branch && e.branch && employee.branch !== e.branch) return false; // khác chi nhánh -> không thấy
    return true;
  }).map((e) => e.id);
}

module.exports = { requireAuth, requireAdmin, requireManagerOrAdmin, visibleEmployeeIds };
