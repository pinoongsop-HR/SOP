require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./lib/db');
const { hashPin } = require('./lib/auth');
const positionsStore = require('./lib/positionsStore');

const app = express();
app.use(cors());
app.use(express.json());

// ---- Khởi tạo tài khoản Admin đầu tiên nếu chưa có ai trong hệ thống ----
function ensureInitialAdmin() {
  const data = db.getData();
  if (data.employees.length === 0) {
    const code = process.env.INITIAL_ADMIN_CODE || 'ADMIN';
    const pin = process.env.INITIAL_ADMIN_PIN || '1234';
    const name = process.env.INITIAL_ADMIN_NAME || 'Quản trị viên';
    data.employees.push({
      id: 'e' + Math.random().toString(36).slice(2, 10),
      employeeCode: code,
      pinHash: hashPin(pin),
      name, position: 'quan-ly-cua-hang', branch: '', phone: '', startDate: '', status: 'Đang làm',
      isAdmin: true, isRegionalManager: false,
    });
    console.log('============================================================');
    console.log(`Đã tạo tài khoản Admin đầu tiên — Mã NV: "${code}" · PIN: "${pin}"`);
    console.log('Hãy đăng nhập và đổi PIN ngay, hoặc xoá 2 dòng INITIAL_ADMIN_* khỏi .env sau khi đã tạo xong.');
    console.log('============================================================');
    return true; // báo hiệu có thay đổi cần lưu
  }
  return false;
}

// ---- API routes ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/kpi', require('./routes/kpi'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/positions', require('./routes/positions'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---- Phục vụ frontend tĩnh ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await db.load(); // BẮT BUỘC: tải dữ liệu từ Postgres trước khi xử lý bất kỳ request nào

    let dirty = false;
    if (positionsStore.seedIfEmpty()) {
      console.log('Đã nạp bộ checklist mặc định vào Postgres (lần đầu chạy).');
      dirty = true;
    }
    if (ensureInitialAdmin()) dirty = true;
    if (dirty) await db.saveSync();

    app.listen(PORT, () => {
      console.log(`Server đang chạy tại http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('KHÔNG THỂ KHỞI ĐỘNG SERVER — lỗi kết nối cơ sở dữ liệu:', e.message);
    console.error('Kiểm tra lại biến môi trường DATABASE_URL (connection string từ Neon).');
    process.exit(1);
  }
}
startServer();
