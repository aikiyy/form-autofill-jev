import type { FieldKey } from "../../src/core/types.ts";

/** フィクスチャごとの正解（欄の name → FieldKey） */
export const EXPECTED: Record<string, Record<string, FieldKey>> = {
  "label-for.html": {
    sei: "lastName",
    mei: "firstName",
    sei_kana: "lastNameKana",
    mei_kana: "firstNameKana",
    mail: "email",
    mail_confirm: "email",
    tel: "tel",
  },
  "table-layout.html": { f1: "fullName", f2: "fullNameKana", f3: "address", f4: "email", f5: "none", f6: "tel" },
  "split-fields.html": {
    zip1: "postalCode",
    zip2: "postalCode",
    pref: "prefecture",
    addr1: "city",
    addr2: "street",
    addr3: "building",
    tel1: "tel",
    tel2: "tel",
    tel3: "tel",
  },
  "birthdate-gender.html": { birth_y: "birthDate", birth_m: "birthDate", birth_d: "birthDate", sex: "gender" },
  "autocomplete-en.html": {
    a: "lastName",
    b: "firstName",
    c: "email",
    d: "tel",
    e: "postalCode",
    f: "prefecture",
    g: "city",
    h: "street",
    i: "building",
    j: "birthDate",
  },
};
