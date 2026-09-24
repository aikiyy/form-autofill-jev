# 要件定義 — form-autofill-jev

作成日: 2026-09-24

## 1. 目的
任意のWebフォームで、拡張アイコンを1クリックするだけで自分の個人情報を正しい欄に入力する。

## 2. スコープ（MVP）

**プロフィール項目（1件のみ保持）**
| 分類 | 項目キー |
|---|---|
| 氏名 | lastName, firstName, fullName（結合で生成） |
| フリガナ | lastNameKana, firstNameKana（カタカナ保存。ひらがな欄には変換して入力） |
| 連絡先 | email, tel（ハイフンなし保存。1欄/3分割/ハイフン有無に対応） |
| 住所 | postalCode（1欄/3+4分割）, prefecture, city, street（番地）, building |
| 属性 | birthDate（YYYY-MM-DD保存。1欄/年月日分割・select対応）, gender |

**機能**
- F1 プロフィール編集画面（options page）: 上記項目の入力・保存・編集
- F2 Jev APIキー設定: options page で入力・保存（コードにハードコードしない）
- F3 自動入力: 拡張アイコンクリックで、現在タブのフォームを解析 → 判定 → 入力
- F4 判定は2段構え
  1. ルール判定: `autocomplete` 属性・name/id/label の正規表現（日本語・英語）で確定できる欄を決める
  2. Jev判定: 残った欄を1リクエストにまとめて Choice 質問（選択肢＝プロフィール項目キー＋`none`）
- F5 確信度による振り分け: 高確信 → 入力して緑ハイライト／低確信 → 入力せず黄ハイライト
- F6 入力後の通知: 入力した欄数・要確認欄数をバッジまたはページ内トーストで表示
- F7 React/Vue 等の制御コンポーネントでも値が反映される（native setter＋input/change イベント発火）

**対象要素**: `input`（text/email/tel/date/radio 等）, `select`, `textarea`。password/hidden/file/送信ボタン系は対象外。

## 3. 非機能要件
- **プライバシー**: Jev に送るのはフィールドのメタ情報（label, name, id, placeholder, autocomplete, type, 周辺テキスト, 選択肢テキスト）のみ。プロフィールの値は外部送信しない
- **保存**: プロフィール・APIキーは `chrome.storage.local`（同期しない）。MVPは平文、保存処理を1モジュールに閉じ込め後から暗号化を差し込める構造にする
- **権限最小化**: `activeTab` + `scripting` + `storage` ＋ Jev API の host permission のみ。全サイトへの常駐 content script は入れない
- **フォールバック**: APIキー未設定・Jev通信失敗時もルール判定分だけは入力する
- **性能**: クリックから入力完了まで目安3秒以内
- **技術**: TypeScript strict / Vite + CRXJS / Manifest V3 / Vitest（TDD）

## 4. スコープ外（MVP後）
プロフィール複数・暗号化・ショートカット/自動トリガー・勤務先項目・iframe内フォーム・Shadow DOM・複数ページにまたがるフォームの記憶・送信の自動化

## 5. 成功基準
- 自分がよく使う日本語フォーム5種以上（通販会員登録・問い合わせ・予約など）で、対象項目の9割以上が正しく入力され、誤入力0件（迷ったら入力せず黄色にする）
- 分割電話番号・分割郵便番号・都道府県select・生年月日select・カナ/ひらがな欄が正しく入る
- APIキーなしでもルール判定分は動く
- 判定ロジック（ルール判定・値の整形・Jevレスポンスの振り分け）がユニットテストで担保されている

## 6. 前提・リスク
- Jev は日本語精度が英語より劣る（公式記載）→ ルール判定を厚くし、confidence閾値で誤入力を防ぐ
- Jev は数えるのが苦手 → 分割欄の順序（何番目か）はコードで決める
- `@typesafe-ai/sdk` は Node 20+ 想定の記載あり → service worker で動くかは設計フェーズで検証（ダメなら fetch で直接 `POST https://api.typesafe.ai/v1/systemone`）
- Jev のレート制限は変動する旨の記載あり（個人利用なら影響小）
