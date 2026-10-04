/** 性別。未設定は空文字。 */
export type Gender = "male" | "female" | "other" | "";

/**
 * 保存するプロフィール（1件のみ）。
 * 値はすべて正規化した形で保存し、フォームに合わせた整形は入力時に行う。
 */
export interface Profile {
  lastName: string;
  firstName: string;
  /** カタカナで保存する */
  lastNameKana: string;
  /** カタカナで保存する */
  firstNameKana: string;
  email: string;
  /**
   * ハイフン区切りで保存（例: 090-1234-5678, 045-123-4567）。
   * 市外局番の桁数は地域で違うため、分割欄への入力にはユーザーが書いた区切り位置を使う
   */
  tel: string;
  /** 7桁。ハイフンの有無は問わない（例: 150-0001） */
  postalCode: string;
  /** 都道府県名（例: 東京都） */
  prefecture: string;
  /** 市区町村（例: 渋谷区） */
  city: string;
  /** 町域・番地（例: 神宮前1-2-3） */
  street: string;
  /** 建物名・部屋番号 */
  building: string;
  /** YYYY-MM-DD */
  birthDate: string;
  gender: Gender;
  /** 旅券番号（半角英大文字・数字、例: TK1234567） */
  passportNumber: string;
  /** 旅券の有効期限（YYYY-MM-DD） */
  passportExpiry: string;
  /** パスポート表記のローマ字の姓（半角英大文字、例: YAMADA） */
  lastNameRoman: string;
  /** パスポート表記のローマ字の名（半角英大文字、例: TARO） */
  firstNameRoman: string;
}

export type ProfileKey = keyof Profile;

/**
 * フォームの欄に割り当てる項目の種類（Jev の Choice の選択肢でもある）。
 * 分割欄（電話番号の3欄など）は同じキーを複数の欄に割り当て、何番目かはコードで決める。
 */
export const FIELD_KEYS = [
  "lastName",
  "firstName",
  "fullName",
  "lastNameKana",
  "firstNameKana",
  "fullNameKana",
  "lastNameRoman",
  "firstNameRoman",
  "fullNameRoman",
  "email",
  "tel",
  "postalCode",
  "prefecture",
  "city",
  "street",
  "building",
  "address",
  "birthDate",
  "age",
  "gender",
  "passportNumber",
  "passportExpiry",
  "none",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

/** select の option や radio の選択肢 */
export interface FieldOption {
  value: string;
  text: string;
}

/**
 * フォームの1欄を表すメタ情報。Jev に送るのはこの情報だけで、プロフィールの値は含めない。
 * radio は name ごとにまとめて1件にする。
 */
export interface FieldDescriptor {
  /** 拡張が付与する ID（要素の data-afj-id と対応） */
  id: string;
  tag: "input" | "select" | "textarea";
  /** input の type（select / textarea は tag と同じ値） */
  type: string;
  name: string;
  htmlId: string;
  autocomplete: string;
  /** label・th・dt などから解決したラベル文字列 */
  label: string;
  placeholder: string;
  ariaLabel: string;
  /** 欄の直後にある短いテキスト（「例: 03-1234-5678」「（全角カナ）」など） */
  nearbyText: string;
  options?: FieldOption[];
  maxLength?: number;
  /** 欄の近くに表示された電話の国番号（例: "+81"） */
  dialCode?: string;
  /** ページ内の出現順（0始まり）。分割欄の順序決定に使う */
  index: number;
}

/** 欄に項目を割り当てた判定結果 */
export interface Assignment {
  fieldId: string;
  key: FieldKey;
  /** 0〜1。ルール判定は 1 */
  confidence: number;
  source: "rule" | "jev";
}

/**
 * content script への入力指示。
 * - fill: value を入力して緑でハイライトする
 * - review: 入力せず黄でハイライトする（確信度不足・選択肢が一致しない等）
 */
export type FillInstruction =
  | { fieldId: string; status: "fill"; value: string }
  | { fieldId: string; status: "review"; reason: string };
