(function(){
  'use strict';
  // ===== Cấu hình =====
  // Dán URL Web App (Google Apps Script) vào ENDPOINT để nhận dữ liệu vào Google Sheet.
  // Để trống = chế độ xem thử, form không gửi dữ liệu đi đâu.
  const CONFIG = { ENDPOINT: 'https://script.google.com/macros/s/AKfycbz16gNy0npNtsdOjg3RgLHMS-qpgM_HMV3k8ochx2LEYZReuOWK2grpu4b9gIucAXYf/exec' };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const pad = n => String(n).padStart(2, '0');
  const WD = ['Chủ nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const fmtDate = s => s ? s.split('-').reverse().join('/') : '';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== Theme: đồng bộ chế độ sáng/tối cho Bootstrap =====
  const root = document.documentElement;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function syncTheme(){ const t = root.getAttribute('data-theme'); root.setAttribute('data-bs-theme', (t ? t === 'dark' : mq.matches) ? 'dark' : 'light'); }
  syncTheme();
  if (mq.addEventListener) mq.addEventListener('change', syncTheme);
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // ===== Đồng hồ =====
  function tick(){ const d = new Date(); $('#clockTime').textContent = hm(d); $('#clockDate').textContent = WD[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  tick(); setInterval(tick, 15000);

  // ===== Chuẩn hoá dữ liệu =====
  const PLATE_RE = /^\d{2}[A-Z]{1,2}\d{4,6}$/;
  const normPlate = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  function fmtPlate(p){
    const m = p.match(/^(\d{2}[A-Z]{1,2})(\d+)$/); if (!m) return p;
    let pre = m[1], num = m[2];
    if (num.length === 6){ pre += num[0]; num = num.slice(1); }
    return pre + '-' + (num.length === 5 ? num.slice(0, 3) + '.' + num.slice(3) : num);
  }
  function normName(s){
    return s.trim().replace(/\s+/g, ' ').split(' ').map(w => { const l = w.toLocaleLowerCase('vi'); return l.charAt(0).toLocaleUpperCase('vi') + l.slice(1); }).join(' ');
  }

  // ===== Danh sách trường (theo thứ tự cột file mẫu) =====
  // auto: không có ô nhập, tự ghi theo đồng hồ thực lúc tài xế bấm Gửi (ngày yyyy-mm-dd, giờ 24h HH:MM)
  const FIELDS = [
    { k: 'ngay', label: 'Ngày', auto: true },
    { k: 'bienSo', label: 'Biển số xe', empty: 'Vui lòng nhập biển số xe.' },
    { k: 'taiXe', label: 'Tên tài xế', empty: 'Vui lòng nhập tên tài xế.' },
    { k: 'soDienThoai', label: 'Số điện thoại', empty: 'Vui lòng nhập số điện thoại tài xế.' },
    { k: 'gioTruckIn', label: 'Giờ truck-in', auto: true },
    { k: 'nhaVanTai', label: 'Nhà vận tải', radio: true, empty: 'Vui lòng chọn nhà vận tải.' },
    { k: 'loaiDon', label: 'Loại đơn hàng', radio: true, empty: 'Vui lòng chọn loại đơn hàng.' },
    { k: 'soSO', label: 'Số SO-ST', empty: 'Vui lòng nhập số SO-ST.' }
  ];
  const F = Object.fromEntries(FIELDS.map(f => [f.k, f]));
  const INPUTS = FIELDS.filter(f => !f.auto);
  const TOTAL = INPUTS.length;
  const form = $('#regForm');
  const shown = new Set();
  let tried = false;

  function val(k){
    if (F[k].radio){ const c = form.querySelector('input[name="' + k + '"]:checked'); return c ? c.value : ''; }
    let v = $('#' + k).value.trim();
    if (k === 'bienSo') v = normPlate(v);
    if (k === 'taiXe') v = normName(v);
    return v;
  }
  const values = () => Object.fromEntries(INPUTS.map(f => [f.k, val(f.k)]));

  function check(k, v, all){
    if (!v) return F[k].empty;
    if (k === 'bienSo' && !PLATE_RE.test(v)) return 'Biển số chưa đúng dạng. Ví dụ: 50H12345 hoặc 51D-119.32';
    if (k === 'taiXe'){ if (/\d/.test(v)) return 'Tên tài xế không được chứa số.'; if (v.replace(/\s/g, '').length < 2) return 'Tên tài xế quá ngắn.'; }
    if (k === 'soDienThoai'){ if (v[0] !== '0') return 'Số điện thoại phải bắt đầu bằng số 0.'; if (!/^0\d{9}$/.test(v)) return 'Số điện thoại gồm đúng 10 chữ số (đang có ' + v.length + ').'; }
    if (k === 'soSO' && !/^\d{8,10}$/.test(v)) return 'Số SO-ST gồm 8 đến 10 chữ số.';
    return '';
  }

  function display(k, v){
    if (!v) return '';
    if (k === 'ngay') return fmtDate(v);
    if (k === 'bienSo') return fmtPlate(v);
    if (k === 'soDienThoai') return v.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
    return v;
  }

  function paint(k, msg){
    const wrap = form.querySelector('[data-field="' + k + '"]');
    if (F[k].radio) wrap.querySelector('.choice-group').classList.toggle('is-invalid-group', !!msg);
    else $('#' + k).classList.toggle('is-invalid', !!msg);
    wrap.querySelector('[data-err]').textContent = msg || '';
  }

  function buildRows(dl, all, skipPlate){
    dl.innerHTML = '';
    FIELDS.forEach(f => {
      if (skipPlate && f.k === 'bienSo') return;
      const dt = document.createElement('dt'); dt.textContent = f.label;
      const dd = document.createElement('dd'); const v = display(f.k, all[f.k]);
      dd.textContent = v || (f.auto ? 'Tự ghi khi bấm Gửi' : 'Chưa nhập'); if (!v) dd.className = 'empty';
      if (v && (/^gio/.test(f.k) || f.k === 'soSO' || f.k === 'soDienThoai')) dd.classList.add('mono');
      dl.append(dt, dd);
    });
  }

  function setHint(text, warn){
    const d = $('#deskHint'); d.textContent = text; d.classList.toggle('warn', !!warn);
    $('#mProg').hidden = !!warn;
    const w = $('#mWarn'); w.hidden = !warn; w.textContent = warn ? text : '';
  }

  function refresh(){
    const all = values(); let ok = 0; const okMap = {};
    INPUTS.forEach(f => { const m = check(f.k, all[f.k], all); okMap[f.k] = !m; if (!m) ok++; if (shown.has(f.k)) paint(f.k, m); });
    $$('[data-prog-bar]').forEach(b => { b.style.width = (ok / TOTAL * 100) + '%'; b.classList.toggle('complete', ok === TOTAL); });
    $$('.form-section').forEach(s => s.classList.toggle('done', s.dataset.fields.split(',').every(k => okMap[k])));
    const bad = TOTAL - ok;
    if (tried && bad) setHint('Còn ' + bad + ' thông tin cần bổ sung hoặc sửa', true);
    else setHint(ok === TOTAL ? 'Đã đủ thông tin, bấm gửi' : 'Điền đủ ' + TOTAL + ' thông tin để gửi', false);
    $$('[data-prog-text]').forEach(t => t.textContent = ok + '/' + TOTAL);
    $('#sumPlate').textContent = all.bienSo ? fmtPlate(all.bienSo) : '— — —';
    buildRows($('#sumRows'), all, true);
    return { all, ok, okMap };
  }

  // ===== Sự kiện nhập liệu =====
  form.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'bienSo'){ const p = el.selectionStart; el.value = el.value.toUpperCase().replace(/[^A-Z0-9.\- ]/g, ''); try { el.setSelectionRange(p, p); } catch (_) {} }
    if (el.id === 'soSO') el.value = el.value.replace(/\D/g, '');
    if (el.id === 'soDienThoai') el.value = el.value.replace(/\D/g, '').slice(0, 10); // dán "0912 345 678" vẫn ra đủ 10 số
    if (el.type === 'radio') shown.add(el.name);
    refresh();
  });
  form.addEventListener('focusout', e => {
    const el = e.target; if (!el.id || !F[el.id]) return;
    if (el.id === 'taiXe' && el.value.trim()) el.value = normName(el.value);
    if (el.id === 'bienSo'){ const n = normPlate(el.value); if (PLATE_RE.test(n)) el.value = fmtPlate(n); }
    if (el.value.trim()) shown.add(el.id);
    refresh();
  });

  // ===== Gửi =====
  let pending = null;
  const modalEl = $('#confirmModal');
  const modal = () => (window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null);

  form.addEventListener('submit', e => {
    e.preventDefault();
    tried = true; INPUTS.forEach(f => shown.add(f.k));
    const r = refresh();
    if (r.ok < TOTAL){
      const first = INPUTS.find(f => !r.okMap[f.k]);
      const wrap = form.querySelector('[data-field="' + first.k + '"]');
      wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      const target = first.radio ? wrap.querySelector('input') : $('#' + first.k);
      setTimeout(() => target.focus({ preventScroll: true }), reduceMotion ? 0 : 350);
      return;
    }
    const now = new Date(); // chốt ngày + giờ truck-in lúc bấm Gửi
    pending = Object.assign(r.all, { ngay: ymd(now), gioTruckIn: hm(now) });
    $('#cfPlate').textContent = fmtPlate(pending.bienSo);
    buildRows($('#cfRows'), pending, true);
    $('#sendError').textContent = '';
    const m = modal(); if (m) m.show(); else doSend();
  });

  function makeRef(all){
    const d = new Date();
    return 'DT' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '-' + all.bienSo.slice(-3);
  }

  async function send(payload){
    if (!CONFIG.ENDPOINT){ await new Promise(r => setTimeout(r, 700)); return { demo: true }; }
    await fetch(CONFIG.ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    return { demo: false };
  }

  async function doSend(){
    if (!pending) return;
    const btn = $('#confirmSend'); const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Đang gửi…';
    try {
      const payload = Object.assign({}, pending, { maDangTai: makeRef(pending), thoiGianGui: new Date().toISOString() });
      const res = await send(payload);
      const m = modal(); if (m) m.hide();
      showSuccess(payload, res.demo);
    } catch (_) {
      $('#sendError').textContent = 'Gửi chưa được. Kiểm tra kết nối mạng rồi bấm Xác nhận gửi lần nữa.';
    } finally { btn.disabled = false; btn.innerHTML = label; }
  }
  $('#confirmSend').addEventListener('click', doSend);

  function showSuccess(p, demo){
    $('#refCode').textContent = p.maDangTai;
    $('#okTime').textContent = p.gioTruckIn;
    $('#okPlate').textContent = fmtPlate(p.bienSo);
    buildRows($('#okRows'), p, true);
    $('#demoFlag').hidden = !demo;
    $('#mainView').hidden = true; $('#mobileBar').hidden = true; $('#successView').hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  $('#newBtn').addEventListener('click', () => {
    form.reset(); shown.clear(); tried = false; pending = null;
    refresh();
    $('#successView').hidden = true; $('#mainView').hidden = false; $('#mobileBar').hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  refresh();
})();
