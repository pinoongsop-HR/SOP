# Hệ Thống Vận Hành SOP &amp; KPI Nội Bộ — KhạpKhun · Pinoong

Phần mềm nội bộ: **Checklist SOP theo 3 giai đoạn (Mở ca – Giao ca – Đóng ca)** +
**Đánh giá năng lực &amp; KPI**, tài khoản riêng cho từng nhân sự (Mã NV + PIN),
phân quyền theo sơ đồ tổ chức, bảng KPI tháng/quý/năm.

**Bản này khác gì bản trước:** dữ liệu chuyển từ file `data/db.json` sang
**Postgres miễn phí (Neon)** — lý do và chi tiết ở mục 0 ngay dưới đây. Toàn bộ
tính năng, giao diện, logic tính KPI giữ nguyên y hệt, đã kiểm thử lại từ đầu.

---

## 0. Vì sao phải đổi sang Postgres (đọc trước khi làm)

Bản đầu tôi gửi anh dùng 1 file `data/db.json` làm database — chạy rất tốt
trên VPS riêng (đĩa thật, dữ liệu không tự mất). Nhưng anh muốn **miễn phí
kiểu Render**, và tôi tra lại tài liệu Render mới nhất thì:

> Free Web Service của Render có ổ đĩa **ephemeral** — mọi file ghi thêm lúc
> chạy sẽ **bị xoá sạch** mỗi khi service khởi động lại. Điều này xảy ra mỗi
> khi anh deploy lại, VÀ mỗi khi service **tự ngủ sau 15 phút không ai
> truy cập** (gói free luôn tự ngủ) rồi có người vào lại.

Nói cách khác: nếu giữ nguyên file JSON và chạy trên Render free, **toàn bộ
nhân sự, checklist, lịch sử KPI, đánh giá sẽ biến mất bất cứ lúc nào** — không
dùng được cho việc xét thưởng minh bạch như anh muốn.

**Cách xử lý:** chuyển toàn bộ dữ liệu sang **Neon** — Postgres miễn phí,
**không giới hạn thời gian, không cần thẻ**, dữ liệu tồn tại độc lập với việc
Render ngủ/thức. Đây đúng là kiến trúc anh đã dùng cho app Pinoong (Node +
Postgres/Neon trên Render), nên quy trình deploy bên dưới sẽ rất quen thuộc.

