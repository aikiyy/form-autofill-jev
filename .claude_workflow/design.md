# 設計 — form-autofill-jev

作成日: 2026-09-24

入力: requirements.md

## 調査で確定した前提
- Jev API: `POST https://api.typesafe.ai/v1/systemone`、model `jev-latest`（=jev-1.13.0）。`state` に JSON オブジェクトを直接渡せる。Choice は最大255択、`criteria` に選択肢ごとの説明を付けられる
- Choice のレスポンス: `answers[id] = { choice, probabilities, confidence(0〜1) }`。エラーは 401 / 422 / 429 / 529
- 公式の目安: confidence 0.85 以上なら重要な操作も自動実行可
- JS SDK `@typesafe-ai/sdk@0.6.0` は依存パッケージなし・fetch ベースで、`dangerouslyAllowBrowser: true` を渡せばブラウザで動く（client.ts で確認済み）。CORS も許可されている
- `@crxjs/vite-plugin@2.7.1` は Vite 3〜8 に対応し、メンテも継続中 → 要件どおり CRXJS を採用

## アーキテクチャ

```
[アイコンクリック]
   │ background (service worker)
   ├─ chrome.scripting.executeScript で content script を注入（activeTab 権限）
   │
   │ content script
   ├─ ① scan: 入力欄を収集 → 各要素に data-afj-id を付与し、FieldDescriptor[]（メタ情報のみ）を作る
   ├─ ② sendMessage({type:"classify", fields}) → background へ
   │
   │ background
   ├─ ③ rules: ルールで判定できる欄を確定
   ├─ ④ jev: 残った欄を1リクエストで Choice 判定（APIキーがない／失敗したときはスキップ）
   ├─ ⑤ resolve: 判定結果＋プロフィール → FillInstruction[]（分割・整形・閾値による振り分け）
   │     └ 返す値は拡張の内部メッセージとして渡すだけで、外部には出ない
   │
   │ content script
   └─ ⑥ fill: 値を入力＋ハイライト（緑／黄）＋トーストで件数を表示
```

content script は DOM の操作だけを担当し、判断はすべて background で行う。判定ロジックは `core/` に純粋関数としてまとめ、テストしやすくする。

## ディレクトリ構成
```
src/
  manifest.ts            CRXJS defineManifest（activeTab, scripting, storage, host: api.typesafe.ai）
  background/index.ts    onClicked → 注入、classify メッセージの処理（③〜⑤の呼び出し）
  content/index.ts       ①②⑥ の実行（background から ?script import で動的注入）
  core/                  ※chrome API・DOM に依存しない純粋ロジック
    types.ts             ProfileKey, FieldKey, FieldDescriptor, Assignment, FillInstruction
    rules.ts             classifyByRules(desc) → Assignment | null
    jev.ts               buildJevRequest(descs) / parseJevResponse(res) → Assignment[]
    resolve.ts           resolveFills(descs, assignments, profile) → FillInstruction[]
    format.ts            カナ⇔ひらがな・全角/半角・ハイフン・select/radio の選択肢照合
  dom/
    scan.ts              scanFields(document) → FieldDescriptor[]
    fill.ts              applyFill(instr) ／ highlight
    toast.ts             結果トースト（Shadow DOM で表示し、ページの CSS と干渉させない）
  storage/repository.ts  chrome.storage.local に触るのはこのモジュールだけ（後で暗号化を差し込む場所）
  options/               index.html + main.ts（プロフィール・APIキーの編集。Tailwind v4）
scripts/jev-spike.ts     Jev の日本語精度を早い段階で検証するスクリプト（.env の APIキーを使用）
test/fixtures/forms/     日本語フォームパターンの HTML（テスト兼手動確認用）
```

## 主要な設計判断

### 1. FieldDescriptor（外部に送るのはこれだけ）
`{ id, tag, type, name, htmlId, autocomplete, label, placeholder, ariaLabel, nearbyText, options?: string[], maxLength?, index }`
- label の解決順: `label[for]` → 要素を囲む label → `aria-labelledby` → 同じ行の `th`/`dt` → 直前のテキスト（日本語フォームはテーブルレイアウトが多いため）
- radio は name ごとにまとめて1件とし、選択肢のテキストを `options` に入れる
- 対象外: password / hidden / file / submit / button / disabled / readonly / 非表示要素

