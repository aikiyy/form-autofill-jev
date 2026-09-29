import type { ClassifyRequest, ClassifyResponse } from "../core/messages.ts";
import { applyFills } from "../dom/fill.ts";
import { scanFields } from "../dom/scan.ts";
import { showToast } from "../dom/toast.ts";

/** アイコンクリックのたびに注入され、読み取り → 判定依頼 → 入力 → 結果表示 を1回行う */
async function run(): Promise<void> {
  const fields = scanFields(document);
  if (fields.length === 0) {
    showToast(document, { filled: 0, review: 0 });
    return;
  }
  try {
    const request: ClassifyRequest = { type: "classify", fields, pageTitle: document.title };
    const response = (await chrome.runtime.sendMessage(request)) as ClassifyResponse;
    const summary = applyFills(document, response.instructions);
    showToast(document, summary, response.notice);
  } catch (error) {
    console.error("[form-autofill] 自動入力に失敗しました", error);
    showToast(document, { filled: 0, review: 0 }, "拡張との通信に失敗しました。ページを再読み込みしてお試しください");
  }
}

void run();
