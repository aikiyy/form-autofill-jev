import { describe, expect, it } from "vitest";
import { loadFixture } from "../../test/load-fixture.ts";
import { scanFields } from "../dom/scan.ts";
import { CONFIDENCE_THRESHOLD, resolveFills } from "./resolve.ts";
import { classifyByRules } from "./rules.ts";
import type { Assignment, FieldDescriptor, FieldKey, FillInstruction, Profile } from "./types.ts";

const profile: Profile = {
  lastName: "山田",
  firstName: "太郎",
  lastNameKana: "ヤマダ",
  firstNameKana: "タロウ",
  email: "yamada@example.com",
  tel: "090-1234-5678",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  street: "神宮前1-2-3",
  building: "ハイツ101",
  birthDate: "1988-03-17",
  gender: "male",
};

let seq = 0;
function field(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  const index = seq++;
  return {
    id: `afj-${index}`,
    index,
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

function rule(f: FieldDescriptor, key: FieldKey): Assignment {
  return { fieldId: f.id, key, confidence: 1, source: "rule" };
}

function jev(f: FieldDescriptor, key: FieldKey, confidence: number): Assignment {
  return { fieldId: f.id, key, confidence, source: "jev" };
}

function fill(f: FieldDescriptor, value: string): FillInstruction {
  return { fieldId: f.id, status: "fill", value };
}

function statusOf(result: FillInstruction[], f: FieldDescriptor): FillInstruction | undefined {
  return result.find((r) => r.fieldId === f.id);
}

describe("resolveFills: 判定結果の扱い", () => {
  it("閾値は 0.85（T7 の spike で決定）", () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.85);
  });

  it("確信度が閾値以上なら入力し、未満なら要確認にする", () => {
    const a = field();
    const b = field();
    const result = resolveFills([a, b], [jev(a, "email", 0.9), jev(b, "city", 0.6)], profile);

    expect(statusOf(result, a)).toEqual(fill(a, "yamada@example.com"));
    expect(statusOf(result, b)).toMatchObject({ status: "review" });
  });

  it("none と判定された欄・判定のない欄には何もしない", () => {
    const a = field();
    const b = field();
    expect(resolveFills([a, b], [jev(a, "none", 0.99)], profile)).toEqual([]);
  });

  it("同じ欄にルールと Jev の結果があればルールを優先する", () => {
    const a = field();
    const result = resolveFills([a], [jev(a, "city", 0.99), rule(a, "email")], profile);
    expect(result).toEqual([fill(a, "yamada@example.com")]);
  });

  it("プロフィールの値が空なら入力しない", () => {
    const a = field();
    expect(resolveFills([a], [rule(a, "building")], { ...profile, building: "" })).toEqual([]);
  });

  it("結果は欄の出現順に並べる", () => {
    const a = field();
    const b = field();
    const result = resolveFills([a, b], [rule(b, "city"), rule(a, "email")], profile);
    expect(result.map((r) => r.fieldId)).toEqual([a.id, b.id]);
  });
});

describe("resolveFills: 氏名", () => {
  it("姓・名・氏名", () => {
    const [a, b, c] = [field(), field(), field()];
    const result = resolveFills([a, b, c], [rule(a, "lastName"), rule(b, "firstName"), rule(c, "fullName")], profile);
    expect(result).toEqual([fill(a, "山田"), fill(b, "太郎"), fill(c, "山田 太郎")]);
  });

  it("フリガナは欄の指定に合わせてカタカナ/ひらがなにする", () => {
    const a = field({ label: "セイ" });
    const b = field({ label: "ふりがな" });
    const result = resolveFills([a, b], [rule(a, "lastNameKana"), rule(b, "fullNameKana")], profile);
    expect(result).toEqual([fill(a, "ヤマダ"), fill(b, "やまだ たろう")]);
  });

  it("半角カナ指定の欄は要確認にする", () => {
    const a = field({ label: "セイ", nearbyText: "（半角カナ）" });
    expect(resolveFills([a], [rule(a, "lastNameKana")], profile)).toEqual([
      { fieldId: a.id, status: "review", reason: expect.any(String) },
    ]);
  });
});

