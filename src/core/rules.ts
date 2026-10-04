import type { Assignment, FieldDescriptor, FieldKey } from "./types.ts";

/**
 * ルールで確実に判定できる欄だけを確定させる。
 * 誤入力を防ぐため、手がかりが食い違う・複数の項目に当てはまる場合は null を返して Jev に任せる。
 * @returns 確定した判定（confidence 1）。確定できなければ null
 */
export function classifyByRules(field: FieldDescriptor): Assignment | null {
  const key = isOtherPerson(field) ? "none" : (byAutocomplete(field) ?? byText(field));
  return key ? { fieldId: field.id, key, confidence: 1, source: "rule" } : null;
}

// ---- 自分以外の人の欄 ----

/** 保護者・同行者など、本人以外の人の情報を入れる欄。プロフィールの値を入れると誤入力になる */
const OTHER_PERSON_TEXT =
  /保護者|同行者|同伴者|代理人|緊急連絡先|受信契約者|紹介者|保証人|配偶者|ご家族|家族の|お子様|お子さま|子ども|子供/;
const OTHER_PERSON_TOKENS = new Set(["guardian", "parent", "companion", "emergency", "spouse", "referrer", "family", "child"]);

function isOtherPerson(field: FieldDescriptor): boolean {
  if (OTHER_PERSON_TEXT.test(`${field.label} ${field.ariaLabel}`)) return true;
  return [...identTokens(field)].some((t) => OTHER_PERSON_TOKENS.has(t));
}

// ---- autocomplete ----

const AUTOCOMPLETE_MAP: Record<string, FieldKey> = {
  "family-name": "lastName",
  "given-name": "firstName",
  name: "fullName",
  email: "email",
  tel: "tel",
  "tel-national": "tel",
  "tel-area-code": "tel",
  "tel-local": "tel",
  "tel-local-prefix": "tel",
  "tel-local-suffix": "tel",
  "postal-code": "postalCode",
  "address-level1": "prefecture",
  "address-level2": "city",
  "address-line1": "street",
  "address-line2": "building",
  bday: "birthDate",
  "bday-year": "birthDate",
  "bday-month": "birthDate",
  "bday-day": "birthDate",
  sex: "gender",
};

/** autocomplete は「section-x shipping postal-code」のように修飾トークンが前に付くので、既知のトークンを探す */
function byAutocomplete(field: FieldDescriptor): FieldKey | null {
  const tokens = field.autocomplete.toLowerCase().split(/\s+/);
  for (const token of tokens.reverse()) {
    const key = AUTOCOMPLETE_MAP[token];
    if (key) return withNameVariant(key, field);
  }
  return null;
}

// ---- ラベル・name 属性 ----

/** これを含む欄は判定しない（FAX・メルマガ等は個人情報の項目と紛らわしい） */
const EXCLUDE_TEXT = /fax|ファックス|ファクス|マガジン|メルマガ|newsletter|配信/i;

/** 氏名と紛らわしい「〇〇名」 */
const NOT_PERSON_NAME_TEXT =
  /会社|法人|団体|学校|店舗|店名|屋号|部署|担当|ユーザー|ニックネーム|アカウント|カード|名義|クーポン|商品|件名|ファイル|company|organi[sz]ation|corp|shop|store|school|user|nick|account|login|card|coupon|product|subject|file/i;
const NOT_PERSON_NAME_TOKENS = new Set([
  "company",
  "corp",
  "organization",
  "org",
  "shop",
  "store",
  "user",
  "nick",
  "nickname",
  "account",
  "login",
  "card",
  "coupon",
  "product",
  "file",
  "school",
  "dept",
]);

