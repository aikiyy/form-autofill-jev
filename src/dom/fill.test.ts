import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyFills, HIGHLIGHT } from "./fill.ts";
import { FIELD_ID_ATTR } from "./scan.ts";

function setup(html: string): void {
  document.body.innerHTML = html;
}

function el<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(selector);
  return found;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("applyFills: テキスト欄", () => {
  it("値を入れ、input・change イベントを発火し、緑でハイライトする", () => {
    setup(`<input id="a" ${FIELD_ID_ATTR}="afj-0">`);
    const input = el<HTMLInputElement>("#a");
    const events: string[] = [];
    for (const type of ["input", "change"]) input.addEventListener(type, (e) => events.push(`${e.type}:${e.bubbles}`));

    const summary = applyFills(document, [{ fieldId: "afj-0", status: "fill", value: "山田" }]);

    expect(input.value).toBe("山田");
    expect(events).toEqual(["input:true", "change:true"]);
    expect(input.style.outline).toBe(HIGHLIGHT.filled);
    expect(summary).toEqual({ filled: 1, review: 0 });
  });

  it("textarea にも入力できる", () => {
    setup(`<textarea id="t" ${FIELD_ID_ATTR}="afj-0"></textarea>`);
    applyFills(document, [{ fieldId: "afj-0", status: "fill", value: "住所" }]);
    expect(el<HTMLTextAreaElement>("#t").value).toBe("住所");
  });

  it("React のように要素側で value を上書き監視していても、ネイティブの setter で値を入れる", () => {
    setup(`<input id="a" ${FIELD_ID_ATTR}="afj-0">`);
    const input = el<HTMLInputElement>("#a");
    // React は要素インスタンスに value を定義して「最後に知っている値」を記録する。
    // ここを経由して値を入れると React は変更を検知しないため、呼ばれてはいけない。
    const trackedSetter = vi.fn();
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
    Object.defineProperty(input, "value", {
      configurable: true,
      get() {
        return proto.get!.call(this);
      },
      set: trackedSetter,
    });

    applyFills(document, [{ fieldId: "afj-0", status: "fill", value: "太郎" }]);

    expect(trackedSetter).not.toHaveBeenCalled();
    expect(input.value).toBe("太郎");
  });
});

describe("applyFills: select・radio", () => {
  it("select は value を選んで change を発火する", () => {
    setup(`<select id="s" ${FIELD_ID_ATTR}="afj-0"><option value="">--</option><option value="13">東京都</option></select>`);
    const select = el<HTMLSelectElement>("#s");
    const onChange = vi.fn();
    select.addEventListener("change", onChange);

    applyFills(document, [{ fieldId: "afj-0", status: "fill", value: "13" }]);

    expect(select.value).toBe("13");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("select に指定の value がなければ入力せず要確認にする", () => {
    setup(`<select id="s" ${FIELD_ID_ATTR}="afj-0"><option value="">--</option></select>`);
    const summary = applyFills(document, [{ fieldId: "afj-0", status: "fill", value: "13" }]);
    expect(summary).toEqual({ filled: 0, review: 1 });
    expect(el<HTMLSelectElement>("#s").style.outline).toBe(HIGHLIGHT.review);
  });

  it("radio はグループ内の該当する value を選び、グループ全体をハイライトする", () => {
    setup(`
      <input type="radio" name="sex" value="1" id="m" ${FIELD_ID_ATTR}="afj-0">
      <input type="radio" name="sex" value="2" id="f" ${FIELD_ID_ATTR}="afj-0">`);
    const onChange = vi.fn();
    el("#m").addEventListener("change", onChange);

    applyFills(document, [{ fieldId: "afj-0", status: "fill", value: "1" }]);

    expect(el<HTMLInputElement>("#m").checked).toBe(true);
    expect(el<HTMLInputElement>("#f").checked).toBe(false);
    expect(onChange).toHaveBeenCalled();
    expect(el<HTMLInputElement>("#f").style.outline).toBe(HIGHLIGHT.filled);
  });
});

describe("applyFills: 要確認・その他", () => {
  it("review は値を入れず黄色でハイライトする", () => {
    setup(`<input id="a" value="既存" ${FIELD_ID_ATTR}="afj-0">`);
    const summary = applyFills(document, [{ fieldId: "afj-0", status: "review", reason: "確信度が低い" }]);
    expect(el<HTMLInputElement>("#a").value).toBe("既存");
    expect(el<HTMLInputElement>("#a").style.outline).toBe(HIGHLIGHT.review);
    expect(summary).toEqual({ filled: 0, review: 1 });
  });

  it("要素が見つからない指示は数えない", () => {
    expect(applyFills(document, [{ fieldId: "afj-9", status: "fill", value: "x" }])).toEqual({ filled: 0, review: 0 });
  });
});
