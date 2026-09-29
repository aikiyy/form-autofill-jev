import type { FillSummary } from "./fill.ts";

export const TOAST_HOST_ID = "afj-toast-host";
export const TOAST_DURATION_MS = 6000;

/** ページの CSS の影響を受けないよう Shadow DOM 内だけで完結させるスタイル */
const STYLE = `
  :host { all: initial; }
  .toast {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    max-width: 320px; padding: 12px 16px; border-radius: 8px;
    background: #0f172a; color: #f8fafc; box-shadow: 0 4px 16px rgba(0,0,0,.25);
    font: 13px/1.6 system-ui, -apple-system, "Hiragino Sans", sans-serif;
  }
  .title { font-weight: 600; }
  .review { color: #fde047; }
  .notice { margin-top: 4px; color: #cbd5e1; font-size: 12px; }
`;

let removeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 自動入力の結果をページ右下に表示する（一定時間で消える）。
 * @param root 表示先のドキュメント
 * @param summary 入力した欄・要確認の欄の数
 * @param notice 補足（APIキー未設定・Jev の通信失敗などのフォールバック理由）
 */
export function showToast(root: Document, summary: FillSummary, notice?: string): void {
  root.getElementById(TOAST_HOST_ID)?.remove();
  clearTimeout(removeTimer);

  const host = root.createElement("div");
  host.id = TOAST_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = root.createElement("style");
  style.textContent = STYLE;
  const box = root.createElement("div");
  box.className = "toast";
  box.setAttribute("role", "status");

  const title = root.createElement("div");
  title.className = "title";
  if (summary.filled === 0 && summary.review === 0) {
    title.textContent = "入力できる欄が見つかりませんでした";
  } else {
    title.textContent = `${summary.filled}欄を入力しました`;
  }
  box.append(title);

  if (summary.review > 0) {
    const review = root.createElement("div");
    review.className = "review";
    review.textContent = `${summary.review}欄は要確認（黄色）です`;
    box.append(review);
  }
  if (notice) {
    const note = root.createElement("div");
    note.className = "notice";
    note.textContent = notice;
    box.append(note);
  }

  shadow.append(style, box);
  root.body.append(host);
  removeTimer = setTimeout(() => host.remove(), TOAST_DURATION_MS);
}
