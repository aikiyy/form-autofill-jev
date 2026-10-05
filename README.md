# Form Autofill (Jev)

Webフォームの入力欄を読み取り、保存しておいたプロフィールから個人情報を自動入力する Chrome 拡張です。

- 拡張アイコンを1回押すと、表示中のページのフォームに入力します
- 欄の判定は、`autocomplete` 属性やラベルによるルールと、[TypeSafe](https://docs.typesafe.ai/introduction) の判定モデル Jev の2段階で行います
- 日本語のフォームに合わせています。フリガナとふりがなの使い分け、電話番号・郵便番号・生年月日の分割欄、都道府県の select、全角・半角の指定に対応します
- 間違った値を入れないことを優先します。判定に自信がない欄、選択肢が一致しない欄は入力せず、黄色で知らせます

## 入力できる項目

| 分類 | 項目 |
|---|---|
| 氏名 | 姓・名・氏名（1欄）、フリガナ（カタカナ/ひらがな）、ローマ字（パスポート表記） |
| 連絡先 | メールアドレス（確認用の欄も含む）、電話番号（1欄/3分割、ハイフンの有無、国番号 +81 の欄では先頭の 0 を省略） |
| 住所 | 郵便番号（1欄/3桁+4桁）、都道府県（入力欄/select）、市区町村、番地、建物名、住所（1欄） |
| 属性 | 生年月日（1欄/年月日の分割欄/select）、年齢（生年月日から計算）、性別（radio/select） |
| パスポート | 旅券番号、有効期限 |

保護者・同行者・緊急連絡先など、本人以外の人の情報を入れる欄には入力しません。

## プライバシー

- プロフィールは、このブラウザの `chrome.storage.local` にだけ保存します。Google アカウントとの同期はしません
- Jev に送るのは、入力欄のメタ情報（ラベル・`name` 属性・placeholder・選択肢の文字など）だけです。プロフィールの値は送りません。値を入れる処理は拡張の中で行います
- 設定画面で、プロフィールと APIキーをパスフレーズで暗号化できます（任意）
  - PBKDF2-SHA256（60万回）で鍵を作り、AES-GCM（256bit）で暗号化します。Web Crypto API だけを使い、外部ライブラリは使いません
  - ロックの解除は、ブラウザを閉じるまで有効です。ロック中にアイコンを押すと、パスフレーズを入れるポップアップが開きます
  - パスフレーズを忘れると、保存したデータは復元できません
- 拡張が要求する権限は `activeTab`・`scripting`・`storage` と、Jev の API（`https://api.typesafe.ai/*`）への通信だけです。アイコンを押したタブでだけ動きます

## インストール

Chrome ウェブストアには公開していません。ソースからビルドして読み込みます。

必要なもの:

- Node.js 24 以上
- Google Chrome
- TypeSafe の APIキー（任意）。[ダッシュボード](https://console.typesafe.ai/keys)で発行します。なくても、ラベルなどから確実に判断できる欄は入力します

```sh
git clone <このリポジトリのURL>
cd form-autofill-jev
npm install
npm run build
```

1. Chrome で `chrome://extensions` を開き、右上の「デベロッパーモード」をオンにする
2. 「パッケージ化されていない拡張機能を読み込む」で `dist/` フォルダを選ぶ
3. ツールバーに拡張アイコンをピン留めする

## 使い方

1. 拡張アイコンを右クリックし、「オプション」で設定画面を開く
2. プロフィールを入力して保存する
   - 電話番号はハイフン区切りで入力してください（例: `03-1234-5678`）。市外局番の桁数は地域で違うので、分割欄にはこの区切り位置で入れます
   - Jev を使う場合は APIキーも入力します
3. フォームのあるページで拡張アイコンを押す

入力後、欄の色と右下の表示で結果が分かります。

- 緑: 入力した欄
- 黄: 入力しなかった欄。判定に自信がない、選択肢に該当がない、書式（半角カナ等）に対応していないなどの理由です。自分で確認してください

送信はしません。内容を確認してから、自分で送信してください。

## 仕組み

```
アイコンを押す
  → background が表示中のタブに content script を注入
  → content script が入力欄を読み取り、メタ情報を作る（src/dom/scan.ts）
  → background で判定
      1. ルール: autocomplete・ラベル・name 属性（src/core/rules.ts）
      2. 残った欄だけ Jev の Choice 質問で判定（src/core/jev.ts）。確信度 0.85 以上で採用
      3. 分割欄の振り分け・書式の調整・選択肢との照合（src/core/resolve.ts, format.ts）
  → content script が値を入れ、ハイライトと結果を表示（src/dom/fill.ts, toast.ts）
```

- 分割欄（電話番号の3欄など）には全欄に同じ項目を割り当て、何番目かはコードが出現順で決めます
- React / Vue などで作られたフォームにも反映されるよう、ネイティブの value setter で値を入れてから `input`・`change` イベントを発火します
- APIキーが未設定のとき、Jev の通信に失敗したときも、ルールで判定できた欄は入力します

## 開発

```sh
npm test            # ユニットテスト（Vitest）
npm run typecheck   # 型チェック
npm run build       # 型チェックとビルド（dist/ に出力）
npm run fixtures    # test/fixtures/forms/ を http://localhost:8765 で配信（Chrome での手動確認用）
npm run spike       # フィクスチャの全欄を Jev だけで判定し、正解率を表示（実際に API を呼ぶ）
npm run icons       # public/icons/icon.svg から PNG アイコンを生成
```

`npm run spike` を使うには、リポジトリ直下に `.env` を作り、APIキーを書きます（`.env` は Git の管理対象外です）。

```
TYPESAFE_API_KEY=発行したキー
```

### ディレクトリ

| パス | 内容 |
|---|---|
| `src/core/` | 判定・整形のロジック。chrome API と DOM に依存しない |
| `src/dom/` | content script 側の DOM 操作（読み取り・入力・結果表示） |
| `src/background/` | service worker（注入、判定の呼び出し、ロック中のポップアップ切り替え） |
| `src/storage/` | `chrome.storage` の読み書きと暗号化 |
| `src/options/` | 設定画面 |
| `src/popup/` | ロック中だけ使う解除ポップアップ |
| `test/fixtures/forms/` | 実際のフォームの構造を再現したテスト用 HTML |
| `test/fixtures/expected.ts` | フィクスチャの欄ごとの正解（テストと spike で共有） |

### テスト

- フィクスチャの全欄について、ルールの判定結果が「判定なし」か「正解」のどちらかになることを確かめるテストがあります。項目やルールを追加したときに、誤判定が入ったことを検出できます
- 入力欄の対応を増やすときは、そのフォームの構造をフィクスチャとして追加し、`expected.ts` に正解を書いてください。実在の個人情報やサイトの HTML をそのまま入れず、構造だけを再現してください

## 制限

- iframe の中、Shadow DOM の中のフォームには対応していません
- 複数のプロフィールの切り替えはできません
- 年齢は今日の日付で計算します。「公演日時点の年齢」のように基準日が指定された欄では、ずれることがあります
- ローマ字の氏名が1欄の場合は、姓名の順序の手がかり（「姓 名の順」「Last / First」など）があるときだけ入力します
- Jev は英語が最も得意です。日本語の欄は英語より精度が下がる可能性があるため、日本語でよく使う表記はルールで判定しています
- ビルドツール（CRXJS）の仕様で、content script が `web_accessible_resources` に含まれます。このため、ページ側からこの拡張が入っていることを検知できます

## 技術スタック

TypeScript（strict）/ Vite + [CRXJS](https://crxjs.dev/vite-plugin) / Manifest V3 / Vitest / Tailwind CSS v4 / [@typesafe-ai/sdk](https://docs.typesafe.ai/sdk/javascript)
