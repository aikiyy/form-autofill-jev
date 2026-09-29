import { describe, expect, it } from "vitest";
import {
  applyWidth,
  datePartCandidates,
  formatDate,
  formatKana,
  formatPostal,
  formatTel,
  genderCandidates,
  matchOption,
  prefectureCandidates,
  splitPostal,
  splitTel,
  toFullWidth,
  toHalfWidth,
  toHiragana,
  toKatakana,
} from "./format.ts";
import type { FieldDescriptor } from "./types.ts";

function field(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
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

describe("かな・幅の変換", () => {
  it("カタカナ ⇔ ひらがな（長音・中黒はそのまま）", () => {
    expect(toHiragana("ヤマダ タロー")).toBe("やまだ たろー");
    expect(toKatakana("やまだ・たろう")).toBe("ヤマダ・タロウ");
  });

  it("英数字・記号の全角 ⇔ 半角", () => {
    expect(toFullWidth("1-2-3 ABC")).toBe("１－２－３　ＡＢＣ");
    expect(toHalfWidth("１－２－３　ＡＢＣ")).toBe("1-2-3 ABC");
  });

  it("欄に「全角」「半角」の指定があれば合わせ、なければそのまま", () => {
    expect(applyWidth("神宮前1-2-3", field({ nearbyText: "（全角）" }))).toBe("神宮前１－２－３");
    expect(applyWidth("ｙａｍａｄａ＠ｅｘａｍｐｌｅ．ｃｏｍ", field({ label: "メール（半角）" }))).toBe("yamada@example.com");
    expect(applyWidth("神宮前1-2-3", field())).toBe("神宮前1-2-3");
  });

  it("半角カナ指定には対応しないので null（要確認）", () => {
    expect(applyWidth("ヤマダ", field({ nearbyText: "（半角カナ）" }))).toBeNull();
  });
});

describe("formatKana", () => {
  it("既定はカタカナのまま", () => {
    expect(formatKana("ヤマダ", field({ label: "フリガナ" }))).toBe("ヤマダ");
  });

  it("「ふりがな」「ひらがな」やひらがなの placeholder ならひらがなにする", () => {
    expect(formatKana("ヤマダ", field({ label: "ふりがな" }))).toBe("やまだ");
    expect(formatKana("ヤマダ", field({ nearbyText: "（ひらがな）" }))).toBe("やまだ");
    expect(formatKana("ヤマダ", field({ placeholder: "やまだ" }))).toBe("やまだ");
  });

  it("「全角カタカナ」指定はカタカナ", () => {
    expect(formatKana("ヤマダ", field({ label: "セイ", nearbyText: "（全角カタカナ）" }))).toBe("ヤマダ");
  });
});

describe("電話番号", () => {
  it("ユーザーが書いたハイフン位置で3分割する", () => {
    expect(splitTel("045-123-4567")).toEqual(["045", "123", "4567"]);
    expect(splitTel("090－1234－5678")).toEqual(["090", "1234", "5678"]);
  });

  it("ハイフンなしでも携帯・IP電話（0X0 + 8桁）は 3-4-4 で分割する", () => {
    expect(splitTel("09012345678")).toEqual(["090", "1234", "5678"]);
  });

  it("区切り位置が分からない固定電話は分割しない（null）", () => {
    expect(splitTel("0451234567")).toBeNull();
  });

  it("1欄の場合、既定はハイフンなし", () => {
    expect(formatTel("090-1234-5678", field())).toBe("09012345678");
  });

  it("placeholder にハイフンがある・「ハイフンあり」ならハイフン付き", () => {
    expect(formatTel("090-1234-5678", field({ placeholder: "03-1234-5678" }))).toBe("090-1234-5678");
    expect(formatTel("09012345678", field({ nearbyText: "ハイフンあり" }))).toBe("090-1234-5678");
  });

  it("「ハイフンなし」指定は placeholder より優先する", () => {
    expect(formatTel("090-1234-5678", field({ placeholder: "090-1234-5678", nearbyText: "ハイフンなし" }))).toBe(
      "09012345678",
    );
  });
});

describe("郵便番号", () => {
  it("3桁・4桁に分割する（ハイフン・全角の有無を問わない）", () => {
    expect(splitPostal("150-0001")).toEqual(["150", "0001"]);
    expect(splitPostal("１５００００１")).toEqual(["150", "0001"]);
  });

  it("7桁でなければ null", () => {
    expect(splitPostal("15000")).toBeNull();
  });

  it("1欄の場合、既定はハイフンなし・placeholder にハイフンがあれば付ける", () => {
    expect(formatPostal("150-0001", field())).toBe("1500001");
    expect(formatPostal("1500001", field({ placeholder: "123-4567" }))).toBe("150-0001");
  });
});

describe("formatDate", () => {
  it("type=date は YYYY-MM-DD", () => {
    expect(formatDate("1988-03-17", field({ type: "date" }))).toBe("1988-03-17");
  });

  it("テキスト欄は placeholder の書式に合わせ、既定は YYYY/MM/DD", () => {
    expect(formatDate("1988-03-17", field({ placeholder: "19900101" }))).toBe("19880317");
    expect(formatDate("1988-03-17", field({ placeholder: "1990-01-01" }))).toBe("1988-03-17");
    expect(formatDate("1988-03-17", field())).toBe("1988/03/17");
  });

  it("日付として不正なら null", () => {
    expect(formatDate("1988/3", field())).toBeNull();
  });
});

describe("matchOption", () => {
  const months = [
    { value: "", text: "--" },
    { value: "01", text: "1" },
    { value: "05", text: "5" },
  ];

  it("候補のどれかと option のテキストが一致したら、その option の value を返す", () => {
    expect(matchOption(months, ["5", "05", "5月"])).toBe("05");
  });

  it("全角・空白の違いは吸収する", () => {
    expect(matchOption([{ value: "x", text: " ５月 " }], ["5月"])).toBe("x");
  });

  it("テキストで見つからなければ value でも照合する", () => {
    expect(matchOption([{ value: "1988", text: "昭和63年" }], ["1988"])).toBe("1988");
  });

  it("一致しなければ null", () => {
    expect(matchOption(months, ["12"])).toBeNull();
  });
});

describe("選択肢の候補", () => {
  it("性別", () => {
    expect(matchOption([{ value: "1", text: "男性" }, { value: "2", text: "女性" }], genderCandidates("male"))).toBe("1");
    expect(matchOption([{ value: "m", text: "男" }, { value: "f", text: "女" }], genderCandidates("female"))).toBe("f");
    expect(matchOption([{ value: "M", text: "Male" }], genderCandidates("male"))).toBe("M");
    expect(genderCandidates("")).toEqual([]);
  });

  it("「回答しない」を「その他」と同一視しない", () => {
    expect(matchOption([{ value: "9", text: "回答しない" }], genderCandidates("other"))).toBeNull();
  });

  it("生年月日の年・月・日", () => {
    expect(datePartCandidates("year", "1988-03-17")).toEqual(["1988", "1988年"]);
    expect(datePartCandidates("month", "1988-03-17")).toEqual(["3", "03", "3月", "03月"]);
    expect(datePartCandidates("day", "1988-03-17")).toEqual(["17", "17日"]);
    expect(datePartCandidates("day", "壊れた値")).toEqual([]);
  });

  it("都道府県は「都・府・県」を省いた表記にも一致する（北海道は省かない）", () => {
    expect(matchOption([{ value: "13", text: "東京" }], prefectureCandidates("東京都"))).toBe("13");
    expect(matchOption([{ value: "1", text: "北海道" }], prefectureCandidates("北海道"))).toBe("1");
  });
});
