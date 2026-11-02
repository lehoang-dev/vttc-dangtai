const SHEET_NAME = 'DangTai';
// Tab thử nghiệm: form mở bằng link ?thu=1 gửi kèm tab: 'DangTai2' → ghi vào đây, không đụng dữ liệu thật.
// Chỉ nhận đúng 2 tên này; tên khác hoặc không gửi → ghi vào SHEET_NAME.
const TEST_SHEET = 'DangTai2';
const KEY_COL = 'Biển số xe';

// Tên cột ở dòng 1 mà script ghi vào — đổi tên cột trong Sheet thì CHỈ sửa ở đây.
// Bước kiểm tra và bước ghi đều lấy tên từ đây. Thiếu cột nào thì báo lỗi TRƯỚC khi ghi, không để lại dòng ghi dở.
const COL = {
  ca: 'Ca',
  ngayCa: 'Ngày theo ca',
  bienSo: KEY_COL,
  container: 'Biển container',
  taiXe: 'Tên tài xế',
  pallet: 'Số pallet',
  sdt: 'Số điện thoại',
  gio: 'Giờ vào bãi',
  nhaVanTai: 'Nhà vận tải RPM & FG',
  loaiDon: 'Loại đơn hàng RPM & FG',
  // Số phiếu theo loại việc; loại đơn không dùng phiếu nào thì ô đó để trống
  phieuNhap: 'Số phiếu nhập hàng',
  phieuLay: 'Số phiếu lấy hàng',     // chuyển kho hay NPP xem ở cột Loại đơn hàng
  phieuTraVo: 'Số phiếu trả vỏ'
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // tránh 2 tài xế gửi cùng lúc bị ghi chồng dòng
  try {
    const d = JSON.parse(e.postData.contents);
    const sh = getSheet_(d.tab === TEST_SHEET ? TEST_SHEET : SHEET_NAME);
    const head = headers_(sh);
    const col = name => {
      const i = head.indexOf(name);
      if (i < 0) throw new Error('Không tìm thấy cột "' + name + '" ở dòng 1, tab "' + sh.getName() + '", file "'
        + sh.getParent().getName() + '". Dòng 1 đang có: ' + JSON.stringify(head.filter(String)));
      return i + 1;
    };
    Object.values(COL).forEach(col); // kiểm tra đủ cột trước khi ghi

    const shift = shiftOf_(d.ngay, d.gioTruckIn);
    const tz = sh.getParent().getSpreadsheetTimeZone();
    const r = nextRow_(sh, col(COL.bienSo));
    const put = (name, value, format) => {
      const cell = sh.getRange(r, col(name));
      if (format) cell.setNumberFormat(format);
      cell.setValue(value);
    };

    put(COL.ca, shift.ca);
    // Tạo ngày theo múi giờ của Sheet để không bị lệch 1 ngày
    put(COL.ngayCa, Utilities.parseDate(shift.ngay, tz, 'yyyy-MM-dd'), 'dd/mm/yyyy');
    put(COL.bienSo, d.bienSo);
    put(COL.container, String(d.maContainer || ''), '@'); // không bắt buộc, để trống nếu xe không chở container
    put(COL.taiXe, d.taiXe);
    put(COL.pallet, d.soPallet === undefined || d.soPallet === '' ? '' : Number(d.soPallet));
    put(COL.sdt, String(d.soDienThoai || ''), '@'); // định dạng chữ, giữ số 0 ở đầu
    put(COL.gio, d.gioTruckIn);
    put(COL.nhaVanTai, d.nhaVanTai);
    put(COL.loaiDon, d.loaiDon);
    // định dạng chữ, giữ nguyên số 0 ở đầu
    put(COL.phieuNhap, String(d.phieuNhap || ''), '@');
    put(COL.phieuLay, String(d.phieuLay || ''), '@');
    put(COL.phieuTraVo, String(d.phieuTraVo || ''), '@');

    return ContentService.createTextOutput('ok ' + shift.ca + ' ' + shift.ngay + ' dòng ' + r + ' tab ' + sh.getName());
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

function getSheet_(name) {
  name = name || SHEET_NAME;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Không tìm thấy tab "' + name + '"');
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

// Thử chia ca + số thứ tự bằng giờ giả. Chạy trong trình soạn thảo, không qua Web App.
// Ghi vào tab thử nghiệm DangTai2, không đụng dữ liệu thật. Tự xoá dòng thử cũ trước khi chạy.
// STT đọc lại từ chính cột STT2 sau khi công thức tính xong, nên kiểm tra được cả công thức.
function testShifts() {
  xoaTest();
  const sh = getSheet_(TEST_SHEET);
  // STT2 do công thức ở A1 tự tính; script không ghi vào cột này (ghi vào sẽ làm cả cột #REF!)
  const sttCol = headers_(sh).indexOf('STT2') + 1;
  if (!sttCol) throw new Error('Không thấy cột "STT2" ở dòng 1. Nếu A1 đang #REF!: chọn A2 đến cuối cột, bấm Delete.');
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
    const payload = { ngay: c[0], gioTruckIn: c[1], bienSo: 'TEST' + (i + 1), taiXe: 'Test', soDienThoai: '0912345678', maContainer: i % 2 ? '' : '0123456', nhaVanTai: 'ADV', loaiDon: 'Trả vỏ - lấy hàng NPP', phieuTraVo: '12345678', phieuLay: '87654321', soPallet: String(i * 3), tab: TEST_SHEET };
    const res = doPost({ postData: { contents: JSON.stringify(payload) } }).getContent();
    const m = res.match(/^ok (.+) dòng (\d+) tab /);
    if (!m) { fail++; Logger.log('SAI   ' + c[0] + ' ' + c[1] + ' → ' + res); return; }
    SpreadsheetApp.flush();
    const got = m[1] + ' STT ' + sh.getRange(Number(m[2]), sttCol).getDisplayValue();
    const want = c[2] + ' ' + c[3] + ' STT ' + c[4];
    if (got !== want) fail++;
    Logger.log((got === want ? 'ĐÚNG ' : 'SAI   ') + c[0] + ' ' + c[1] + ' → ' + got + (got === want ? '' : '  (mong đợi: ' + want + ')'));
  });
  Logger.log(fail ? fail + ' trường hợp SAI' : 'Tất cả đều đúng. Chạy xoaTest để xoá các dòng TEST.');
}

// Xoá các dòng thử (biển số bắt đầu bằng TEST) ở cả tab thật lẫn tab thử nghiệm.
function xoaTest() {
  [SHEET_NAME, TEST_SHEET].forEach(name => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sh) return;
    const c = headers_(sh).indexOf(KEY_COL);
    if (c < 0 || sh.getLastRow() < 2) return;
    const vals = sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = vals.length - 1; i >= 0; i--) if (/^TEST/.test(String(vals[i][0]))) sh.deleteRow(i + 2);
  });
}

// Xoá hết dữ liệu thử ở tab DangTai2 (giữ dòng tiêu đề và công thức STT2 ở A1).
function xoaDangTai2() {
  const sh = getSheet_(TEST_SHEET);
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
}
