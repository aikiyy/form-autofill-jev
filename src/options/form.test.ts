import { describe, expect, it } from "vitest";
import type { Profile } from "../core/types.ts";
import { EMPTY_PROFILE } from "../storage/repository.ts";
import { normalizeProfile, validateProfile } from "./form.ts";

const valid: Profile = {
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
  building: "",
  birthDate: "1988-03-17",
  gender: "male",
};

describe("normalizeProfile", () => {
  it("フリガナのひらがなはカタカナにする", () => {
    expect(normalizeProfile({ ...valid, lastNameKana: "やまだ" }).lastNameKana).toBe("ヤマダ");
  });

  it("電話番号・郵便番号の全角やハイフンの種類をそろえる", () => {
    const p = normalizeProfile({ ...valid, tel: "０９０ー１２３４ー５６７８" });
    expect(p.tel).toBe("090-1234-5678");
    expect(normalizeProfile({ ...valid, postalCode: "1500001" }).postalCode).toBe("150-0001");
  });

  it("郵便番号が7桁でなければ手を加えない（検証でエラーにする）", () => {
    expect(normalizeProfile({ ...valid, postalCode: "15000" }).postalCode).toBe("15000");
  });
});

describe("validateProfile", () => {
  it("正しい値・空欄はエラーなし", () => {
    expect(validateProfile(valid)).toEqual([]);
    expect(validateProfile({ ...EMPTY_PROFILE })).toEqual([]);
  });

  it.each<[keyof Profile, string]>([
    ["email", "yamada@"],
    ["tel", "0451234567"], // 固定電話でハイフンなし → 分割位置が分からない
    ["postalCode", "15000"],
    ["lastNameKana", "山田"],
    ["firstNameKana", "Taro"],
    ["birthDate", "1988/03/17"],
  ])("%s が「%s」ならエラー", (key, value) => {
    const errors = validateProfile({ ...valid, [key]: value });
    expect(errors).toEqual([{ key, message: expect.any(String) }]);
  });

  it("携帯番号はハイフンなしでも分割できるのでエラーにしない", () => {
    expect(validateProfile({ ...valid, tel: "09012345678" })).toEqual([]);
  });
});