describe("resolveFills: 連絡先", () => {
  it("メールアドレスと確認用の2欄が並んでいれば両方に入力する", () => {
    const [a, b] = [field(), field()];
    const result = resolveFills([a, b], [rule(a, "email"), rule(b, "email")], profile);
    expect(result).toEqual([fill(a, "yamada@example.com"), fill(b, "yamada@example.com")]);
  });

  it("電話番号1欄は欄の指定に合わせてハイフンを付ける/外す", () => {
    const a = field();
    const b = field({ placeholder: "03-1234-5678" });
    const result = resolveFills([a, b], [rule(a, "tel"), rule(b, "tel")], profile);
    // 隣り合っているが 2欄は分割の形ではないので要確認
    expect(result.every((r) => r.status === "review")).toBe(true);

    const c = field();
    expect(resolveFills([c], [rule(c, "tel")], profile)).toEqual([fill(c, "09012345678")]);
    const d = field({ placeholder: "03-1234-5678" });
    expect(resolveFills([d], [rule(d, "tel")], profile)).toEqual([fill(d, "090-1234-5678")]);
  });

  it("隣り合う3欄の電話番号は分割して入力する", () => {
    const [a, b, c] = [field(), field(), field()];
    const result = resolveFills([a, b, c], [rule(a, "tel"), rule(b, "tel"), rule(c, "tel")], profile);
    expect(result).toEqual([fill(a, "090"), fill(b, "1234"), fill(c, "5678")]);
  });

  it("区切りの分からない固定電話は3欄に分割せず要確認にする", () => {
    const [a, b, c] = [field(), field(), field()];
    const result = resolveFills([a, b, c], [rule(a, "tel"), rule(b, "tel"), rule(c, "tel")], {
      ...profile,
      tel: "0451234567",
    });
    expect(result.map((r) => r.status)).toEqual(["review", "review", "review"]);
  });

  it("分割欄の一部だけ確信度が低ければ、グループ全体を要確認にする", () => {
    const [a, b, c] = [field(), field(), field()];
    const result = resolveFills([a, b, c], [rule(a, "tel"), jev(b, "tel", 0.5), rule(c, "tel")], profile);
    expect(result.map((r) => r.status)).toEqual(["review", "review", "review"]);
  });
});

describe("resolveFills: 住所", () => {
  it("隣り合う2欄の郵便番号は 3桁・4桁で入力し、1欄なら既定でハイフンなし", () => {
    const [a, b, c] = [field(), field(), field()];
    const result = resolveFills([a, b, c], [rule(a, "postalCode"), rule(b, "postalCode"), jev(c, "email", 0.9)], profile);
    expect(result.slice(0, 2)).toEqual([fill(a, "150"), fill(b, "0001")]);

    const d = field();
    expect(resolveFills([d], [rule(d, "postalCode")], profile)).toEqual([fill(d, "1500001")]);
  });

  it("都道府県の select は選択肢と照合し、なければ要確認", () => {
    const options = [
      { value: "", text: "選択してください" },
      { value: "13", text: "東京都" },
    ];
    const a = field({ tag: "select", type: "select", options });
    expect(resolveFills([a], [rule(a, "prefecture")], profile)).toEqual([fill(a, "13")]);

    const b = field({ tag: "select", type: "select", options: [{ value: "27", text: "大阪府" }] });
    expect(resolveFills([b], [rule(b, "prefecture")], profile)).toEqual([
      { fieldId: b.id, status: "review", reason: expect.any(String) },
    ]);
  });

  it("市区町村・番地・建物名は欄の全角指定に合わせる", () => {
    const [a, b, c] = [field(), field({ nearbyText: "（全角）" }), field()];
    const result = resolveFills([a, b, c], [rule(a, "city"), rule(b, "street"), rule(c, "building")], profile);
    expect(result).toEqual([fill(a, "渋谷区"), fill(b, "神宮前１－２－３"), fill(c, "ハイツ101")]);
  });

  it("住所1欄は都道府県から建物名までつなげる", () => {
    const a = field();
    expect(resolveFills([a], [jev(a, "address", 0.95)], profile)).toEqual([fill(a, "東京都渋谷区神宮前1-2-3 ハイツ101")]);
  });

  it("都道府県・建物名の欄が別にあれば、住所欄にはそれを含めない", () => {
    const [pref, addr, bldg] = [field(), field(), field()];
    const result = resolveFills([pref, addr, bldg], [rule(pref, "prefecture"), jev(addr, "address", 0.95), rule(bldg, "building")], profile);
    expect(statusOf(result, addr)).toEqual(fill(addr, "渋谷区神宮前1-2-3"));
  });

  it("番地など分割しない項目が隣り合って重複したら要確認にする", () => {
    const [a, b] = [field(), field()];
    const result = resolveFills([a, b], [jev(a, "street", 0.9), jev(b, "street", 0.9)], profile);
    expect(result.map((r) => r.status)).toEqual(["review", "review"]);
  });
});