### 2. FieldKey（判定の選択肢）
`lastName, firstName, fullName, lastNameKana, firstNameKana, fullNameKana, email, tel, postalCode, prefecture, city, street, building, address（都道府県以降の全部）, birthDate, gender, none`
- **分割欄は選択肢に含めない**。電話番号の3欄にはどれも `tel` を付け、何番目の欄かはコード（resolve）が並び順で決める（Jev は数えるのが苦手なため）
- 生年月日の年/月/日の select も同様に `birthDate` で統一し、options の中身（1〜12 → 月、1900〜 → 年）から役割を決める

### 3. ルール判定（rules.ts）— confidence 1.0 として扱う
1. `autocomplete` 属性を対応表で変換（family-name, given-name, name, email, tel, tel-area-code 系, postal-code, address-level1/2, address-line1/2, bday 系, sex）
2. name / htmlId / label / placeholder の正規表現（日本語＋英語）。例: `/(フリガナ|ふりがな|カナ|kana)/` と 姓・名 の組み合わせ、`/(〒|郵便番号|zip|postal)/`、`/都道府県|pref/`
3. 判定があいまいになる組み合わせは、ルールでは確定させず Jev に回す

### 4. Jev 判定（jev.ts）
- SDK の `TypeSafeClient({ apiKey, dangerouslyAllowBrowser: true, timeout: 2500 })` を使う。APIキーはユーザー自身のものを自分のブラウザ内だけで使うので、この警告が想定するリスク（第三者へのキー漏洩）には当たらない
- `state = { pageTitle, fields: FieldDescriptor[] }`（周りの欄との関係も判断材料になるよう、全欄を渡す）
- 未判定の欄ごとに `choice(\`Which profile item should be entered into field "${id}"?\`, criteria)` を1問ずつ作る。criteria には各 FieldKey の日本語＋英語の説明を付ける
- 閾値: **confidence ≥ 0.85 かつ choice ≠ none → 入力**／それ以外で choice ≠ none → **黄（要確認）**／none → 何もしない。閾値は定数にしておき、spike と実際のフォームで調整する

### 5. resolve / format（誤入力0件の要）
- 同じ key が連続する欄をグループ化し、分割入力する（tel 3欄、postalCode 2欄、birthDate 3欄）
- 整形のヒントは label / placeholder / maxLength から取る: ハイフンの有無、全角/半角、ふりがな（ひらがな）かフリガナ（カタカナ）か
- select / radio は option のテキストで照合する（都道府県名、「1」「01」「1月」、男性/男/male/M）。一致するものがなければ入力せず黄
- 値が空のプロフィール項目は入力しない

### 6. 入力（fill.ts）
- `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` で値を設定し、`input` → `change` → `blur` イベントを発火（React/Vue 対策）
- select は value を設定して change、radio は click
- ハイライトは要素の `outline` を直接指定する（ページの CSS に干渉しないため）

### 7. エラーハンドリング
- APIキー未設定 → ルール判定分だけ入力し、トーストで「APIキー未設定のためルール判定のみ」と表示
- Jev が 401 / 429 / 529 / タイムアウト → 同じくルール判定分だけ入力し、トーストに理由を表示
- 注入できないページ（chrome:// や Web Store）→ バッジで「×」を表示

## テスト戦略（TDD）
- Vitest ＋ jsdom
- `core/*` は純粋関数なのでユニットテストで網羅する（ルール対応表、分割、整形、Jev のリクエスト構築とレスポンス解析）
- `dom/scan`・`dom/fill` は `test/fixtures/forms/*.html` を jsdom に読み込んでテストする。React 風の setter 監視も検証する
- chrome API は `vi.stubGlobal` で最小限のモックにする。Jev の実 API はユニットテストでは呼ばない
- **早期の spike**: `scripts/jev-spike.ts` でフィクスチャの descriptor を実際の Jev に送り、日本語での精度と confidence の分布を確認してから閾値を決める

## リスク
- CRXJS の `?script` による動的注入が期待どおり動くか → 最初の雛形タスクで検証する。ダメなら manifest の `web_accessible_resources` とビルドの出力パスを使う方式に切り替える
- Jev の日本語精度が想定より低い → ルールを厚くし、閾値を上げる
