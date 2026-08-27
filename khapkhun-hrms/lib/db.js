/**
 * ============================================================================
 *  LỚP LƯU TRỮ DỮ LIỆU — PostgreSQL (Neon) thay vì file JSON cục bộ
 * ============================================================================
 *  LÝ DO ĐỔI: Render Free Web Service có ổ đĩa "ephemeral" — mọi thay đổi ghi
 *  vào file cục bộ (data/db.json) sẽ bị XOÁ mỗi khi service redeploy, restart,
 *  hoặc "ngủ" do không có người dùng 15 phút (miễn phí luôn tự ngủ). Vì vậy
 *  bản JSON-file chỉ an toàn khi chạy trên VPS riêng (đĩa thật). Để chạy MIỄN
 *  PHÍ trên Render mà KHÔNG mất dữ liệu, toàn bộ state được lưu vào 1 bảng
 *  Postgres duy nhất (Neon Free — không giới hạn thời gian, không cần thẻ).
 *
 *  Thiết kế: dùng đúng 1 bảng "app_state" với 1 dòng duy nhất chứa toàn bộ
 *  dữ liệu ứng dụng dưới dạng JSONB — giống hệt cấu trúc file JSON cũ, chỉ
 *  khác nơi lưu. Nhờ vậy toàn bộ phần còn lại của code (routes/, lib/kpi.js)
 *  KHÔNG cần sửa gì cả — vẫn gọi getData() đồng bộ như trước, vì server giữ
 *  1 bản sao "cache" trong bộ nhớ và chỉ đồng bộ xuống Postgres ở nền.
 * ============================================================================
 */
const { Pool } = require('pg');

const DEFAULT_DATA = {
  employees: [],
  dailyChecklists: {},
  competency: {},
  history: [],
  reviews: [],
  weights: { task: 70, comp: 30 },
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('============================================================');
  console.error('THIẾU DATABASE_URL trong biến môi trường!');
  console.error('Vào Neon (neon.tech) tạo project miễn phí, copy "Connection string"');
  console.error('rồi dán vào biến DATABASE_URL trong .env (local) hoặc Render Environment.');
  console.error('============================================================');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

let cache = null;

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// Gọi 1 LẦN DUY NHẤT lúc khởi động server (await trước khi app.listen).
async function load() {
  await ensureTable();
  const { rows } = await pool.query('SELECT data FROM app_state WHERE id = 1');
  if (rows.length === 0) {
    cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
    await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [JSON.stringify(cache)]);
    console.log('Đã tạo bảng dữ liệu mới trên Postgres (lần đầu chạy).');
  } else {
    // merge với DEFAULT_DATA để tự vá nếu sau này thêm field mới mà DB cũ chưa có
    cache = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), ...rows[0].data };
    console.log('Đã tải dữ liệu từ Postgres (Neon) thành công.');
  }
  return cache;
}

// Đọc đồng bộ từ bộ nhớ đệm — PHẢI gọi load() và đợi xong trước khi dùng hàm này.
function getData() {
  if (!cache) {
    throw new Error('Dữ liệu chưa được tải. Server phải "await db.load()" trước khi lắng nghe request.');
  }
  return cache;
}

async function persist() {
  await pool.query('UPDATE app_state SET data = $1, updated_at = now() WHERE id = 1', [JSON.stringify(cache)]);
}

// Lưu có debounce (gộp nhiều thay đổi liên tiếp thành 1 lần ghi) — dùng cho các
// thao tác tick checklist liên tục, không cần chờ ghi xong mới trả response.
let writeTimer = null;
function save() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    persist().catch((e) => console.error('Lỗi khi lưu dữ liệu xuống Postgres:', e.message));
  }, 300);
}

// Lưu NGAY LẬP TỨC và đợi ghi xong — dùng khi cần chắc chắn dữ liệu đã lưu
// trước khi trả response (đổi PIN, thêm/xoá nhân sự, chốt ngày).
async function saveSync() {
  clearTimeout(writeTimer);
  await persist();
}

module.exports = { load, getData, save, saveSync };
