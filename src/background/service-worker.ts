import { TypeSafeClient } from "@typesafe-ai/sdk";
import contentScript from "../content/content-script.ts?script&iife";
import { isClassifyRequest, type ClassifyResponse } from "../core/messages.ts";
import { getApiKey, getProfile } from "../storage/repository.ts";
import { classifyPage } from "./classify.ts";
import { injectContentScript } from "./inject.ts";

/** クリックから入力完了まで約3秒以内に収めるため、タイムアウトを短くしリトライしない */
const JEV_TIMEOUT_MS = 2500;

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void injectContentScript(tab.id, contentScript);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (res: ClassifyResponse) => void) => {
  if (!isClassifyRequest(message)) return false;
  classifyPage(message.fields, message.pageTitle, {
    getProfile,
    getApiKey,
    // APIキーはユーザー本人のもので、この拡張の中だけで使う（第三者のページには渡らない）
    createClient: (apiKey) =>
      new TypeSafeClient({ apiKey, dangerouslyAllowBrowser: true, timeout: JEV_TIMEOUT_MS, retry: { maxRetries: 0 } }),
  })
    .then(sendResponse)
    .catch((error: unknown) => {
      console.error("[form-autofill] 判定に失敗しました", error);
      sendResponse({ instructions: [], notice: "設定を読み込めなかったため入力できませんでした" });
    });
  return true; // 非同期に sendResponse する
});
