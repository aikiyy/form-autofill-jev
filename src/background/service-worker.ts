import { TypeSafeClient } from "@typesafe-ai/sdk";
import contentScript from "../content/content-script.ts?script&iife";
import {
  isClassifyRequest,
  isFillAfterUnlockMessage,
  isVaultStateChangedMessage,
  type ClassifyResponse,
} from "../core/messages.ts";
import { getApiKey, getProfile, getVaultState } from "../storage/repository.ts";
import { syncActionPopup } from "./action-popup.ts";
import { classifyPage } from "./classify.ts";
import { injectContentScript } from "./inject.ts";

/** クリックから入力完了まで約3秒以内に収めるため、タイムアウトを短くしリトライしない */
const JEV_TIMEOUT_MS = 2500;

function refreshActionPopup(): void {
  syncActionPopup(getVaultState).catch((error: unknown) => {
    console.error("[form-autofill] アイコンの動作を切り替えられませんでした", error);
  });
}

// ブラウザ起動時（storage.session が空＝ロック中）・インストール時・service worker の起動時に合わせる
chrome.runtime.onStartup.addListener(refreshActionPopup);
chrome.runtime.onInstalled.addListener(refreshActionPopup);
refreshActionPopup();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void injectContentScript(tab.id, contentScript);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (res: ClassifyResponse) => void) => {
  if (isVaultStateChangedMessage(message)) {
    refreshActionPopup();
    return false;
  }
  if (isFillAfterUnlockMessage(message)) {
    refreshActionPopup();
    void injectContentScript(message.tabId, contentScript);
    return false;
  }
  if (!isClassifyRequest(message)) return false;
  classifyPage(message.fields, message.pageTitle, {
    getProfile,
    getApiKey,
    // APIキーはユーザー本人のもので、この拡張の中だけで使う（第三者のページには渡らない）
    createClient: (apiKey) =>
      new TypeSafeClient({ apiKey, dangerouslyAllowBrowser: true, timeout: JEV_TIMEOUT_MS, retry: { maxRetries: 0 } }),
  })
    .then((response) => {
      sendResponse(response);
      refreshActionPopup(); // ロック中だった場合にポップアップを有効にする
    })
    .catch((error: unknown) => {
      console.error("[form-autofill] 判定に失敗しました", error);
      sendResponse({ instructions: [], notice: "設定を読み込めなかったため入力できませんでした" });
    });
  return true; // 非同期に sendResponse する
});
