import { describe, expect, it } from "vitest";
import { EXPECTED } from "../../test/fixtures/expected.ts";
import { loadFixture } from "../../test/load-fixture.ts";
import { scanFields } from "../dom/scan.ts";
import { classifyByRules } from "./rules.ts";
import type { FieldDescriptor, FieldKey } from "./types.ts";

function field(overrides: Partial<FieldDescriptor>): FieldDescriptor {
  return {
    id: "afj-0",
    index: 0,
    tag: "input",
    type: "text",
    name: "",
    htmlId: "",
    autocomplete: "",
    label: "",
    placeholder: "",
    ariaLabel: "",
    nearbyText: "",
    ...overrides,
  };
}

function keyOf(overrides: Partial<FieldDescriptor>): FieldKey | null {
  return classifyByRules(field(overrides))?.key ?? null;
}

describe("classifyByRules: 結果の形", () => {
  it("確定した欄は confidence 1・source rule で返す", () => {
    expect(classifyByRules(field({ id: "afj-3", label: "電話番号" }))).toEqual({
      fieldId: "afj-3",
      key: "tel",
      confidence: 1,
      source: "rule",
    });
  });

  it("手がかりがなければ null（Jev に回す）", () => {
    expect(classifyByRules(field({ label: "お問い合わせ内容", tag: "textarea" }))).toBeNull();
  });
});

describe("classifyByRules: autocomplete", () => {
  it.each<[string, FieldKey]>([
    ["family-name", "lastName"],
    ["given-name", "firstName"],
    ["name", "fullName"],
    ["email", "email"],
    ["tel", "tel"],
    ["tel-national", "tel"],
    ["tel-area-code", "tel"],
    ["tel-local-suffix", "tel"],
    ["postal-code", "postalCode"],
    ["address-level1", "prefecture"],
    ["address-level2", "city"],
    ["address-line1", "street"],
    ["address-line2", "building"],
    ["bday", "birthDate"],
    ["bday-year", "birthDate"],
    ["sex", "gender"],
  ])("%s → %s", (autocomplete, expected) => {
    expect(keyOf({ autocomplete })).toBe(expected);
  });

  it("section- や shipping などの修飾トークンが付いていても判定する", () => {
    expect(keyOf({ autocomplete: "section-a shipping postal-code" })).toBe("postalCode");
  });

  it("フリガナの手がかりがあれば氏名系の autocomplete をカナ項目に読み替える", () => {
    expect(keyOf({ autocomplete: "family-name", label: "セイ" })).toBe("lastNameKana");
    expect(keyOf({ autocomplete: "name", label: "フリガナ" })).toBe("fullNameKana");
  });

  it("off / on や未知の値は無視して他の手がかりで判定する", () => {
    expect(keyOf({ autocomplete: "off", label: "郵便番号" })).toBe("postalCode");
    expect(keyOf({ autocomplete: "new-password" })).toBeNull();
  });
});

describe("classifyByRules: 氏名", () => {
  it.each<[string, FieldKey]>([
    ["姓", "lastName"],
    ["名", "firstName"],
    ["お名前（姓）", "lastName"],
    ["お名前（名）", "firstName"],
    ["お名前", "fullName"],
    ["お名前必須", "fullName"],
    ["氏名", "fullName"],
    ["姓名", "fullName"],
    ["姓・名", "fullName"],
    ["セイ", "lastNameKana"],
    ["メイ", "firstNameKana"],
    ["フリガナ（セイ）", "lastNameKana"],
    ["ふりがな（めい）", "firstNameKana"],
    ["フリガナ", "fullNameKana"],
    ["ふりがな", "fullNameKana"],
    ["お名前（カナ）", "fullNameKana"],
    ["姓（全角カナ）", "lastNameKana"],
  ])("ラベル「%s」→ %s", (label, expected) => {
    expect(keyOf({ label })).toBe(expected);
  });

  it("placeholder がカナだけならカナ項目にする", () => {
    expect(keyOf({ label: "姓", placeholder: "ヤマダ" })).toBe("lastNameKana");
    expect(keyOf({ label: "お名前", placeholder: "やまだ たろう" })).toBe("fullNameKana");
  });

  it("直後のテキストの（全角カナ）もカナの手がかりにする", () => {
    expect(keyOf({ label: "名", nearbyText: "（全角カナ）" })).toBe("firstNameKana");
  });

  it.each<[string, FieldKey]>([
    ["last_name", "lastName"],
    ["firstName", "firstName"],
    ["sei", "lastName"],
    ["mei_kana", "firstNameKana"],
    ["name_furigana", "fullNameKana"],
  ])("name 属性「%s」→ %s", (name, expected) => {
    expect(keyOf({ name })).toBe(expected);
  });

  it.each(["会社名", "店舗名", "ユーザー名", "ニックネーム", "担当者名"])("「%s」は個人の氏名と断定しない", (label) => {
    expect(keyOf({ label })).toBeNull();
  });

  it("name 属性が company_name などは個人の氏名と断定しない", () => {
    expect(keyOf({ name: "company_name" })).toBeNull();
    expect(keyOf({ name: "user_name" })).toBeNull();
  });
});

