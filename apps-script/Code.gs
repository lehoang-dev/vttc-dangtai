const SHEET_NAME = 'DangTai';   // tên tab trong Google Sheet
const KEY_COL = 'Biển số xe';   // cột dùng để tìm dòng trống tiếp theo
// Script tìm cột theo tên ở dòng 1 và chỉ ghi vào các cột dữ liệu.
// Cột STT2 (công thức) không bị ghi đè.

// Tên cột ở dòng 1 mà script ghi vào. Thiếu cột nào thì báo lỗi TRƯỚC khi ghi, không để lại dòng ghi dở.
const COLS = ['Ca', 'Ngày theo ca', 'Biển số xe', 'Tên tài xế', 'Số điện thoại', 'Giờ vào bãi',
              'Nhà vận tải RPM & FG', 'Loại đơn hàng RPM & FG', 'Số SO-ST'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // tránh 2 tài xế gửi cùng lúc bị ghi chồng dòng
  try {
    const d = JSON.parse(e.postData.contents);
    const sh = getSheet_();
    const head = headers_(sh);
    const col = name => {
      const i = head.indexOf(name);
      if (i < 0) throw new Error('Không tìm thấy cột "' + name + '" ở dòng 1');
      return i + 1;
    };
    COLS.forEach(col); // kiểm tra đủ cột trước khi ghi

    const shift = shiftOf_(d.ngay, d.gioTruckIn);
    const tz = sh.getParent().getSpreadsheetTimeZone();
    const r = nextRow_(sh, col(KEY_COL));
    const put = (name, value, format) => {
      const cell = sh.getRange(r, col(name));
      if (format) cell.setNumberFormat(format);
      cell.setValue(value);
    };

    put('Ca', shift.ca);
    // Tạo ngày theo múi giờ của Sheet để không bị lệch 1 ngày
    put('Ngày theo ca', Utilities.parseDate(shift.ngay, tz, 'yyyy-MM-dd'), 'dd/mm/yyyy');
    put('Biển số xe', d.bienSo);
    put('Tên tài xế', d.taiXe);
    put('Số điện thoại', String(d.soDienThoai || ''), '@'); // định dạng chữ, giữ số 0 ở đầu
    put('Giờ vào bãi', d.gioTruckIn);
    put('Nhà vận tải RPM & FG', d.nhaVanTai);
    put('Loại đơn hàng RPM & FG', d.loaiDon);
    put('Số SO-ST', String(d.soSO), '@'); // định dạng chữ, giữ nguyên số 0 ở đầu

    return ContentService.createTextOutput('ok');
  } catch (err) {
    console.error(err); // xem lỗi trong mục Thực thi (Executions)
    return ContentService.createTextOutput('error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

// Mở link /exec trên trình duyệt: thấy dòng này là web app đang chạy bản mới.
function doGet() {
  return ContentService.createTextOutput('OK - DangTai endpoint đang chạy');
}

function getSheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Không tìm thấy tab "' + SHEET_NAME + '"');
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
}

// Dòng trống đầu tiên sau dòng cuối có biển số (bỏ qua các dòng chỉ có công thức STT2)
function nextRow_(sh, keyCol) {
  const last = sh.getLastRow();
  if (last < 2) return 2;
  const vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
  let i = vals.length;
  while (i > 0 && String(vals[i - 1][0]).trim() === '') i--;
  return i + 2;
}

// Ca 1: 06:00–13:59 · Ca 2: 14:00–21:59 · Ca 3: 22:00–05:59
// Ca 3 sau 0h vẫn tính vào ngày hôm trước
function shiftOf_(ngay, gio) {
  const [y, m, dd] = ngay.split('-').map(Number);
  const h = Number(gio.split(':')[0]);
  const date = new Date(Date.UTC(y, m - 1, dd));
  let ca;
  if (h >= 6 && h < 14) ca = 'Ca 1';
  else if (h >= 14 && h < 22) ca = 'Ca 2';
  else {
    ca = 'Ca 3';
    if (h < 6) date.setUTCDate(date.getUTCDate() - 1);
  }
  return { ca: ca, ngay: Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd') };
}

// Thử chuyển ca bằng giờ giả. Chạy trong trình soạn thảo, không qua Web App.
function testShifts() {
  const cases = [            // ngày gửi, giờ  → STT2 mong đợi
    ['2026-10-05', '06:10'], // Ca 1 05/10 → 1
    ['2026-10-05', '13:50'], // Ca 1 05/10 → 2
    ['2026-10-05', '14:05'], // Ca 2 05/10 → 1  (đổi ca trong ngày)
    ['2026-10-05', '21:59'], // Ca 2 05/10 → 2
    ['2026-10-05', '22:00'], // Ca 3 05/10 → 1
    ['2026-10-06', '00:30'], // Ca 3 05/10 → 2  (qua 0h vẫn thuộc ca 3 hôm trước)
    ['2026-10-06', '05:59'], // Ca 3 05/10 → 3
    ['2026-10-06', '06:00'], // Ca 1 06/10 → 1  (sang ngày mới)
    ['2026-10-07', '06:30']  // Ca 1 07/10 → 1  (cùng ca nhưng khác ngày)
  ];
  cases.forEach((c, i) => {
    const payload = { ngay: c[0], gioTruckIn: c[1], bienSo: 'TEST' + (i + 1), taiXe: 'Test', soDienThoai: '0912345678', nhaVanTai: 'ADV', loaiDon: '2.3T', soSO: '12345678' };
    Logger.log(c.join(' ') + ' → ' + doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
  });
}

// Xoá các dòng thử (biển số bắt đầu bằng TEST). Không xoá dòng 2 để giữ công thức STT2.
function xoaTest() {
  const sh = getSheet_();
  const c = headers_(sh).indexOf(KEY_COL);
  if (c < 0 || sh.getLastRow() < 3) return;
  const vals = sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 1; i--) if (/^TEST/.test(String(vals[i][0]))) sh.deleteRow(i + 2);
}