Tôi đã viết lại `lib/db.js` và `server.js` để dùng Postgres, **giữ nguyên
100% các file routes/, config/positions.js, public/** — không phải sửa gì
thêm, đã test lại toàn bộ (đăng nhập, tick checklist, KPI phụ thuộc đội nhóm,
chốt ngày, đánh giá năng lực, rollup tháng) và đều chạy đúng.

⚠️ **Đánh đổi cần biết:** gói free của Render vẫn "ngủ" sau 15 phút không ai
dùng — lần đầu ai đó vào lại trong ngày có thể phải **đợi 30–50 giây** để
service "thức dậy". Đây là giới hạn của **compute** (Render), không phải của
**dữ liệu** (Neon) — dữ liệu luôn an toàn dù compute có ngủ hay không.

---

## 1. Chuẩn bị tài khoản (đều miễn phí, không cần thẻ)

1. **GitHub** — nếu anh chưa có repo riêng cho app này thì tạo mới tại
   [github.com/new](https://github.com/new), đặt tên ví dụ `khapkhun-hrms`,
   để **Private** nếu muốn (Render vẫn kết nối được repo private bình thường).
2. **Neon** — vào [neon.tech](https://neon.tech) → "Sign up" (dùng luôn tài
   khoản GitHub cho nhanh) → **Create a project** → đặt tên project tuỳ ý
   (VD `khapkhun-hrms`) → chọn vùng gần Việt Nam nhất (Singapore nếu có).
3. **Render** — anh đã có tài khoản sẵn (đang chạy Pinoong), dùng lại luôn.

---

## 2. Lấy connection string từ Neon

1. Vào project vừa tạo trên Neon → trang **Dashboard** → mục **Connection
   string** (thường hiện sẵn ngay khi vừa tạo project).
2. Copy chuỗi dạng:
   ```
   postgresql://neondb_owner:AbCdEf123456@ep-cool-name-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
3. Lưu chuỗi này lại — đây chính là giá trị `DATABASE_URL` sẽ dùng ở bước 4.
   Neon tự bật SSL và tự quản lý mọi thứ, không cần cấu hình gì thêm.

---

## 3. Đẩy code lên GitHub

Trên máy anh (hoặc mở Terminal trong VS Code):

```bash
cd khapkhun-hrms          # vào đúng thư mục chứa code (đã có sẵn server.js, routes/, ...)
git init
git add .
git commit -m "Khoi tao he thong SOP-KPI"
git branch -M main
git remote add origin https://github.com/<ten-tai-khoan>/khapkhun-hrms.git
git push -u origin main
```

File `.gitignore` đã loại `node_modules/`, `.env`, `data/db.json` ra khỏi
Git — **không đẩy nhầm mật khẩu/connection string lên GitHub**.

---

## 4. Tạo Web Service miễn phí trên Render

1. Vào [dashboard.render.com](https://dashboard.render.com) → **New +** →
   **Web Service**.
2. Chọn **Build and deploy from a Git repository** → kết nối repo
   `khapkhun-hrms` vừa đẩy lên (nếu chưa thấy repo, bấm "Configure account"
   để cấp quyền Render đọc GitHub).
3. Điền cấu hình:
   | Mục | Giá trị |
   |---|---|
   | Name | `khapkhun-hrms` (hoặc tên anh thích — sẽ thành `<name>.onrender.com`) |
   | Region | Singapore (gần VN nhất) |
   | Branch | `main` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `node server.js` |
   | Instance Type | **Free** |
4. Kéo xuống mục **Environment Variables** → **Add Environment Variable**,
   thêm đúng 3 biến:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | chuỗi connection string copy từ Neon ở bước 2 |
   | `JWT_SECRET` | 1 chuỗi ngẫu nhiên dài — tạo bằng lệnh bên dưới |
   | `INITIAL_ADMIN_PIN` | 1 mã PIN 4 số anh muốn dùng cho lần đăng nhập đầu (đổi ngay sau khi vào) |

   Tạo `JWT_SECRET` ngẫu nhiên: mở Terminal máy anh, chạy
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   rồi copy kết quả dán vào Value.

5. Bấm **Create Web Service**. Render sẽ tự `npm install` rồi `node server.js`.
   Theo dõi tab **Logs** — thấy dòng `Đã tạo bảng dữ liệu mới trên Postgres`
   và `Server đang chạy tại http://localhost:...` là **thành công**.
6. Mở địa chỉ Render cấp (VD `https://khapkhun-hrms.onrender.com`) — sẽ thấy
   màn hình đăng nhập. Đăng nhập bằng Mã NV `ADMIN` + PIN đã đặt ở
   `INITIAL_ADMIN_PIN` → vào **Đổi mã PIN** đổi ngay lập tức.

**Xong — đây chính là app SOP/KPI nội bộ, miễn phí, chạy 24/7 (trừ lúc ngủ do
free tier), mỗi lần deploy lại/redeploy không mất dữ liệu vì đã nằm ở Neon.**

---

## 5. Chia sẻ cho từng nhân sự

1. Vào **Quản lý nhân sự** (chỉ Admin/Quản lý thấy mục này) → **+ Thêm nhân
   sự**: nhập tên, chọn Vị trí (hệ thống tự gán checklist 3 giai đoạn), chi
   nhánh, đặt **Mã NV** (VD `NV001`) + **PIN 4 số**.
2. Gửi cho nhân sự đó: **link app** (VD `https://khapkhun-hrms.onrender.com`)
   + **Mã NV** + **PIN**. Họ tự mở trên điện thoại, đăng nhập, vào thẳng
   **Checklist của tôi** — hệ thống tự hiểu vị trí, tự hiện đúng checklist.
3. Khuyến khích mỗi người **đổi PIN riêng** ngay lần đầu đăng nhập (nút "Đổi
   mã PIN" luôn có sẵn trong app).

---

## 6. Cách dùng hằng ngày

### Nhân viên
- Đăng nhập → **Checklist của tôi** → chọn tab Mở ca / Giao ca / Đóng ca →
  tick từng việc khi làm xong.
- Cuối ca bấm **"Chốt ngày — lưu vào lịch sử KPI"** để điểm hôm nay được ghi
  vào lịch sử (không chốt cũng không sao, quản lý chốt hộ được).

### Quản lý (Bếp Trưởng, Giám Sát Sảnh, Quản Lý Ca, Quản Lý Cửa Hàng)
- **Đội nhóm của tôi**: thấy % Mở ca / Giao ca / Đóng ca + KPI hôm nay của
  đúng nhân sự cấp dưới, cùng chi nhánh (tự lọc theo sơ đồ tổ chức).
- Bấm **Xem chi tiết** 1 nhân sự → chấm **điểm năng lực (1–5)**, ghi
  **đánh giá định kỳ** (nhận xét + chốt KPI vào lịch sử đánh giá).
- **Bảng KPI tổng hợp**: chọn Tháng/Quý/Năm → xem KPI trung bình + % ngày đạt
  chuẩn (≥80) của từng người — dùng xét thưởng minh bạch, có nút **Xuất CSV**.

### Admin (Quản Lý Cửa Hàng / chủ)
- Thấy **toàn bộ** nhân sự mọi chi nhánh.
- Duy nhất người có quyền: thêm/sửa/xoá nhân sự, đặt lại PIN khi ai đó quên.

---

## 7. Sửa checklist / thêm vị trí mới

Toàn bộ checklist SOP nằm trong **1 file duy nhất**: `config/positions.js`.
Mỗi vị trí có đúng 3 khối `moCa` / `giaoCa` / `dongCa`. Sửa `label` để đổi nội
dung 1 việc; copy 1 dòng `{ id, label, weight: 1|2|3 }` để thêm việc mới (nhớ
đổi `id` không trùng). Sửa xong, `git push` — Render tự deploy lại (dữ liệu
không mất vì đã ở Neon).

---

## 8. Sao lưu dữ liệu

Dữ liệu nằm ở Neon — Neon có sẵn cơ chế backup/point-in-time recovery ở mức
hạ tầng. Muốn tự tải 1 bản về máy định kỳ (khuyến nghị, để yên tâm tuyệt
đối), vào trang Neon → project → **SQL Editor** hoặc dùng lệnh:

```bash
pg_dump "<DATABASE_URL>" > backup-$(date +%F).sql
```

chạy trên máy có cài PostgreSQL client (hoặc cho Claude Code chạy hộ định kỳ).

---

## 9. Giới hạn hiện tại (nên biết trước)

- **Free tier Render tự ngủ sau 15 phút không ai dùng** → lần vào đầu tiên
  trong ngày có thể chờ 30–50 giây "đánh thức" service. Nếu cần app luôn
  phản hồi tức thì, cân nhắc nâng cấp Render lên gói trả phí thấp nhất
  (~7 USD/tháng) — chỉ cần đổi Instance Type, không phải sửa code.
- **Neon Free**: 0.5GB dung lượng, đủ dùng nhiều năm với vài chục nhân sự
  (dữ liệu dạng JSON rất nhẹ). Nếu sau này mở rộng hàng trăm nhân sự nhiều
  năm liền, có thể cần nâng cấp Neon (trả phí) hoặc dọn bớt lịch sử cũ.
- **Không có tính năng quên PIN tự động** — Admin vào **Quản lý nhân sự** →
  **Sửa** → nhập PIN mới ở ô "Mã PIN" để đặt lại hộ.
- **Phân quyền theo chi nhánh** dựa trên trường "Chi nhánh" nhập lúc tạo
  nhân sự — luôn gõ đúng, nhất quán ("Khạp Khun" / "Pinoong").
- Chưa có sơ đồ tổ chức dạng hình vẽ trực quan — hiện hiển thị dạng bảng.
