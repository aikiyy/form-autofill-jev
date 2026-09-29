import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast, TOAST_DURATION_MS, TOAST_HOST_ID } from "./toast.ts";

function toastText(): string {
  const host = document.getElementById(TOAST_HOST_ID);
  return host?.shadowRoot?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("showToast", () => {
  it("入力した欄数と要確認の欄数を Shadow DOM 内に表示する", () => {
    showToast(document, { filled: 12, review: 2 });
    expect(toastText()).toContain("12欄を入力");
    expect(toastText()).toContain("2欄は要確認（黄色）");
  });

  it("要確認が0なら件数だけ表示する", () => {
    showToast(document, { filled: 5, review: 0 });
    expect(toastText()).toContain("5欄を入力");
    expect(toastText()).not.toContain("要確認");
  });

  it("入力できる欄がなければその旨を表示する", () => {
    showToast(document, { filled: 0, review: 0 });
    expect(toastText()).toContain("入力できる欄が見つかりませんでした");
  });

  it("フォールバックの理由などの補足を表示する", () => {
    showToast(document, { filled: 3, review: 0 }, "APIキー未設定のためルール判定のみ");
    expect(toastText()).toContain("APIキー未設定のためルール判定のみ");
  });

  it("続けて表示したら前のトーストを置き換える", () => {
    showToast(document, { filled: 1, review: 0 });
    showToast(document, { filled: 2, review: 0 });
    expect(document.querySelectorAll(`#${TOAST_HOST_ID}`)).toHaveLength(1);
    expect(toastText()).toContain("2欄を入力");
  });

  it("一定時間で消える", () => {
    showToast(document, { filled: 1, review: 0 });
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(document.getElementById(TOAST_HOST_ID)).toBeNull();
  });
});
