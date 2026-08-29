/**
 * ============================================================================
 *  CẤU HÌNH SƠ ĐỒ TỔ CHỨC + CHECKLIST SOP THEO 3 GIAI ĐOẠN
 * ============================================================================
 *  Đây là "bộ não" của toàn bộ hệ thống. Muốn thêm/sửa vị trí, thêm/sửa
 *  đầu việc SOP, chỉ cần sửa file này rồi khởi động lại server (không cần
 *  sửa code chỗ khác).
 *
 *  Mỗi vị trí có đúng 3 giai đoạn cố định trong ngày:
 *    - moCa    : Mở ca   (đầu ca, chuẩn bị trước khi vận hành)
 *    - giaoCa  : Giao ca (các việc vận hành / bàn giao trong ca)
 *    - dongCa  : Đóng ca (cuối ca, dọn dẹp, chốt sổ, bàn giao ca sau)
 *
 *  Mỗi việc (item) có:
 *    id     : mã duy nhất (không trùng trong toàn hệ thống)
 *    label  : nội dung công việc hiển thị cho nhân viên
 *    weight : độ quan trọng — 3 = Trọng yếu, 2 = Quan trọng, 1 = Thường quy
 *
 *  ⚠️ Các dòng có ghi "(mới thêm — vui lòng xem lại)" là việc tôi suy luận
 *  thêm vào để đủ cấu trúc 3 giai đoạn cho vị trí đó, vì dữ liệu gốc của
 *  bạn chưa có sẵn việc cho giai đoạn này. Hãy sửa lại đúng thực tế quán.
 * ============================================================================
 */

const TIERS = [
  { id: 1, label: 'Tầng 1 · Nhân Viên Tác Nghiệp', hint: 'Trực tiếp thực hiện SOP hàng ngày' },
  { id: 2, label: 'Tầng 2 · Trưởng Bộ Phận', hint: 'Phụ trách 1 nhóm nhân viên, KPI phụ thuộc đội nhóm' },
  { id: 3, label: 'Tầng 3 · Quản Lý Ca', hint: 'Điều phối toàn ca, phụ thuộc các trưởng bộ phận' },
  { id: 4, label: 'Tầng 4 · Quản Lý Cửa Hàng', hint: 'Chịu trách nhiệm toàn chi nhánh mọi ca' },
];

const BASE_COMPETENCIES = [
  { id: 'chuyen-mon', label: 'Kiến thức chuyên môn / nghiệp vụ' },
  { id: 'tuan-thu', label: 'Tuân thủ quy trình & an toàn vệ sinh (ATTP)' },
  { id: 'xu-ly', label: 'Kỹ năng xử lý tình huống phát sinh' },
  { id: 'thai-do', label: 'Thái độ & kỷ luật làm việc' },
  { id: 'giao-tiep', label: 'Giao tiếp / phối hợp đồng đội' },
];
const LEADERSHIP_COMP = { id: 'lanh-dao', label: 'Khả năng đào tạo / lãnh đạo đội nhóm' };

const PHASE_LABELS = {
  moCa: 'Mở ca',
  giaoCa: 'Giao ca',
  dongCa: 'Đóng ca',
};