describe("resolveFills: 生年月日・性別", () => {
  const years = [{ value: "", text: "----" }, { value: "1988", text: "1988" }];
  const months = [{ value: "", text: "--" }, { value: "03", text: "3" }];
  const days = [{ value: "", text: "--" }, { value: "17", text: "17" }];

  it("年・月・日の select 3つは直後の「年」「月」「日」で役割を決めて選ぶ", () => {
    const y = field({ tag: "select", type: "select", options: years, nearbyText: "年" });
    const m = field({ tag: "select", type: "select", options: months, nearbyText: "月" });
    const d = field({ tag: "select", type: "select", options: days, nearbyText: "日" });
    const result = resolveFills([y, m, d], [rule(y, "birthDate"), rule(m, "birthDate"), rule(d, "birthDate")], profile);
    expect(result).toEqual([fill(y, "1988"), fill(m, "03"), fill(d, "17")]);
  });

  it("手がかりがなければ、4桁の年を含む select を年とし、残りを出現順に月・日とする", () => {
    const y = field({ tag: "select", type: "select", options: years });
    const m = field({ tag: "select", type: "select", options: months });
    const d = field({ tag: "select", type: "select", options: days });
    const result = resolveFills([y, m, d], [rule(y, "birthDate"), rule(m, "birthDate"), rule(d, "birthDate")], profile);
    expect(result).toEqual([fill(y, "1988"), fill(m, "03"), fill(d, "17")]);
  });

  it("選択肢に該当する値がなければその欄を要確認にする", () => {
    const y = field({ tag: "select", type: "select", options: years, nearbyText: "年" });
    const m = field({ tag: "select", type: "select", options: [{ value: "01", text: "1" }], nearbyText: "月" });
    const d = field({ tag: "select", type: "select", options: days, nearbyText: "日" });
    const result = resolveFills([y, m, d], [rule(y, "birthDate"), rule(m, "birthDate"), rule(d, "birthDate")], profile);
    expect(result.map((r) => r.status)).toEqual(["fill", "review", "fill"]);
  });

  it("1欄の生年月日は type や placeholder に合わせる", () => {
    const a = field({ type: "date" });
    const b = field({ placeholder: "19900101" });
    expect(resolveFills([a], [rule(a, "birthDate")], profile)).toEqual([fill(a, "1988-03-17")]);
    expect(resolveFills([b], [rule(b, "birthDate")], profile)).toEqual([fill(b, "19880317")]);
  });

  it("性別の radio は選択肢と照合し、選べなければ要確認", () => {
    const options = [
      { value: "1", text: "男性" },
      { value: "2", text: "女性" },
    ];
    const a = field({ type: "radio", options });
    expect(resolveFills([a], [rule(a, "gender")], profile)).toEqual([fill(a, "1")]);
    expect(resolveFills([a], [rule(a, "gender")], { ...profile, gender: "other" })).toEqual([
      { fieldId: a.id, status: "review", reason: expect.any(String) },
    ]);
  });

  it("性別がテキスト欄なら要確認（表記が決められない）", () => {
    const a = field();
    expect(resolveFills([a], [rule(a, "gender")], profile)[0]?.status).toBe("review");
  });
});

