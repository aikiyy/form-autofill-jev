import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { FieldDescriptor } from "../core/types.ts";
import { scanFields } from "./scan.ts";

function loadFixture(name: string): void {
  const html = readFileSync(resolve(import.meta.dirname, "../../test/fixtures/forms", name), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.title = doc.title;
  document.body.innerHTML = doc.body.innerHTML;
}

function byName(fields: FieldDescriptor[], name: string): FieldDescriptor {
  const field = fields.find((f) => f.name === name);
  if (!field) throw new Error(`field ${name} not found`);
  return field;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("scanFields: label[for] 型", () => {
  beforeEach(() => loadFixture("label-for.html"));

  it("対象外（password・hidden・非表示・disabled・button）を除外する", () => {
    const names = scanFields(document).map((f) => f.name);
    expect(names).toEqual(["sei", "mei", "sei_kana", "mei_kana", "mail", "mail_confirm", "tel"]);
  });

  it("label[for] と囲み label からラベルを解決する", () => {
    const fields = scanFields(document);
    expect(byName(fields, "sei").label).toBe("姓");
    expect(byName(fields, "mei_kana").label).toBe("メイ");
    expect(byName(fields, "mail_confirm").label).toBe("メールアドレス（確認用）");
    expect(byName(fields, "tel").label).toBe("電話番号");
  });

  it("直後のテキスト・placeholder・type を拾う", () => {
    const fields = scanFields(document);
    expect(byName(fields, "sei_kana").nearbyText).toBe("（全角カナ）");
    expect(byName(fields, "tel").placeholder).toBe("090-1234-5678");
    expect(byName(fields, "mail").type).toBe("email");
  });

  it("出現順の index と id を振り、要素に data-afj-id を付与する", () => {
    const fields = scanFields(document);
    expect(fields.map((f) => f.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const sei = byName(fields, "sei");
    expect(document.querySelector("#sei")?.getAttribute("data-afj-id")).toBe(sei.id);
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
  });
});

describe("scanFields: テーブル型", () => {
  beforeEach(() => loadFixture("table-layout.html"));

  it("同じ行の th / dt からラベルを解決する", () => {
    const fields = scanFields(document);
    expect(byName(fields, "f1").label).toContain("お名前");
    expect(byName(fields, "f2").label).toBe("ふりがな");
    expect(byName(fields, "f6").label).toBe("電話番号");
  });

  it("textarea も対象に含める", () => {
    expect(byName(scanFields(document), "f5")).toMatchObject({ tag: "textarea", type: "textarea" });
  });
});

describe("scanFields: 分割欄型", () => {
  beforeEach(() => loadFixture("split-fields.html"));

  it("分割された郵便番号・電話番号は、どの欄も直前のテキストから項目名を拾う", () => {
    const fields = scanFields(document);
    for (const name of ["zip1", "zip2"]) expect(byName(fields, name).label).toContain("郵便番号");
    for (const name of ["tel1", "tel2", "tel3"]) expect(byName(fields, name).label).toContain("電話番号");
  });

  it("maxLength を拾い、指定がなければ undefined にする", () => {
    const fields = scanFields(document);
    expect(byName(fields, "zip1").maxLength).toBe(3);
    expect(byName(fields, "zip2").maxLength).toBe(4);
    expect(byName(fields, "addr1").maxLength).toBeUndefined();
  });

  it("select の選択肢を value と text で持つ", () => {
    const pref = byName(scanFields(document), "pref");
    expect(pref).toMatchObject({ tag: "select", type: "select", label: "都道府県" });
    expect(pref.options).toContainEqual({ value: "13", text: "東京都" });
    expect(pref.options).toHaveLength(4);
  });
});

describe("scanFields: 生年月日・性別型", () => {
  beforeEach(() => loadFixture("birthdate-gender.html"));

  it("fieldset の legend をラベルにし、直後の「年」「月」「日」を nearbyText に入れる", () => {
    const fields = scanFields(document);
    expect(byName(fields, "birth_y")).toMatchObject({ label: "生年月日", nearbyText: "年" });
    expect(byName(fields, "birth_m")).toMatchObject({ label: "生年月日", nearbyText: "月" });
    expect(byName(fields, "birth_d")).toMatchObject({ label: "生年月日", nearbyText: "日" });
  });

  it("radio は name ごとに1件にまとめ、各選択肢のラベルを options に入れる", () => {
    const fields = scanFields(document);
    const sex = fields.filter((f) => f.name === "sex");
    expect(sex).toHaveLength(1);
    expect(sex[0]).toMatchObject({
      type: "radio",
      label: "性別",
      options: [
        { value: "1", text: "男性" },
        { value: "2", text: "女性" },
        { value: "9", text: "回答しない" },
      ],
    });
    const radios = document.querySelectorAll('input[name="sex"]');
    for (const radio of radios) expect(radio.getAttribute("data-afj-id")).toBe(sex[0]?.id);
  });

  it("checkbox は対象外にする", () => {
    expect(scanFields(document).some((f) => f.name === "agree")).toBe(false);
  });
});

describe("scanFields: autocomplete 付き英語フォーム", () => {
  beforeEach(() => loadFixture("autocomplete-en.html"));

  it("autocomplete・aria-label・aria-labelledby を拾う", () => {
    const fields = scanFields(document);
    expect(byName(fields, "a")).toMatchObject({ autocomplete: "family-name", ariaLabel: "Last name" });
    expect(byName(fields, "f").autocomplete).toBe("address-level1");
    expect(byName(fields, "j")).toMatchObject({ type: "date", label: "Birthday", autocomplete: "bday" });
  });
});
