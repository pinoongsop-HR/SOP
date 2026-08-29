# Hệ Thống Vận Hành SOP &amp; KPI Nội Bộ — KhạpKhun · Pinoong

Phần mềm nội bộ: **Checklist SOP theo 3 giai đoạn (Mở ca – Giao ca – Đóng ca)** +
**Đánh giá năng lực &amp; KPI**, tài khoản riêng cho từng nhân sự (Mã NV + PIN),
phân quyền theo sơ đồ tổ chức, bảng KPI tháng/quý/năm kèm biểu đồ tiến bộ.

**Bản này có gì mới so với bản trước:**
- Sửa lỗi deploy fail trên Render (xem mục 0 ngay dưới).
- Thêm vai trò **Quản Lý Vùng** (quyền tương đương Admin, không xoá/sửa được Admin).
- **Admin / Quản Lý Vùng sửa được checklist** ngay trên giao diện (trang "Quản lý
  Checklist") — không cần sửa code, không cần deploy lại.
- **Tick checklist không còn giật/chớp màn hình** — mỗi lần tick chỉ cập nhật đúng
  dòng đó + vài con số, không tải lại cả trang.
- Xem chi tiết 1 nhân sự → **tick trực tiếp checklist của người đó** (Admin, Quản
  Lý Vùng, hoặc quản lý trực tiếp).
- Trang "Đội Nhóm Của Tôi" hiện thêm cột **Đề xuất thưởng** (chỉ Admin/Quản Lý
  Vùng thấy) — không cần bấm vào từng người để xem.
- Trang "Bảng KPI Tổng Hợp" có thêm **biểu đồ cột xu hướng KPI theo tháng** cho
  từng người, để nắm tiến bộ qua thời gian.

---

## 0. Sửa lỗi deploy fail (ENOENT package.json)

Tôi đã tải trực tiếp repo GitHub của anh xuống kiểm tra — **cấu trúc file hoàn
toàn đúng**, `package.json` nằm đúng ở gốc repo giống hệt bản tôi gửi. Vì vậy lỗi

```
npm error path /opt/render/project/src/package.json
npm error enoent Could not read package.json
```

gần như chắc chắn do cấu hình Service trên Render, không phải do thiếu file.
Vào Render → service của anh → **Settings** → mục **Build & Deploy**, kiểm tra
đúng 2 chỗ sau rồi bấm **Manual Deploy → Clear build cache & deploy**:

1. **Root Directory** — để **TRỐNG HOÀN TOÀN** (không gõ `khapkhun-hrms`, không
   gõ `src`, không gõ gì cả). Nếu ô này có sẵn chữ gì đó, xoá đi và lưu lại. Đây
   là nguyên nhân phổ biến nhất gây đúng lỗi này.
2. **Build Command** phải là `npm install`, **Start Command** phải là `node server.js`.

Sau khi sửa xong bản mới trong file zip này (đã thêm Quản Lý Vùng + sửa checklist
được qua UI), làm theo mục 3–4 bên dưới để đẩy code mới lên và deploy lại.

---

## 1. Vì sao dùng Postgres (Neon) thay vì file JSON — nhắc lại nhanh

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

## 2. Chuẩn bị tài khoản (đều miễn phí, không cần thẻ)

1. **GitHub** — nếu anh chưa có repo riêng cho app này thì tạo mới tại
   [github.com/new](https://github.com/new), đặt tên ví dụ `khapkhun-hrms`,
   để **Private** nếu muốn (Render vẫn kết nối được repo private bình thường).
2. **Neon** — vào [neon.tech](https://neon.tech) → "Sign up" (dùng luôn tài
   khoản GitHub cho nhanh) → **Create a project** → đặt tên project tuỳ ý
   (VD `khapkhun-hrms`) → chọn vùng gần Việt Nam nhất (Singapore nếu có).
3. **Render** — anh đã có tài khoản sẵn (đang chạy Pinoong), dùng lại luôn.

---

## 3. Lấy connection string từ Neon

1. Vào project vừa tạo trên Neon → trang **Dashboard** → mục **Connection
   string** (thường hiện sẵn ngay khi vừa tạo project).
2. Copy chuỗi dạng:
   ```
   postgresql://neondb_owner:AbCdEf123456@ep-cool-name-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
3. Lưu chuỗi này lại — đây chính là giá trị `DATABASE_URL` sẽ dùng ở mục 5.
   Neon tự bật SSL và tự quản lý mọi thứ, không cần cấu hình gì thêm.

---

## 4. Cập nhật code mới lên GitHub

Anh đã có repo `pinoongsop-HR/SOP` rồi, chỉ cần **thay toàn bộ nội dung** bằng
các file trong zip này rồi đẩy lại (giữ nguyên Root Directory để trống — xem
mục 0):

```bash
# 1. Xoá sạch nội dung cũ trong thư mục repo (giữ lại .git), copy toàn bộ
#    file trong zip này đè vào đúng thư mục gốc repo — package.json phải nằm
#    NGAY TẠI GỐC, không nằm trong 1 thư mục con nào khác.
cd SOP                     # thư mục đã git clone repo pinoongsop-HR/SOP về
git add .
git commit -m "Them Quan Ly Vung, sua checklist qua UI, fix chop man hinh, bieu do KPI"
git push
```

Nếu đây là lần đầu đẩy code (chưa từng `git clone`), làm theo cách sau thay vì
`git add .` ở trên:

```bash
cd khapkhun-hrms          # thư mục chứa code đã giải nén từ file zip
git init
git add .
git commit -m "Khoi tao he thong SOP-KPI"
git branch -M main
git remote add origin https://github.com/pinoongsop-HR/SOP.git
git push -u origin main --force
```

File `.gitignore` đã loại `node_modules/`, `.env`, `data/db.json` ra khỏi
Git — **không đẩy nhầm mật khẩu/connection string lên GitHub**. Render sẽ tự
động deploy lại ngay khi thấy commit mới (nếu anh đã bật Auto-Deploy — mặc
định là bật).

---

## 5. Tạo Web Service miễn phí trên Render (nếu chưa tạo lần nào)

Bỏ qua mục này nếu anh **đã có sẵn** Web Service trên Render trỏ vào repo này —
chỉ cần đảm bảo biến môi trường `DATABASE_URL` đã được set đúng (bước 4 bên
dưới), Root Directory để trống (mục 0), rồi deploy lại là xong.

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

## 6. Chia sẻ cho từng nhân sự

1. Vào **Quản lý nhân sự** (chỉ Admin/Quản lý thấy mục này) → **+ Thêm nhân
   sự**: nhập tên, chọn Vị trí (hệ thống tự gán checklist 3 giai đoạn), chi
   nhánh, đặt **Mã NV** (VD `NV001`) + **PIN 4 số**.
2. Gửi cho nhân sự đó: **link app** (VD `https://khapkhun-hrms.onrender.com`)
   + **Mã NV** + **PIN**. Họ tự mở trên điện thoại, đăng nhập, vào thẳng
   **Checklist của tôi** — hệ thống tự hiểu vị trí, tự hiện đúng checklist.
3. Khuyến khích mỗi người **đổi PIN riêng** ngay lần đầu đăng nhập (nút "Đổi
   mã PIN" luôn có sẵn trong app).

---

## 7. Cách dùng hằng ngày

### Nhân viên
- Đăng nhập → **Checklist của tôi** → chọn tab Mở ca / Giao ca / Đóng ca →
  tick từng việc khi làm xong. Tick phát huy hiệu quả **ngay lập tức, không
  giật màn hình** — cứ tick liên tục từ trên xuống dưới thoải mái.
- Cuối ca bấm **"Chốt ngày — lưu vào lịch sử KPI"** để điểm hôm nay được ghi
  vào lịch sử (không chốt cũng không sao, quản lý chốt hộ được).

### Quản lý (Bếp Trưởng, Giám Sát Sảnh, Quản Lý Ca)
- **Đội nhóm của tôi**: thấy % Mở ca / Giao ca / Đóng ca + KPI hôm nay của
  đúng nhân sự cấp dưới, cùng chi nhánh (tự lọc theo sơ đồ tổ chức).
- Bấm **Xem chi tiết** 1 nhân sự → có thể **tick trực tiếp checklist thay họ**
  nếu cần, chấm **điểm năng lực (1–5)**, ghi **đánh giá định kỳ**.
- **Bảng KPI tổng hợp**: chọn Tháng/Quý/Năm → xem KPI trung bình + % ngày đạt
  chuẩn (≥80) của từng người, kèm **biểu đồ cột xu hướng theo tháng** để thấy
  ai đang tiến bộ / đang đi xuống — dùng xét thưởng minh bạch. Có nút **Xuất CSV**.

### Admin &amp; Quản Lý Vùng (quyền tối thượng)
- **Admin** là quyền cao nhất: thấy toàn bộ nhân sự mọi chi nhánh, thêm/sửa/xoá
  bất kỳ ai (kể cả Admin khác), là người duy nhất **cấp quyền Admin hoặc Quản
  Lý Vùng** cho người khác (tick vào ô tương ứng khi thêm/sửa nhân sự).
- **Quản Lý Vùng** có quyền hạn *gần như tương đương* Admin — thấy toàn bộ
  nhân sự mọi chi nhánh, thêm/sửa/xoá nhân viên thường, sửa checklist — nhưng
  **không thể sửa hoặc xoá tài khoản Admin**, và **không thể tự cấp quyền
  Admin/Quản Lý Vùng** cho ai (chỉ Admin gốc làm được việc này).
- Cả hai đều thấy thêm cột **"Đề xuất thưởng"** ngay trong bảng **Đội Nhóm Của
  Tôi** (Xuất sắc/Tốt/Khá/Yếu, kèm lý do khi rê chuột) — không cần bấm vào
  từng người mới thấy, tiện xét duyệt thưởng nhanh cho cả đội.
- Trang **"Quản lý Checklist"**: chọn 1 vị trí bên trái → sửa nội dung công
  việc, đổi trọng số (Trọng yếu/Quan trọng/Thường quy), thêm hoặc xoá đầu việc
  cho từng giai đoạn (Mở ca/Giao ca/Đóng ca) → bấm **Lưu thay đổi** → áp dụng
  ngay lập tức cho mọi nhân sự đang giữ vị trí đó, không cần sửa code hay
  deploy lại. Đây là cách chỉnh checklist cho phù hợp cách vận hành riêng của
  từng cửa hàng.

---

## 8. Sửa checklist theo 2 cách

**Cách 1 — Qua giao diện (khuyến nghị, dùng hằng ngày):** Admin hoặc Quản Lý
Vùng vào trang **"Quản lý Checklist"**, chọn vị trí, sửa/thêm/xoá việc, bấm
Lưu — áp dụng ngay lập tức, không cần đụng code, không cần deploy lại.

**Cách 2 — Qua code (chỉ cần khi muốn đổi bộ mặc định lúc khởi tạo project
mới):** Toàn bộ checklist "gốc" nằm trong `config/positions.default.js`. File
này **CHỈ được đọc đúng 1 lần** — lúc Postgres còn hoàn toàn trống (project
mới tinh). Sau đó mọi thay đổi phải làm qua Cách 1, vì dữ liệu thật đã nằm ở
Postgres chứ không đọc lại file này nữa.

---

## 9. Sao lưu dữ liệu

Dữ liệu nằm ở Neon — Neon có sẵn cơ chế backup/point-in-time recovery ở mức
hạ tầng. Muốn tự tải 1 bản về máy định kỳ (khuyến nghị, để yên tâm tuyệt
đối), vào trang Neon → project → **SQL Editor** hoặc dùng lệnh:

```bash
pg_dump "<DATABASE_URL>" > backup-$(date +%F).sql
```

chạy trên máy có cài PostgreSQL client (hoặc cho Claude Code chạy hộ định kỳ).

---

## 10. Giới hạn hiện tại (nên biết trước)

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
- **"Đề xuất thưởng" chỉ mang tính gợi ý** dựa trên mức KPI, không tự động
  chi tiền hay tính ra số tiền cụ thể — Admin/Quản Lý Vùng vẫn là người quyết
  định cuối cùng.
- Không thể xoá **Admin cuối cùng** của hệ thống (để tránh mất quyền truy cập
  vĩnh viễn) — luôn phải còn ít nhất 1 Admin.
- Chưa có sơ đồ tổ chức dạng hình vẽ trực quan — hiện hiển thị dạng bảng.
