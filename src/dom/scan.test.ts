import { beforeEach, describe, expect, it } from "vitest";
import { loadFixture } from "../../test/load-fixture.ts";
import type { FieldDescriptor } from "../core/types.ts";
import { scanFields } from "./scan.ts";

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

  it("ID はページ側の name（f1 等）と紛れない afj- 接頭辞にする", () => {
    expect(scanFields(document).map((f) => f.id)).toEqual(["afj-0", "afj-1", "afj-2", "afj-3", "afj-4", "afj-5", "afj-6"]);
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

describe("scanFields: 1つの欄に複数の label・区切り label 型", () => {
  beforeEach(() => loadFixture("multi-label.html"));

  it("同じ欄を指す label をすべて出現順につなげる（タイトル・注記・個別ラベル）", () => {
    const fields = scanFields(document);
    expect(byName(fields, "field_01").label).toBe("申込者のお名前 全角 姓");
    expect(byName(fields, "field_03").label).toBe("申込者のお名前（フリガナ） 全角カタカナ セイ");
    expect(byName(fields, "field_15").label).toBe("年齢 半角数字 歳");
  });

  it("label が「-」だけの分割欄は、直前の欄の項目名を引き継ぐ", () => {
    const fields = scanFields(document);
    expect(byName(fields, "field_06").label).toBe("電話番号（日中連絡がとれるもの） 半角数字");
    expect(byName(fields, "field_07").label).toBe("電話番号（日中連絡がとれるもの） 半角数字");
    expect(byName(fields, "field_09").label).toBe("住所 〒");
  });

  it("「年」「月」「日」だけの label は、直前の欄の項目名に付け足す", () => {
    const fields = scanFields(document);
    expect(byName(fields, "field_14Year").label).toBe("生年月日 半角数字 年");
    expect(byName(fields, "field_14Month").label).toBe("生年月日 半角数字 月");
    expect(byName(fields, "field_14Day").label).toBe("生年月日 半角数字 日");
  });

  it("「名」「メイ」だけの欄は、同じまとまりの直前の欄から共通の項目名を引き継ぐ", () => {
    const fields = scanFields(document);
    expect(byName(fields, "field_02").label).toBe("申込者のお名前 全角 名");
    expect(byName(fields, "field_04").label).toBe("申込者のお名前（フリガナ） 全角カタカナ メイ");
    // 保護者の欄であることが失われると、本人の名前を入れてしまう
    expect(byName(fields, "field_18").label).toBe("保護者のお名前 全角 名");
  });

  it("非表示のブロック内の欄は対象外", () => {
    expect(scanFields(document).some((f) => f.name === "field_23")).toBe(false);
  });
});

describe("scanFields: label の for が欄と一致しない・国番号つき電話", () => {
  beforeEach(() => loadFixture("orphan-label.html"));

  it("関連付いていない行ラベルも、数段上の直前のテキストとして拾う", () => {
    const fields = scanFields(document);
    expect(byName(fields, "reservation[customer][last_name]").label).toBe("なまえ (ふりがな) 必須");
    expect(byName(fields, "reservation[customer][first_name]").label).toBe("なまえ (ふりがな) 必須");
    expect(byName(fields, "reservation[customer][kanji_last_name]").label).toBe("名前 (漢字)");
  });

  it("電話欄の前に表示された国番号（+81）を拾い、非表示の国一覧は無視する", () => {
    const fields = scanFields(document);
    expect(byName(fields, "reservation[customer][phone]").dialCode).toBe("+81");
    expect(byName(fields, "reservation[customer][email]").dialCode).toBeUndefined();
  });

  it("国番号の select で選ばれている値も拾う", () => {
    document.body.innerHTML = `
      <div><select name="cc"><option value="1">+1</option><option value="81" selected>日本 (+81)</option></select>
      <input type="tel" name="tel"></div>`;
    expect(byName(scanFields(document), "tel").dialCode).toBe("+81");
  });

  it("ラベルや placeholder に +81 があれば国番号とみなす", () => {
    document.body.innerHTML = `<label>電話番号（+81）<input type="tel" name="tel"></label>`;
    expect(byName(scanFields(document), "tel").dialCode).toBe("+81");
  });
});

