# Đăng tài xe vào kho Heineken – Viettel Post TTC

Web đăng tài cho tài xế vào kho Heineken của **Công ty TNHH TMDV và Kho Vận Viettel Post - TTC**.
Tài xế điền phiếu trên điện thoại → dữ liệu ghi thẳng vào Google Sheet (qua Google Apps Script) → điều phối theo dõi xe mới vào bãi theo thời gian thực.

## 🔗 Đường dẫn

| Trang | Link | Dành cho |
|---|---|---|
| 📝 **Đăng ký (đăng tài)** | **https://lehoang-dev.github.io/vttc-dangtai/** | Tài xế |
| 📡 **Theo dõi** | **https://lehoang-dev.github.io/vttc-dangtai/theo-doi/** | Điều phối / bảo vệ cổng |

Link thử nghiệm (ghi vào tab `DangTai2`, không đụng dữ liệu thật):

- Theo dõi tab thử: https://lehoang-dev.github.io/vttc-dangtai/theo-doi/?tab=DangTai2

> Trang theo dõi cần **mã theo dõi** mới xem được dữ liệu. Mã không nằm trong code — xin mã từ người quản lý (xem mục *Tạo mã theo dõi* bên dưới).

## Tính năng

**Trang đăng ký** (`index.html`)
- Form 1 trang: biển số, tài xế, số điện thoại, container, nhà vận tải, loại đơn, số phiếu, số pallet.
- Kiểm tra dữ liệu ngay khi nhập (biển số, SĐT…), bảng xem trước phiếu và hộp xác nhận trước khi gửi.
- Ngày & giờ truck-in ghi tự động lúc bấm **Gửi**; tự chia **ca** (Ca 1: 06:00–13:59 · Ca 2: 14:00–21:59 · Ca 3: 22:00–05:59, Ca 3 sau 0h tính vào ngày hôm trước).
- Hỗ trợ giao diện sáng/tối.

**Trang theo dõi** (`theo-doi/`)
- Hiển thị 30 xe gần nhất, tự cập nhật mỗi 5 giây.
- Đọc thông báo bằng giọng tiếng Việt khi có xe mới (đọc biển số từng ký tự, kèm loại đơn).
- Cài được như ứng dụng (PWA) trên điện thoại/máy tính.

## Cấu trúc

```
├── index.html            # Trang đăng ký
├── truckin.css / .js     # Giao diện & logic form đăng ký
├── logo-vttc.png
├── theo-doi/             # Trang theo dõi (PWA: manifest, service worker, icon)
└── apps-script/Code.gs   # Backend Google Apps Script ghi/đọc Google Sheet
```

## Cài đặt backend (Google Apps Script)

1. Mở Google Sheet → **Tiện ích mở rộng → Apps Script**, dán nội dung `apps-script/Code.gs`.
2. Sheet cần tab `DangTai` (và `DangTai2` nếu muốn thử), dòng 1 là tên cột đúng như khai báo trong `COL` ở đầu `Code.gs`.
   Đổi tên cột trong Sheet thì chỉ sửa ở `COL`.
3. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách: Tôi*, *Ai có quyền truy cập: Bất kỳ ai*.
4. Dán URL `/exec` vào `CONFIG.ENDPOINT` trong `truckin.js` và `theo-doi/index.html`.
   Mở URL `/exec` trên trình duyệt thấy `OK - DangTai endpoint đang chạy` là chạy đúng.

### Tạo mã theo dõi

Trong trình soạn thảo Apps Script, chạy hàm `datMaTheoDoi` một lần → mã mới hiện trong **Nhật ký thực thi**. Nhập mã vào trang theo dõi. Tạo mã mới thì mã cũ hết hiệu lực.

### Hàm tiện ích

| Hàm | Tác dụng |
|---|---|
| `testShifts` | Thử chia ca + số thứ tự bằng giờ giả |
| `xoaTest` | Xoá các dòng thử (biển số bắt đầu bằng `TEST`) |
| `xoaDangTai2` | Xoá hết dữ liệu ở tab thử `DangTai2` |

## Cập nhật web

Web chạy trên GitHub Pages, push lên nhánh chính là tự cập nhật.
Sửa `truckin.css` / `truckin.js` thì đổi số `?v=` trong `index.html` để trình duyệt tải bản mới.
