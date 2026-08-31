# Hệ Thống Vận Hành SOP &amp; KPI Nội Bộ — KhạpKhun · Pinoong

Phần mềm nội bộ: **Checklist SOP theo 3 giai đoạn (Mở ca – Giao ca – Đóng ca)** +
**Đánh giá năng lực &amp; KPI**, tài khoản riêng cho từng nhân sự (Mã NV + PIN),
phân quyền theo sơ đồ tổ chức, bảng KPI tháng/quý/năm kèm biểu đồ tiến bộ.

**Bản này có gì mới so với bản trước:**
- **Bảo vệ tài khoản Admin**: Quản Lý Vùng không đụng được vào bất kỳ Admin nào
  (xem/sửa/xoá). Các Admin quản lý được lẫn nhau (kể cả Admin do người khác
  tạo ra) — riêng **không ai xoá/hạ quyền được Admin cuối cùng** của hệ thống,
  tránh trường hợp không còn ai có quyền tối thượng.
- **Admin &amp; Quản Lý Vùng không còn gắn vị trí, không xuất hiện trong checklist
  hay bảng KPI** — vì họ chỉ giao việc, không trực tiếp làm SOP.
- **Checklist dùng chung theo vị trí**: nếu 2+ người cùng giữ 1 vị trí (VD 2
  người cùng làm NV Xôi), họ nhìn thấy CHUNG 1 bảng việc — ai tick trước thì
  việc đó tính chung cho cả nhóm, hệ thống tự ghi lại **ai đã ký** từng việc,
  và tính riêng **% đóng góp cá nhân** để so sánh hiệu suất giữa những người
  cùng vị trí (không còn tình trạng "A làm, B tick nhận").
- **Đầu việc tự động theo đội nhóm**: Admin đánh dấu 1 việc của Tầng 2-3-4 là
  "Tự động" → việc đó không tick tay được nữa, hệ thống tự đánh dấu hoàn thành
  khi TOÀN BỘ đội nhóm cấp dưới đạt đúng 100%.
- **Gán quản lý trực tiếp cho nhân sự Tầng 1** (tuỳ chọn) — dùng khi có nhiều
  người cùng giữ 1 chức quản lý (VD 2 Quản Lý Ca khác ca) và cần tách rõ ai
  quản ai, thay vì chỉ suy luận theo vị trí + chi nhánh.
- **Thêm / xoá hẳn 1 vị trí** ngay trên giao diện (không chỉ sửa checklist của
  vị trí có sẵn) — kèm chặn xoá nếu còn người đang giữ hoặc còn vị trí khác
  báo cáo lên nó.

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
được qua UI + checklist dùng chung + tự động hoá), làm theo mục 3–4 bên dưới để
đẩy code mới lên và deploy lại.

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
- **Nếu vị trí của bạn có nhiều người cùng làm** (VD 2 người cùng là NV Xôi),
  checklist là **bảng dùng chung** — hệ thống hiện rõ "Bảng checklist dùng
  chung với: [tên đồng nghiệp]" ngay đầu trang. Ai tick trước thì việc đó
  tính chung cho cả nhóm và **ghi lại đúng tên người đã ký**, đồng nghiệp
  đăng nhập vào sẽ thấy việc đó đã xong (không tick trùng, không chồng chéo).
  Ô **"Đóng góp cá nhân"** cho biết bạn đã tự tay làm bao nhiêu % trong số
  việc cả nhóm đã hoàn thành — dùng để so sánh hiệu suất công bằng giữa
  những người cùng vị trí.
- Cuối ca bấm **"Chốt ngày — lưu vào lịch sử KPI"** để điểm hôm nay (cả %
  hoàn thành chung lẫn % đóng góp cá nhân) được ghi vào lịch sử.

### Quản lý (Bếp Trưởng, Giám Sát Sảnh, Quản Lý Ca)
- **Đội nhóm của tôi**: thấy % Mở ca / Giao ca / Đóng ca + KPI hôm nay của
  đúng nhân sự cấp dưới, cùng chi nhánh (tự lọc theo sơ đồ tổ chức, hoặc theo
  đúng người được gán "báo cáo trực tiếp" nếu có).
- Bấm **Xem chi tiết** 1 nhân sự → có thể **tick trực tiếp checklist thay họ**
  nếu cần, chấm **điểm năng lực (1–5)**, ghi **đánh giá định kỳ**.
