const SHEET_NAME = 'DangTai';  
const KEY_COL = 'Biển số xe';   

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
      if (i < 0) throw new Error('Không tìm thấy cột "' + name + '" ở dòng 1, tab "' + SHEET_NAME + '", file "'
        + sh.getParent().getName() + '". Dòng 1 đang có: ' + JSON.stringify(head.filter(String)));
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

    return ContentService.createTextOutput('ok ' + shift.ca + ' ' + shift.ngay + ' dòng ' + r);
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

// Dòng trống đầu tiên sau dòng cuối có biển số (bỏ qua các dòng chỉ có kết quả rỗng của công thức STT2)
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

// Chạy 1 lần trong trình soạn thảo: đặt công thức STT2 ở ô tiêu đề.
// STT = số dòng từ đầu bảng tới dòng này có cùng Ca + cùng Ngày theo ca → mỗi ca (8 tiếng) bắt đầu lại từ 1.
// Xoá giá trị đang nằm trong cột (chặn công thức mảng → #REF!). setFormula dùng cú pháp tiếng Anh (dấu phẩy)
// nên không phụ thuộc cài đặt ngôn ngữ của Sheet.
function caiCongThucSTT() {
  const sh = getSheet_();
  const head = headers_(sh);
  let c = head.indexOf(STT_COL);
  if (c < 0) c = head.indexOf('#REF!'); // tiêu đề đang lỗi vì công thức bị chặn
  if (c < 0) throw new Error('Không thấy cột "' + STT_COL + '" (hoặc ô #REF!) ở dòng 1');
  const L = name => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error('Không tìm thấy cột "' + name + '" ở dòng 1');
    return colLetter_(i + 1);
  };
  const ca = L('Ca'), ngay = L('Ngày theo ca'), bs = L(KEY_COL);
  sh.getRange(2, c + 1, sh.getMaxRows() - 1, 1).clearContent();
  sh.getRange(1, c + 1).setFormula(
    '={"' + STT_COL + '"; ARRAYFORMULA(IF(' + bs + '2:' + bs + '="", "", COUNTIFS('
    + ca + '2:' + ca + ', ' + ca + '2:' + ca + ', ' + ngay + '2:' + ngay + ', ' + ngay + '2:' + ngay + ', '
    + 'ROW(' + bs + '2:' + bs + '), "<="&ROW(' + bs + '2:' + bs + '))))}');
  SpreadsheetApp.flush();
  Logger.log('Đã đặt công thức ở ô ' + colLetter_(c + 1) + '1: ' + sh.getRange(1, c + 1).getFormula());
}

function colLetter_(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

// Thử chia ca + số thứ tự bằng giờ giả. Chạy trong trình soạn thảo, không qua Web App.
// Dùng năm 2000 để không lẫn với xe thật trong ca hiện tại. Tự xoá dòng thử cũ trước khi chạy.
// STT đọc lại từ chính cột STT2 sau khi công thức tính xong, nên kiểm tra được cả công thức.
function testShifts() {
  xoaTest();
  const sh = getSheet_();
  const sttCol = headers_(sh).indexOf(STT_COL) + 1;
  if (!sttCol) throw new Error('Không thấy cột "' + STT_COL + '" ở dòng 1. Chạy caiCongThucSTT trước.');
  const cases = [  // ngày gửi, giờ vào bãi → ca, ngày theo ca, STT mong đợi
    ['2000-01-05', '06:10', 'Ca 1', '2000-01-05', 1],
    ['2000-01-05', '13:59', 'Ca 1', '2000-01-05', 2],
    ['2000-01-05', '14:00', 'Ca 2', '2000-01-05', 1], // đủ 8 tiếng → đổi ca, STT về 1
    ['2000-01-05', '21:59', 'Ca 2', '2000-01-05', 2],
    ['2000-01-05', '22:00', 'Ca 3', '2000-01-05', 1],
    ['2000-01-06', '00:30', 'Ca 3', '2000-01-05', 2], // qua 0h vẫn thuộc ca 3 hôm trước
    ['2000-01-06', '05:00', 'Ca 3', '2000-01-05', 3], // 5h sáng ngày 6 → ca 3 ngày 5
    ['2000-01-06', '06:00', 'Ca 1', '2000-01-06', 1], // sang ngày mới
    ['2000-01-07', '06:30', 'Ca 1', '2000-01-07', 1]  // cùng ca nhưng khác ngày
  ];
  let fail = 0;
  cases.forEach((c, i) => {
    const payload = { ngay: c[0], gioTruckIn: c[1], bienSo: 'TEST' + (i + 1), taiXe: 'Test', soDienThoai: '0912345678', nhaVanTai: 'ADV', loaiDon: '2.3T', soSO: '12345678' };
    const res = doPost({ postData: { contents: JSON.stringify(payload) } }).getContent();
    const m = res.match(/^ok (.+) dòng (\d+)$/);
    if (!m) { fail++; Logger.log('SAI   ' + c[0] + ' ' + c[1] + ' → ' + res); return; }
    SpreadsheetApp.flush();
    const got = m[1] + ' STT ' + sh.getRange(Number(m[2]), sttCol).getDisplayValue();
    const want = c[2] + ' ' + c[3] + ' STT ' + c[4];
    if (got !== want) fail++;
    Logger.log((got === want ? 'ĐÚNG ' : 'SAI   ') + c[0] + ' ' + c[1] + ' → ' + got + (got === want ? '' : '  (mong đợi: ' + want + ')'));
  });
  Logger.log(fail ? fail + ' trường hợp SAI' : 'Tất cả đều đúng. Chạy xoaTest để xoá các dòng TEST.');
}

// Xoá các dòng thử (biển số bắt đầu bằng TEST).
function xoaTest() {
  const sh = getSheet_();
  const c = headers_(sh).indexOf(KEY_COL);
  if (c < 0 || sh.getLastRow() < 2) return;
  const vals = sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (/^TEST/.test(String(vals[i][0]))) sh.deleteRow(i + 2);
}