describe("resolveFills: フィクスチャで scan → ルール判定 → resolve", () => {
  function valuesByName(fixture: string, today?: Date): Record<string, string> {
    loadFixture(fixture);
    const fields = scanFields(document);
    const assignments = fields.map(classifyByRules).filter((a): a is Assignment => a !== null);
    const byId = new Map(fields.map((f) => [f.id, f.name]));
    const out: Record<string, string> = {};
    for (const r of resolveFills(fields, assignments, profile, { today })) {
      out[byId.get(r.fieldId)!] = r.status === "fill" ? r.value : `review:${r.reason}`;
    }
    return out;
  }

  it("分割欄型: 郵便番号・都道府県 select・住所・電話番号3欄", () => {
    expect(valuesByName("split-fields.html")).toEqual({
      zip1: "150",
      zip2: "0001",
      pref: "13",
      addr1: "渋谷区",
      addr2: "神宮前1-2-3",
      addr3: "ハイツ101",
      tel1: "090",
      tel2: "1234",
      tel3: "5678",
    });
  });

  it("生年月日・性別型: 年月日 select 3つと性別 radio", () => {
    expect(valuesByName("birthdate-gender.html")).toEqual({ birth_y: "1988", birth_m: "03", birth_d: "17", sex: "1" });
  });

  it("label[for] 型: 氏名・カナ・メール2欄・電話番号（placeholder に合わせてハイフン付き）", () => {
    expect(valuesByName("label-for.html")).toEqual({
      sei: "山田",
      mei: "太郎",
      sei_kana: "ヤマダ",
      mei_kana: "タロウ",
      mail: "yamada@example.com",
      mail_confirm: "yamada@example.com",
      tel: "090-1234-5678",
    });
  });

  it("複数 label・区切り label 型: 分割の電話・郵便番号、年月日、年齢が入り、保護者等の欄は入力しない", () => {
    expect(valuesByName("multi-label.html", new Date(2026, 9, 2))).toEqual({
      field_01: "山田",
      field_02: "太郎",
      field_03: "ヤマダ",
      field_04: "タロウ",
      field_05: "090",
      field_06: "1234",
      field_07: "5678",
      field_08: "150",
      field_09: "0001",
      field_10: "東京都",
      field_11: "渋谷区",
      field_12: "神宮前1-2-3",
      field_13: "ハイツ101",
      field_14Year: "1988",
      field_14Month: "03",
      field_14Day: "17",
      field_15: "38",
    });
  });
});

describe("resolveFills: 年齢", () => {
  it("生年月日と今日の日付から年齢を計算する（誕生日の前日までは1つ少ない）", () => {
    const a = field();
    expect(resolveFills([a], [rule(a, "age")], profile, { today: new Date(2026, 2, 17) })).toEqual([fill(a, "38")]);
    expect(resolveFills([a], [rule(a, "age")], profile, { today: new Date(2026, 2, 16) })).toEqual([fill(a, "37")]);
  });

  it("select は「38」「38歳」のどちらの表記にも合わせる", () => {
    const a = field({ tag: "select", type: "select", options: [{ value: "x", text: "38歳" }] });
    expect(resolveFills([a], [rule(a, "age")], profile, { today: new Date(2026, 9, 2) })).toEqual([fill(a, "x")]);
  });

  it("生年月日が未設定なら入力しない", () => {
    const a = field();
    expect(resolveFills([a], [rule(a, "age")], { ...profile, birthDate: "" })).toEqual([]);
  });
});

describe("resolveFills: 年月日のテキスト欄", () => {
  it("ラベルの末尾の「年」「月」「日」で役割を決め、maxLength 2 なら0埋めする", () => {
    const y = field({ label: "生年月日 年", maxLength: 4 });
    const m = field({ label: "生年月日 月", maxLength: 2 });
    const d = field({ label: "生年月日 日", maxLength: 2 });
    const result = resolveFills([d, m, y].sort((a, b) => a.index - b.index), [rule(y, "birthDate"), rule(m, "birthDate"), rule(d, "birthDate")], profile);
    expect(result).toEqual([fill(y, "1988"), fill(m, "03"), fill(d, "17")]);
  });
});
