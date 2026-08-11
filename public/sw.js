// Service Worker
//
// アプリを閉じていてもプッシュ通知を受け取るために必要。
// ここはブラウザが独立して動かすため、アプリのコードとは共有されない。
//
// キャッシュは意図的に行っていない。勤怠や予約は常に最新である
// 必要があり、古い内容が表示されると誤った打刻や判断につながるため。

self.addEventListener('install', (event) => {
  // 新しい Service Worker をすぐ有効にする
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // 開いているタブをすぐ制御下に置く
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'お知らせ', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || '民泊 勤怠管理';
  const options = {
    body: payload.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    // 同じ種類の通知が積み上がらないようにまとめる
    tag: payload.tag || 'default',
    renotify: true,
    data: { link: payload.link || '/' },
    // スマホで気づきやすいよう振動させる
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 既に開いているタブがあればそれを使う
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(link);
            return client.focus();
          }
        }
        // なければ新しく開く
        if (self.clients.openWindow) {
          return self.clients.openWindow(link);
        }
      })
  );
});
