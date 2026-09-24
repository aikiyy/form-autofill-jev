const ERROR_BADGE_COLOR = "#dc2626";

/**
 * アクティブタブに content script を注入する。
 * chrome:// や Chrome Web Store など注入できないページでは、バッジに「×」を表示する。
 * @param tabId 注入先タブのID
 * @param file ビルド後の content script のパス（CRXJS の `?script` import で得る）
 * @returns 注入に成功したら true
 */
export async function injectContentScript(tabId: number, file: string): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    await chrome.action.setBadgeText({ tabId, text: "" });
    return true;
  } catch (error) {
    console.warn("[form-autofill] content script を注入できませんでした", error);
    await chrome.action.setBadgeText({ tabId, text: "×" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: ERROR_BADGE_COLOR });
    return false;
  }
}