describe("classifyByRules: 連絡先・住所・属性", () => {
  it.each<[Partial<FieldDescriptor>, FieldKey]>([
    [{ label: "メールアドレス" }, "email"],
    [{ label: "メールアドレス（確認用）" }, "email"],
    [{ label: "E-mail" }, "email"],
    [{ type: "email" }, "email"],
    [{ label: "電話番号" }, "tel"],
    [{ label: "携帯電話番号" }, "tel"],
    [{ label: "電話番号 - -" }, "tel"],
    [{ name: "tel2" }, "tel"],
    [{ label: "郵便番号 〒 -" }, "postalCode"],
    [{ name: "zip1" }, "postalCode"],
    [{ label: "都道府県", tag: "select", type: "select" }, "prefecture"],
    [{ label: "市区町村" }, "city"],
    [{ label: "番地" }, "street"],
    [{ label: "建物名・部屋番号" }, "building"],
    [{ label: "生年月日", tag: "select", type: "select" }, "birthDate"],
    [{ label: "性別", type: "radio" }, "gender"],
  ])("%o → %s", (overrides, expected) => {
    expect(keyOf(overrides)).toBe(expected);
  });

  it.each<[Partial<FieldDescriptor>]>([
    [{ label: "ご住所" }], // 分割の有無が分からないので Jev に任せる
    [{ label: "FAX番号" }],
    [{ label: "メールマガジン" }],
    [{ label: "電話番号・メールアドレス" }], // 複数の項目に当てはまる
    [{ label: "郵便番号", name: "tel" }], // ラベルと name が食い違う
  ])("%o は断定しない", (overrides) => {
    expect(keyOf(overrides)).toBeNull();
  });
});

describe("classifyByRules: 自分以外の人の欄", () => {
  it.each([
    "保護者のお名前 全角 姓",
    "保護者の電話番号 半角数字",
    "同行者情報（1人目）のお名前",
    "緊急連絡先",
    "【該当される方のみ】受信契約者のお名前",
    "代理人氏名",
    "配偶者の生年月日",
  ])("「%s」は none で確定させる（Jev にも回さない）", (label) => {
    expect(classifyByRules(field({ label }))).toMatchObject({ key: "none", confidence: 1, source: "rule" });
  });

  it("name 属性の guardian / emergency なども none", () => {
    expect(keyOf({ name: "guardian_name" })).toBe("none");
    expect(keyOf({ name: "emergency_tel" })).toBe("none");
  });

  it("お届け先・連絡先は本人とみなして通常どおり判定する", () => {
    expect(keyOf({ label: "お届け先 電話番号" })).toBe("tel");
    expect(keyOf({ label: "ご連絡先メールアドレス" })).toBe("email");
  });
});

describe("classifyByRules: 年齢", () => {
  it("「年齢」や name=age は age", () => {
    expect(keyOf({ label: "年齢 半角数字 歳" })).toBe("age");
    expect(keyOf({ name: "age" })).toBe("age");
  });

  it("「生年月日」は年齢と混同しない", () => {
    expect(keyOf({ label: "生年月日 半角数字 年" })).toBe("birthDate");
  });
});

describe("classifyByRules: パスポート", () => {
  it.each<[Partial<FieldDescriptor>, FieldKey]>([
    [{ label: "旅券番号" }, "passportNumber"],
    [{ label: "パスポート番号" }, "passportNumber"],
    [{ label: "Passport No." }, "passportNumber"],
    [{ name: "passport_no" }, "passportNumber"],
    [{ name: "passportNumber" }, "passportNumber"],
    [{ label: "パスポート有効期限" }, "passportExpiry"],
    [{ label: "旅券の有効期間満了日" }, "passportExpiry"],
    [{ label: "Passport expiry date" }, "passportExpiry"],
    [{ name: "passport_expiry" }, "passportExpiry"],
  ])("%o → %s", (overrides, expected) => {
    expect(keyOf(overrides)).toBe(expected);
  });

  it.each(["有効期限", "カード有効期限", "パスポート発行日"])("「%s」は旅券の有効期限と断定しない", (label) => {
    expect(keyOf({ label })).toBeNull();
  });
});

describe("classifyByRules: ローマ字氏名", () => {
  it.each<[Partial<FieldDescriptor>, FieldKey]>([
    [{ label: "姓（ローマ字）" }, "lastNameRoman"],
    [{ label: "名（ローマ字）" }, "firstNameRoman"],
    [{ label: "氏名（英字）" }, "fullNameRoman"],
    [{ label: "パスポート記載のお名前" }, "fullNameRoman"],
    [{ label: "姓", placeholder: "YAMADA" }, "lastNameRoman"],
    [{ label: "Last name", placeholder: "Yamada" }, "lastNameRoman"],
    [{ autocomplete: "given-name", label: "名（アルファベット）" }, "firstNameRoman"],
  ])("%o → %s", (overrides, expected) => {
    expect(keyOf(overrides)).toBe(expected);
  });

  it("ローマ字の手がかりがなければ漢字の氏名のまま", () => {
    expect(keyOf({ label: "姓" })).toBe("lastName");
    expect(keyOf({ autocomplete: "family-name", ariaLabel: "Last name" })).toBe("lastName");
  });
});

describe("classifyByRules: フィクスチャ全欄で誤判定しない", () => {
  it.each(Object.keys(EXPECTED))("%s: ルールの結果は null か正解のどちらか", (fixture) => {
    loadFixture(fixture);
    const expected = EXPECTED[fixture] ?? {};
    for (const f of scanFields(document)) {
      const result = classifyByRules(f);
      if (result) expect({ name: f.name, key: result.key }).toEqual({ name: f.name, key: expected[f.name] });
    }
  });
});