const POSITIONS = {
  // ---------------- TẦNG 1 — NHÂN VIÊN TÁC NGHIỆP ----------------
  'bep-chinh': {
    label: 'Bếp Chính', tier: 1, reportsTo: 'bep-truong',
    phases: {
      moCa: [
        { id: 'bd1', label: 'Gas bếp hoạt động bình thường, van không rò', weight: 3 },
        { id: 'bd2', label: 'Nhiệt độ tủ lạnh ≤5°C, tủ đông ≤-18°C', weight: 3 },
        { id: 'bd3', label: 'Nguyên liệu nhận đủ theo phiếu đặt hàng, tươi ngon', weight: 3 },
        { id: 'bd4', label: 'Dụng cụ nấu sạch, đủ số lượng (chảo, nồi, dao, thớt)', weight: 2 },
        { id: 'bd5', label: 'Màu thớt đúng quy định (đỏ=thịt sống, xanh=rau, vàng=thịt chín)', weight: 2 },
        { id: 'bd6', label: 'Nguyên liệu / topping hoàn thành trước giờ cao điểm', weight: 2 },
        { id: 'bd7', label: 'Bề mặt bếp sạch, không còn dầu mỡ từ ca trước', weight: 1 },
      ],
      giaoCa: [
        { id: 'bch1', label: 'Trực tiếp chế biến món chính đúng 100% công thức chuẩn', weight: 3 },
        { id: 'bch2', label: 'Kiểm tra & nêm nếm trước khi ra món', weight: 3 },
        { id: 'bch3', label: 'Điều phối phụ bếp trong giờ cao điểm', weight: 2 },
        { id: 'bch4', label: 'Kiểm soát định lượng khẩu phần theo bảng định mức', weight: 2 },
        { id: 'bch5', label: 'Báo Bếp Trưởng khi nguyên liệu sắp hết', weight: 1 },
      ],
      dongCa: [
        { id: 'bc1', label: 'Tắt hết bếp, van gas khóa chặt', weight: 3 },
        { id: 'bc2', label: 'Nguyên liệu thừa cất đúng nơi, dán nhãn ngày prep', weight: 2 },
        { id: 'bc3', label: 'Chảo, nồi, dao, thớt rửa sạch, cất đúng vị trí', weight: 2 },
        { id: 'bc4', label: 'Bề mặt bếp cọ sạch, không còn mỡ', weight: 1 },
        { id: 'bc5', label: 'Sàn bếp lau khô, không đọng nước', weight: 1 },
        { id: 'bc6', label: 'Phiếu kiểm kê tồn kho nguyên liệu điền đầy đủ, ký tên', weight: 2 },
      ],
    },
  },
  'phu-bep': {
    label: 'Phụ Bếp', tier: 1, reportsTo: 'bep-truong',
    phases: {
      moCa: [
        { id: 'pbd1', label: 'Gas bếp hoạt động bình thường, van không rò', weight: 3 },
        { id: 'pbd2', label: 'Nhiệt độ tủ lạnh ≤5°C, tủ đông ≤-18°C', weight: 3 },
        { id: 'pbd3', label: 'Nguyên liệu nhận đủ theo phiếu đặt hàng, tươi ngon', weight: 3 },
        { id: 'pbd4', label: 'Dụng cụ nấu sạch, đủ số lượng (chảo, nồi, dao, thớt)', weight: 2 },
        { id: 'pbd5', label: 'Màu thớt đúng quy định (đỏ=thịt sống, xanh=rau, vàng=thịt chín)', weight: 2 },
      ],
      giaoCa: [
        { id: 'pb1', label: 'Hỗ trợ sơ chế nguyên liệu theo hướng dẫn Bếp Chính', weight: 2 },
        { id: 'pb2', label: 'Chế biến theo công thức khi được giao, không tự ý đổi', weight: 2 },
        { id: 'pb3', label: 'Quản lý dao thớt / dụng cụ đúng màu, sạch sẽ, đủ số lượng', weight: 2 },
        { id: 'pb4', label: 'Vệ sinh khu vực bếp liên tục', weight: 2 },
      ],
      dongCa: [
        { id: 'pbc1', label: 'Tắt hết bếp, van gas khóa chặt', weight: 3 },
        { id: 'pbc2', label: 'Chảo, nồi, dao, thớt rửa sạch, cất đúng vị trí', weight: 2 },
        { id: 'pbc3', label: 'Sàn bếp lau khô, không đọng nước', weight: 1 },
        { id: 'pb5', label: 'Hỗ trợ kiểm kê cuối ca, ghi phiếu đầy đủ', weight: 1 },
      ],
    },
  },
  'nv-xoi': {
    label: 'NV Xôi', tier: 1, reportsTo: 'bep-truong',
    phases: {
      moCa: [
        { id: 'x1', label: 'Vo / ngâm gạo nếp đúng thời gian theo loại xôi, gạo không mốc', weight: 2 },
      ],
      giaoCa: [
        { id: 'x2', label: 'Thổi xôi đúng kỹ thuật: đun sôi, xới đều, giữ lửa vừa', weight: 3 },
        { id: 'x3', label: 'Xôi đạt chuẩn: dẻo, không nhão, không khô, chín đều', weight: 3 },
        { id: 'x4', label: 'Cân / đong xôi đúng cỡ phần chuẩn, không ước lượng mắt', weight: 2 },
        { id: 'x5', label: 'Giữ xôi trong nồi ủ nóng ≥60°C, thay mỗi 2 giờ', weight: 2 },
      ],
      dongCa: [
        { id: 'x6', label: 'Cất nguyên liệu cuối ca đúng FIFO, dán nhãn ngày', weight: 1 },
      ],
    },
  },
  'nv-goi': {
    label: 'NV Gỏi', tier: 1, reportsTo: 'bep-truong',
    phases: {
      moCa: [
        { id: 'g1', label: 'Rửa rau, bào đúng size chuẩn đầu ca', weight: 2 },
      ],
      giaoCa: [
        { id: 'g2', label: 'Trộn gỏi theo chart / hướng dẫn của Bếp Trưởng', weight: 2 },
        { id: 'g3', label: 'Nêm nếm thử trước khi ra món, đĩa sạch', weight: 2 },
        { id: 'g4', label: 'Pha nước sốt đúng tỷ lệ chua–ngọt–mặn–cay, pha trước', weight: 3 },
      ],
      dongCa: [
        { id: 'g5', label: 'Cất rau đã sơ chế vào hộp kín, dán nhãn ngày (FIFO)', weight: 2 },
        { id: 'g6', label: 'Không để rau củ dập úng hoặc có dấu hiệu đổ nhựa', weight: 1 },
      ],
    },
  },
  'nv-pha-che': {
    label: 'NV Pha Chế', tier: 1, reportsTo: 'giam-sat-sanh',
    phases: {
      moCa: [
        { id: 'pc1', label: 'Dụng cụ pha chế luôn sạch sẽ và khô ráo', weight: 2 },
        { id: 'pc2', label: 'Đá đủ cho ít nhất 50 ly (kiểm tra máy làm đá)', weight: 2 },
        { id: 'pc3', label: 'Nguyên liệu: trái cây tươi, siro, sữa, đường đủ số lượng', weight: 2 },
        { id: 'pc4', label: 'Pha thử 1 ly kiểm tra vị trước khi mở cửa', weight: 2 },
      ],
      giaoCa: [
        { id: 'pc7', label: 'Pha chế đúng công thức chuẩn từng loại, không ước lượng mắt', weight: 3 },
        { id: 'pc8', label: 'Đồ uống ra trong ≤5 phút sau khi nhận order', weight: 2 },
        { id: 'pc9', label: 'Kiểm tra hạn sử dụng nguyên liệu trước khi phục vụ', weight: 2 },
        { id: 'pc11', label: 'Vệ sinh máy móc & quầy pha chế sau mỗi lần pha/xay', weight: 1 },
      ],
      dongCa: [
        { id: 'pc12', label: 'Vệ sinh toàn bộ quầy pha chế, máy móc cuối ca (mới thêm — vui lòng xem lại)', weight: 2 },
        { id: 'pc13', label: 'Kiểm kê nguyên liệu tồn, báo cáo hao hụt (mới thêm — vui lòng xem lại)', weight: 2 },
        { id: 'pc14', label: 'Đổ đá thừa, vệ sinh máy làm đá, tắt thiết bị không cần thiết (mới thêm — vui lòng xem lại)', weight: 1 },
      ],
    },
  },
  'nv-phuc-vu': {
    label: 'NV Phục Vụ', tier: 1, reportsTo: 'giam-sat-sanh',
    phases: {
      moCa: [
        { id: 'pvd1', label: 'Bàn ghế sạch sẽ, sắp xếp gọn gàng trước giờ mở cửa (mới thêm — vui lòng xem lại)', weight: 2 },
        { id: 'pvd2', label: 'Chuẩn bị menu, dụng cụ ăn đầy đủ tại quầy phục vụ (mới thêm — vui lòng xem lại)', weight: 2 },
      ],
      giaoCa: [
        { id: 'pv-b1', label: 'B1 – Chào đón, dẫn khách vào bàn trong ≤30 giây', weight: 2 },
        { id: 'pv-b3', label: 'B3 – Nhận order chính xác, đọc lại 100% đơn, hỏi dị ứng', weight: 3 },
        { id: 'pv-b4', label: 'B4 – Kiểm tra & mang món đúng bàn, đủ món, đúng nhiệt độ', weight: 2 },
        { id: 'pv-b5', label: 'B5 – Ghé bàn hỏi thăm ≥1 lần, refill nước/đá', weight: 2 },
        { id: 'pv-b6', label: 'B6 – In bill, thanh toán, trả tiền thừa trong ≤2 phút', weight: 2 },
        { id: 'pv-don', label: 'Dọn bàn & reset setup chuẩn trong ≤3 phút', weight: 2 },
        { id: 'pv-dear', label: 'Xử lý phàn nàn đúng quy trình D.E.A.R khi phát sinh', weight: 2 },
      ],
      dongCa: [
        { id: 'pvc1', label: 'Dọn dẹp toàn bộ khu vực phục vụ cuối ca (mới thêm — vui lòng xem lại)', weight: 2 },
        { id: 'pvc2', label: 'Kiểm tra không còn đồ khách bỏ quên, bàn giao ca sau (mới thêm — vui lòng xem lại)', weight: 1 },
      ],
    },
  },
  'thu-ngan': {
    label: 'Thu Ngân', tier: 1, reportsTo: 'giam-sat-sanh',
    phases: {
      moCa: [
        { id: 'tnd1', label: 'Kiểm tra tiền lẻ đầu ca đủ, máy POS hoạt động bình thường (mới thêm — vui lòng xem lại)', weight: 2 },
      ],
      giaoCa: [
        { id: 'tn1', label: 'In bill chính xác 100%', weight: 3 },
        { id: 'tn2', label: 'Xử lý thanh toán trong ≤2 phút, xác nhận đúng số tiền', weight: 2 },
      ],
      dongCa: [
        { id: 'tn3', label: 'Đối soát tiền mặt/POS cuối ca, chênh lệch = 0', weight: 3 },
        { id: 'tn4', label: 'Lập & nộp báo cáo doanh thu ca đúng hạn (≤20 phút)', weight: 2 },
      ],
    },
  },
  'tap-vu': {
    label: 'Tạp Vụ', tier: 1, reportsTo: 'giam-sat-sanh',
    phases: {
      moCa: [
        { id: 'tvd1', label: 'Dụng cụ vệ sinh đầy đủ, khu vực sạch trước giờ mở cửa (mới thêm — vui lòng xem lại)', weight: 2 },
      ],
      giaoCa: [
        { id: 'tv1', label: 'Vệ sinh sảnh & nhà vệ sinh đúng tần suất (30 phút/lần)', weight: 2 },
        { id: 'tv2', label: 'Hỗ trợ dọn bàn, reset setup trong ≤3 phút', weight: 2 },
        { id: 'tv4', label: 'Đổ rác, xử lý chất thải đúng nơi quy định', weight: 1 },
      ],
      dongCa: [
        { id: 'tv3', label: 'Vệ sinh cuối ca khu vực chung trong 30 phút', weight: 2 },
      ],
    },
  },
  'giao-hang': {
    label: 'Giao Hàng (Shipper)', tier: 1, reportsTo: 'giam-sat-sanh',
    phases: {
      moCa: [
        { id: 'ghd1', label: 'Kiểm tra xe, túi giữ nhiệt, điện thoại/app nhận đơn hoạt động tốt trước ca (mới thêm — vui lòng xem lại)', weight: 2 },
      ],
      giaoCa: [
        { id: 'gh1', label: 'Giao đúng giờ cam kết (≥95% đơn đúng giờ)', weight: 3 },
        { id: 'gh2', label: 'Giao đúng địa chỉ, đúng đơn, đủ phụ kiện', weight: 3 },
        { id: 'gh3', label: 'Bảo quản món không đổ, không nguội (túi giữ nhiệt)', weight: 2 },
        { id: 'gh4', label: 'Thái độ lịch sự, không dùng điện thoại khi lái xe', weight: 2 },
      ],
      dongCa: [
        { id: 'gh5', label: 'Đồng phục & phương tiện gọn sạch', weight: 1 },
        { id: 'ghc1', label: 'Vệ sinh xe/túi giữ nhiệt, chuẩn bị cho ca sau (mới thêm — vui lòng xem lại)', weight: 1 },
      ],
    },
  },

  // ---------------- TẦNG 2 — TRƯỞNG BỘ PHẬN ----------------
  'bep-truong': {
    label: 'Bếp Trưởng', tier: 2, reportsTo: 'quan-ly-ca', hasLeadership: true,
    phases: {
      moCa: [
        { id: 'btd1', label: 'Gas bếp hoạt động bình thường, van không rò', weight: 3 },
        { id: 'btd2', label: 'Nhiệt độ tủ lạnh ≤5°C, tủ đông ≤-18°C', weight: 3 },
        { id: 'btd3', label: 'Nguyên liệu nhận đủ theo phiếu đặt hàng, tươi ngon', weight: 3 },
      ],
      giaoCa: [
        { id: 'bt1', label: 'Kiểm tra chất lượng: nếm/kiểm tra vị, hình thức trước khi ra mỗi món', weight: 3 },
        { id: 'bt2', label: 'Kiểm tra checklist của Bếp Chính, Phụ Bếp, NV Xôi, NV Gỏi mỗi ca', weight: 3 },
        { id: 'bt3', label: 'Theo dõi tồn kho nguyên liệu liên tục, báo Quản Lý Ca khi gần hết', weight: 2 },
        { id: 'bt4', label: 'Duy trì vệ sinh bếp liên tục, tuân thủ FIFO', weight: 2 },
        { id: 'bt5', label: 'Hướng dẫn / đào tạo nhân viên bếp đúng quy trình', weight: 1 },
      ],
      dongCa: [
        { id: 'btc1', label: 'Tắt hết bếp, van gas khóa chặt, kiểm tra toàn khu bếp an toàn', weight: 3 },
        { id: 'btc2', label: 'Phiếu kiểm kê tồn kho nguyên liệu điền đầy đủ, ký tên', weight: 2 },
      ],
    },
  },
  'giam-sat-sanh': {
    label: 'Giám Sát Sảnh', tier: 2, reportsTo: 'quan-ly-ca', hasLeadership: true,
    phases: {
      moCa: [
        { id: 'gssd1', label: 'Họp đầu ca với đội sảnh: phân công vị trí, kiểm tra vệ sinh tổng thể trước giờ mở cửa (mới thêm — vui lòng xem lại)', weight: 2 },
      ],
      giaoCa: [
        { id: 'gss1', label: 'Điều phối phục vụ, không để bàn nào bị "bỏ quên"', weight: 2 },
        { id: 'gss2', label: 'Kiểm tra checklist của Phục Vụ, Thu Ngân, Pha Chế, Tạp Vụ, Giao Hàng mỗi ca', weight: 3 },
        { id: 'gss3', label: 'Xử lý phàn nàn nâng cấp trong ≤10 phút', weight: 3 },
        { id: 'gss4', label: 'Kiểm tra vệ sinh sảnh mỗi 30 phút (bàn ghế, sàn, nhà vệ sinh)', weight: 2 },
        { id: 'gss5', label: 'Thu thập phản hồi khách hàng (QR code / trực tiếp)', weight: 1 },
      ],
      dongCa: [
        { id: 'gss6', label: 'Lập & nộp báo cáo ca sảnh trong ≤15 phút sau khi đóng cửa', weight: 1 },
      ],
    },
  },

  // ---------------- TẦNG 3 — QUẢN LÝ CA ----------------
  'quan-ly-ca': {
    label: 'Quản Lý Ca / Trưởng Ca', tier: 3, reportsTo: 'quan-ly-cua-hang', hasLeadership: true,
    phases: {
      moCa: [
        { id: 'qlcd1', label: 'Kiểm tra tổng thể khu vực bếp + sảnh sẵn sàng trước giờ mở cửa, xác nhận đủ nhân sự ca (mới thêm — vui lòng xem lại)', weight: 3 },
      ],
      giaoCa: [
        { id: 'qlc1', label: 'Thông báo món 86 (hết) hôm nay', weight: 1 },
        { id: 'qlc3', label: 'Nhân sự ca hôm nay: ai nghỉ, ai thay thế', weight: 1 },
        { id: 'qlc5', label: 'KPI doanh thu cần đạt trong ca', weight: 1 },
        { id: 'qlc8', label: 'Phân công vị trí từng người trong ca', weight: 1 },
        { id: 'qlc9', label: 'Kiểm tra Bếp Trưởng & Giám Sát Sảnh đã chấm đủ checklist đội mình', weight: 3 },
        { id: 'qlc10', label: 'Vận hành: đảm bảo quy trình được thực hiện đúng, không gián đoạn', weight: 3 },
        { id: 'qlc11', label: 'Doanh thu: theo dõi theo giờ, so sánh với KPI', weight: 2 },
        { id: 'qlc12', label: 'Tài chính: quản lý quỹ tiền mặt, chênh lệch = 0', weight: 3 },
      ],
      dongCa: [
        { id: 'qlc15', label: 'Báo cáo ca đầy đủ, đúng hạn cho Quản Lý Cửa Hàng', weight: 2 },
      ],
    },
  },

  // ---------------- TẦNG 4 — QUẢN LÝ CỬA HÀNG ----------------
  'quan-ly-cua-hang': {
    label: 'Quản Lý Cửa Hàng', tier: 4, reportsTo: null, hasLeadership: true, isTopManager: true,
    phases: {
      moCa: [
        { id: 'qlchd1', label: 'Kiểm tra tổng thể toàn chi nhánh, xác nhận các ca đã sẵn sàng mở cửa (mới thêm — vui lòng xem lại)', weight: 2 },
      ],
      giaoCa: [
        { id: 'qlch3', label: 'Theo dõi doanh thu & chi phí toàn chi nhánh so với KPI tháng', weight: 3 },
        { id: 'qlch4', label: 'Đánh giá năng lực định kỳ cho các Trưởng Bộ Phận / Quản Lý Ca', weight: 2 },
        { id: 'qlch5', label: 'Làm việc với chuỗi / ban giám đốc: báo cáo tuần, đề xuất cải tiến', weight: 2 },
        { id: 'qlch6', label: 'Kiểm tra đột xuất vệ sinh ATTP & tồn kho toàn chi nhánh', weight: 2 },
      ],
      dongCa: [
        { id: 'qlch1', label: 'Kiểm tra & xác nhận 100% nhân sự mọi ca đã chấm đủ checklist SOP trong ngày', weight: 3 },
        { id: 'qlch2', label: 'Duyệt báo cáo từng ca từ Quản Lý Ca, xử lý bất thường', weight: 3 },
      ],
    },
  },
};

function directReports(posKey) {
  return Object.entries(POSITIONS).filter(([, p]) => p.reportsTo === posKey).map(([k]) => k);
}
function descendantPositions(posKey) {
  const direct = directReports(posKey);
  let all = [...direct];
  direct.forEach((d) => all.push(...descendantPositions(d)));
  return all;
}
function allItemsOfPosition(posKey) {
  const pos = POSITIONS[posKey];
  if (!pos) return [];
  const out = [];
  for (const phase of ['moCa', 'giaoCa', 'dongCa']) {
    (pos.phases[phase] || []).forEach((it) => out.push({ ...it, phase }));
  }
  return out;
}
function competenciesFor(posKey) {
  const pos = POSITIONS[posKey];
  return pos && pos.hasLeadership ? [...BASE_COMPETENCIES, LEADERSHIP_COMP] : BASE_COMPETENCIES;
}

module.exports = {
  TIERS,
  BASE_COMPETENCIES,
  LEADERSHIP_COMP,
  PHASE_LABELS,
  POSITIONS,
  directReports,
  descendantPositions,
  allItemsOfPosition,
  competenciesFor,
};
