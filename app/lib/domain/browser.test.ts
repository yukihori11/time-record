import { describe, expect, it } from 'vitest';
import {
  detectBrowser,
  isPushSupported,
  notificationStep,
} from './browser';

// 実際のブラウザが送る User-Agent
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

describe('detectBrowser', () => {
  it('iPhone の Safari を判定する', () => {
    const r = detectBrowser(UA.iphoneSafari);
    expect(r.isIos).toBe(true);
    expect(r.isIosNonSafari).toBe(false);
  });

  it('iPhone の Chrome を Safari 以外として判定する', () => {
    const r = detectBrowser(UA.iphoneChrome);
    expect(r.isIos).toBe(true);
    expect(r.isIosNonSafari).toBe(true);
  });

  it('iPhone の Firefox も Safari 以外として判定する', () => {
    expect(detectBrowser(UA.iphoneFirefox).isIosNonSafari).toBe(true);
  });

  it('Android の Chrome は iOS ではない', () => {
    const r = detectBrowser(UA.androidChrome);
    expect(r.isIos).toBe(false);
    expect(r.isIosNonSafari).toBe(false);
  });

  it('PC は iOS ではない', () => {
    expect(detectBrowser(UA.desktopChrome).isIos).toBe(false);
    expect(detectBrowser(UA.desktopSafari).isIos).toBe(false);
  });
});

describe('notificationStep', () => {
  it('Android Chrome はそのまま許可を求められる', () => {
    expect(
      notificationStep({ userAgent: UA.androidChrome, isStandalone: false })
    ).toBe('ready');
  });

  it('PC Chrome もそのまま許可を求められる', () => {
    expect(
      notificationStep({ userAgent: UA.desktopChrome, isStandalone: false })
    ).toBe('ready');
  });

  it('iPhone Safari はホーム画面への追加が先に必要', () => {
    expect(
      notificationStep({ userAgent: UA.iphoneSafari, isStandalone: false })
    ).toBe('need-install');
  });

  it('iPhone Safari でも追加済みなら許可を求められる', () => {
    expect(
      notificationStep({ userAgent: UA.iphoneSafari, isStandalone: true })
    ).toBe('ready');
  });

  it('iPhone Chrome は Safari で開き直す必要がある', () => {
    expect(
      notificationStep({ userAgent: UA.iphoneChrome, isStandalone: false })
    ).toBe('need-safari');
  });

  it('iPhone Chrome はホーム画面追加の案内を出さない（そもそもできない）', () => {
    expect(
      notificationStep({ userAgent: UA.iphoneChrome, isStandalone: false })
    ).not.toBe('need-install');
  });
});

describe('isPushSupported', () => {
  // iOS Safari はホーム画面に追加するまで PushManager を持たない
  const iosSafariBeforeInstall = {
    userAgent: UA.iphoneSafari,
    hasServiceWorker: true,
    hasPushManager: false,
    hasNotification: false,
  };

  it('iPhone Safari は追加前でも対応扱いにする', () => {
    // ここを false にすると「非対応」と誤表示される
    expect(isPushSupported(iosSafariBeforeInstall)).toBe(true);
  });

  it('iPhone Safari で追加後はもちろん対応', () => {
    expect(
      isPushSupported({
        userAgent: UA.iphoneSafari,
        hasServiceWorker: true,
        hasPushManager: true,
        hasNotification: true,
      })
    ).toBe(true);
  });

  it('iPhone Chrome は対応しない', () => {
    expect(
      isPushSupported({
        userAgent: UA.iphoneChrome,
        hasServiceWorker: true,
        hasPushManager: true,
        hasNotification: true,
      })
    ).toBe(false);
  });

  it('Android Chrome は API が揃っていれば対応', () => {
    expect(
      isPushSupported({
        userAgent: UA.androidChrome,
        hasServiceWorker: true,
        hasPushManager: true,
        hasNotification: true,
      })
    ).toBe(true);
  });

  it('PC で API が無ければ非対応', () => {
    expect(
      isPushSupported({
        userAgent: UA.desktopChrome,
        hasServiceWorker: false,
        hasPushManager: false,
        hasNotification: false,
      })
    ).toBe(false);
  });

  it('Service Worker が無い iOS は非対応', () => {
    expect(
      isPushSupported({
        userAgent: UA.iphoneSafari,
        hasServiceWorker: false,
        hasPushManager: false,
        hasNotification: false,
      })
    ).toBe(false);
  });
});
