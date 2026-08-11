/**
 * ブラウザ判定。
 *
 * 通知の可否がブラウザによって大きく違うため、
 * 判定を1か所にまとめてテストできるようにする。
 *
 * iOS のブラウザは中身が全て Safari だが、
 * 「ホーム画面に追加」ができるのは Safari のみ。
 * Chrome や Firefox では通知を有効にできない。
 */

export interface BrowserCapability {
  isIos: boolean;
  /** iOS だが Safari ではない（Chrome など）。通知を設定できない */
  isIosNonSafari: boolean;
}

const IOS_RE = /iPad|iPhone|iPod/;
// iOS 版の各ブラウザが名乗る識別子
const IOS_OTHER_BROWSER_RE = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/;

export function detectBrowser(userAgent: string): BrowserCapability {
  const isIos = IOS_RE.test(userAgent);
  return {
    isIos,
    isIosNonSafari: isIos && IOS_OTHER_BROWSER_RE.test(userAgent),
  };
}

/**
 * 通知を有効にするために何が必要かを返す。
 *
 * 'ready'        そのまま許可を求められる
 * 'need-install' ホーム画面への追加が先に必要（iOS Safari）
 * 'need-safari'  Safari で開き直す必要がある（iOS の他ブラウザ）
 */
export type NotificationStep = 'ready' | 'need-install' | 'need-safari';

export function notificationStep(input: {
  userAgent: string;
  isStandalone: boolean;
}): NotificationStep {
  const { isIos, isIosNonSafari } = detectBrowser(input.userAgent);

  if (isIosNonSafari) return 'need-safari';
  if (isIos && !input.isStandalone) return 'need-install';
  return 'ready';
}