- Một số đầu việc của chính vị trí quản lý (VD "Kiểm tra checklist của đội
  bếp mỗi ca") có thể được Admin đánh dấu **"Tự động"** — việc đó sẽ tự hiện
  ✓ hoàn thành khi toàn bộ nhân sự Tầng 1 cấp dưới đạt đúng 100%, không cần
  quản lý tự tick, và cũng không tick tay được (đảm bảo trung thực).
- **Bảng KPI tổng hợp**: chọn Tháng/Quý/Năm → xem KPI trung bình + % ngày đạt
  chuẩn (≥80) của từng người, kèm **biểu đồ cột xu hướng theo tháng** để thấy
  ai đang tiến bộ / đang đi xuống — dùng xét thưởng minh bạch. Có nút **Xuất CSV**.

### Admin &amp; Quản Lý Vùng (quyền tối thượng — không tham gia checklist/KPI)
- Admin/Quản Lý Vùng **chỉ giao việc**, không có vị trí vận hành, không tick
  checklist, không xuất hiện trong bảng KPI hay Đội Nhóm — vì vai trò của họ
  là quản lý hệ thống, không phải người trực tiếp làm SOP.
- **Admin** là quyền cao nhất: thấy toàn bộ nhân sự mọi chi nhánh, thêm/sửa/xoá
  bất kỳ nhân viên thường nào, là người duy nhất **cấp quyền Admin hoặc Quản
  Lý Vùng** cho người khác. Các Admin **quản lý được lẫn nhau** (sửa/xoá Admin
  khác, kể cả Admin mình không tạo ra) — riêng **không ai xoá hay hạ quyền
  được Admin cuối cùng** của hệ thống, để luôn còn ít nhất 1 người có quyền
  tối thượng.
- **Quản Lý Vùng** có quyền hạn *gần như tương đương* Admin — thấy toàn bộ
  nhân sự mọi chi nhánh, thêm/sửa/xoá nhân viên thường, sửa checklist — nhưng
  **không được đụng vào bất kỳ tài khoản Admin nào** (kể cả xem/sửa), và
  **không được tự cấp quyền Admin/Quản Lý Vùng** cho ai.
- Trong trang **Đội Nhóm Của Tôi** (nay gọi là "Toàn Bộ Nhân Sự" với 2 vai trò
  này), có thêm cột **"Đề xuất thưởng"** (Xuất sắc/Tốt/Khá/Yếu, kèm lý do khi
  rê chuột) — không cần bấm vào từng người mới thấy.
- Trang **"Quản lý Checklist"**: chọn 1 vị trí bên trái → sửa tên vị trí, đổi
  tầng, đổi "báo cáo lên ai", bật/tắt "vị trí quản lý", sửa nội dung công việc
  / trọng số / cờ "Tự động" cho từng đầu việc → **Lưu thay đổi** → áp dụng
  ngay cho mọi nhân sự đang giữ vị trí đó. Nút **"+ Thêm vị trí mới"** để tạo
  hẳn 1 chức danh mới (VD "NV Rửa Bát"); mỗi vị trí có nút **"Xoá vị trí"**
  riêng — bị chặn nếu còn người đang giữ hoặc còn vị trí khác báo cáo lên nó.
- Khi thêm/sửa nhân sự Tầng 1, có thể chọn **"Báo cáo trực tiếp cho ai"**
  (tuỳ chọn) — dùng khi có nhiều người cùng giữ 1 chức quản lý (VD 2 Quản Lý
  Ca khác ca) và cần tách rõ ai quản ai, thay vì chỉ suy theo vị trí+chi nhánh.

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
- **Checklist dùng chung theo vị trí + chi nhánh**: nếu vô tình xếp 2 người
  khác vai trò thực tế vào chung 1 "vị trí" hệ thống, họ sẽ bị gộp chung
  checklist — hãy tách thành 2 vị trí riêng (VD "NV Xôi" và "NV Xôi (Ca 2)")
  nếu công việc thực tế của họ khác nhau, dùng trang Quản lý Checklist để tạo.
- **"Tự động theo đội nhóm"** xét đúng 100% mới đánh dấu hoàn thành (không có
  mức "gần đạt") — nếu 1 nhân sự Tầng 1 quên tick dù đã làm xong, việc tự động
  của quản lý cũng sẽ hiện chưa xong theo đúng logic minh bạch.
- **"Đề xuất thưởng" chỉ mang tính gợi ý** dựa trên mức KPI, không tự động
  chi tiền hay tính ra số tiền cụ thể — Admin/Quản Lý Vùng vẫn là người quyết
  định cuối cùng.
- Không thể xoá **Admin cuối cùng** của hệ thống (để tránh mất quyền truy cập
  vĩnh viễn) — luôn phải còn ít nhất 1 Admin.
- Chưa có sơ đồ tổ chức dạng hình vẽ trực quan — hiện hiển thị dạng bảng.