/** 氏名以外の項目: ラベル（label・aria-label）の正規表現と、name/id のトークン */
const OTHER_PATTERNS: { key: FieldKey; text: RegExp; tokens: string[] }[] = [
  { key: "email", text: /メール|e-?mail|mail/i, tokens: ["mail", "email", "mailaddress", "emailaddress"] },
  { key: "tel", text: /電話|携帯番号|\btel\b|phone/i, tokens: ["tel", "phone", "telephone", "mobile", "keitai", "denwa"] },
  { key: "postalCode", text: /郵便番号|〒|zip|postal|post\s*code/i, tokens: ["zip", "zipcode", "postal", "postcode", "yubin"] },
  { key: "prefecture", text: /都道府県|prefecture/i, tokens: ["pref", "prefecture", "todofuken", "state"] },
  { key: "city", text: /市区町村|市区郡|\bcity\b/i, tokens: ["city", "shikuchoson"] },
  { key: "street", text: /番地|丁目|町名|\bstreet\b/i, tokens: ["street", "banchi"] },
  { key: "building", text: /建物|マンション|ビル名|部屋番号|building|apartment/i, tokens: ["building", "bldg", "tatemono", "apartment", "apt"] },
  { key: "birthDate", text: /生年月日|誕生日|birth|bday/i, tokens: ["birth", "birthday", "birthdate", "bday", "dob", "tanjobi", "seinengappi"] },
  {
    key: "passportNumber",
    text: /旅券番号|パスポート番号|passport\s*(no\b|number|#)/i,
    tokens: [],
  },
  { key: "age", text: /年齢|\bage\b/i, tokens: ["age", "nenrei"] },
  { key: "gender", text: /性別|gender/i, tokens: ["gender", "sex", "seibetsu"] },
];

const PASSPORT_TEXT = /旅券|パスポート|passport/i;
const EXPIRY_TEXT = /有効期限|有効期間|満了|expir|valid/i;

const LAST_NAME_TEXT = /姓|名字|苗字|セイ|せい|last\s*name|family\s*name|surname/i;
/** 「名」は単独（先頭・括弧や区切りの直後）のときだけ。「氏名」「お名前」「名字」「建物名」等は除く */
const FIRST_NAME_TEXT = /(^|[\s（(・/／「【])名(?![前字])|メイ|めい|first\s*name|given\s*name/i;
const FULL_NAME_TEXT = /氏名|お名前|名前|なまえ|full\s*name|^\s*name\s*$/i;
/** ラベルがこれだけなら「氏名のフリガナ（1欄）」 */
const FULL_NAME_KANA_LABEL = /^(フリガナ|ふりがな|カナ|カナ氏名|フリガナ氏名|氏名カナ|氏名フリガナ)$/;

const LAST_NAME_TOKENS = new Set(["last", "family", "sei", "surname", "lname", "myoji"]);
const FIRST_NAME_TOKENS = new Set(["first", "given", "mei", "fname", "forename"]);
const FULL_NAME_TOKENS = new Set(["name", "fullname", "namae", "shimei", "simei", "furigana"]);

const KANA_TEXT = /フリガナ|ふりがな|カタカナ|ひらがな|カナ|セイ|メイ|furigana|kana|katakana|hiragana/i;
const KANA_TOKENS = new Set(["kana", "furigana", "katakana", "hiragana", "yomi", "ruby"]);
const KANA_ONLY = /^[ぁ-ゟ゠-ヿ\s　ー・]+$/;

function byText(field: FieldDescriptor): FieldKey | null {
  const text = `${field.label} ${field.ariaLabel}`.trim();
  if (EXCLUDE_TEXT.test(`${text} ${field.name} ${field.htmlId}`)) return null;

  const tokens = identTokens(field);
  const fromText = new Set<FieldKey>();
  const fromTokens = new Set<FieldKey>();

  for (const p of OTHER_PATTERNS) {
    if (p.text.test(text)) fromText.add(p.key);
    if (p.tokens.some((t) => tokens.has(t))) fromTokens.add(p.key);
  }
  if (field.type === "email") fromTokens.add("email");

  // 旅券は name の「passport」＋「no / expiry」の組み合わせで判定する
  if (tokens.has("passport")) {
    if (["no", "number", "num"].some((t) => tokens.has(t))) fromTokens.add("passportNumber");
    if (["expiry", "expire", "expiration", "exp", "valid"].some((t) => tokens.has(t))) fromTokens.add("passportExpiry");
  }
  // 「有効期限」はクレジットカードと区別できないので、旅券の文脈があるときだけ
  if (PASSPORT_TEXT.test(text) && EXPIRY_TEXT.test(text)) fromText.add("passportExpiry");

  const textName = nameFromText(text);
  if (textName) fromText.add(textName);
  const tokenName = nameFromTokens(tokens);
  if (tokenName) fromTokens.add(tokenName);

  // 同じ手がかりの中で複数の項目に当てはまる、または手がかり同士が食い違う場合は断定しない
  if (fromText.size > 1 || fromTokens.size > 1) return null;
  let [a] = fromText;
  const [b] = fromTokens;
  // 「お名前」「名前 (漢字)」は姓・名の2欄に共通の行ラベルであることが多いので、name 属性の姓・名を優先する
  if (a === "fullName" && (b === "lastName" || b === "firstName")) a = b;
  if (a && b && a !== b) return null;
  const key = a ?? b;
  return key ? withNameVariant(key, field) : null;
}

function nameFromText(text: string): FieldKey | null {
  if (!text || NOT_PERSON_NAME_TEXT.test(text)) return null;
  const normalized = text.replace(/姓名/g, "氏名");
  const last = LAST_NAME_TEXT.test(normalized);
  const first = FIRST_NAME_TEXT.test(normalized);
  if (last && first) return "fullName"; // 「姓・名」を1欄で入力する
  if (last) return "lastName";
  if (first) return "firstName";
  if (FULL_NAME_TEXT.test(normalized) || FULL_NAME_KANA_LABEL.test(stripNotes(normalized))) return "fullName";
  return null;
}

function nameFromTokens(tokens: ReadonlySet<string>): FieldKey | null {
  if ([...tokens].some((t) => NOT_PERSON_NAME_TOKENS.has(t))) return null;
  const has = (set: ReadonlySet<string>) => [...tokens].some((t) => set.has(t));
  if (has(LAST_NAME_TOKENS)) return "lastName";
  if (has(FIRST_NAME_TOKENS)) return "firstName";
  if (has(FULL_NAME_TOKENS) || has(KANA_TOKENS)) return "fullName";
  return null;
}

/** 氏名の欄がフリガナ用かどうか */
function isKana(field: FieldDescriptor): boolean {
  if (KANA_TEXT.test(`${field.label} ${field.ariaLabel} ${field.nearbyText} ${field.placeholder}`)) return true;
  if (field.placeholder && KANA_ONLY.test(field.placeholder)) return true;
  return [...identTokens(field)].some((t) => KANA_TOKENS.has(t));
}

const KANA_VARIANT: Partial<Record<FieldKey, FieldKey>> = {
  lastName: "lastNameKana",
  firstName: "firstNameKana",
  fullName: "fullNameKana",
};

const ROMAN_VARIANT: Partial<Record<FieldKey, FieldKey>> = {
  lastName: "lastNameRoman",
  firstName: "firstNameRoman",
  fullName: "fullNameRoman",
};

/** ローマ字の手がかり（パスポート記載の氏名は英字） */
const ROMAN_TEXT = /ローマ字|英字|アルファベット|英語表記|romaji|roman|alphabet|旅券|パスポート|passport/i;
const LATIN_ONLY = /^[A-Za-z][A-Za-z\s'-]*$/;

/** 氏名の欄がローマ字用かどうか（カナより優先して判定する） */
function isRoman(field: FieldDescriptor): boolean {
  if (ROMAN_TEXT.test(`${field.label} ${field.ariaLabel} ${field.nearbyText}`)) return true;
  return field.placeholder !== "" && LATIN_ONLY.test(field.placeholder.trim());
}

/** 氏名の項目を、欄の手がかりに応じてローマ字・カナ用に読み替える */
function withNameVariant(key: FieldKey, field: FieldDescriptor): FieldKey {
  if (isRoman(field)) return ROMAN_VARIANT[key] ?? key;
  if (isKana(field)) return KANA_VARIANT[key] ?? key;
  return key;
}

/** name / id 属性を単語に分ける（sei_kana → sei, kana / lastName → last, name / tel2 → tel, 2） */
function identTokens(field: FieldDescriptor): Set<string> {
  const raw = `${field.name} ${field.htmlId}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .toLowerCase();
  return new Set(raw.split(/[^a-z0-9]+/).filter(Boolean));
}

/** 「必須」「※」や括弧書きの注記を除く */
function stripNotes(text: string): string {
  return text
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/必須|任意|[*＊※]/g, "")
    .replace(/\s+/g, "");
}
