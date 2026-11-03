// Service worker tối thiểu: để Chrome cho "Cài đặt" trang thành ứng dụng (thông báo mang tên "Đăng tài VTTC")
// và mở Google Sheet khi bấm thông báo. Không lưu đệm gì: mọi yêu cầu đi thẳng ra mạng.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url;
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    if (list.length) return list[0].focus();
    if (url) return self.clients.openWindow(url);
  }));
});
