# CLAUDE.md

このファイルは Claude Code がこのリポジトリを扱う際のガイダンスを提供する。
グローバルルール（~/.claude/CLAUDE.md）と重複する内容は書かない。

## リポジトリ概要

どんなWebフォームでも入力項目を読み取り、保存済みプロフィールから個人情報を自動入力するChrome拡張（Manifest V3）。
項目判定はルールベース＋TypeSafe Jev（Choice質問・confidence判定）の2段構え。
技術スタック: TypeScript（strict）/ Vite + CRXJS / Vitest / Tailwind CSS v4（設定画面・ポップアップ）

## コマンド

- `npm test` — ユニットテスト（Vitest・jsdom。crypto / repository は `// @vitest-environment node`）
- `npm run typecheck` — 型チェック
- `npm run build` — 型チェック＋ビルド。`dist/` を Chrome の「パッケージ化されていない拡張機能を読み込む」で読み込む
- `npm run fixtures` — `test/fixtures/forms/` を http://localhost:8765 で配信（Chrome での手動確認用）
- `npm run spike` — フィクスチャ全欄を Jev 単独で判定し、正解率と閾値ごとの誤入力数を出す（`.env` の `TYPESAFE_API_KEY` を使用。実 API を呼ぶ）
- `npm run icons` — `public/icons/icon.svg` から PNG アイコンを生成

## アーキテクチャ / ディレクトリ構造

アイコンクリック → background が content script を注入 → content が欄を読み取り（`dom/scan`）→ background でルール判定（`core/rules`）→ 残りを Jev（`core/jev`）→ 値の決定（`core/resolve`）→ content が入力・ハイライト・トースト（`dom/fill`, `dom/toast`）。

- `src/core/` — chrome API・DOM に依存しない純粋ロジック。判断はすべてここ（テストの中心）
- `src/dom/` — content script 側の DOM 操作のみ
- `src/background/` — service worker（注入・判定の呼び出し・ロック中のポップアップ切り替え）
- `src/storage/` — chrome.storage への読み書きはここだけ（`repository.ts`）。暗号化（`crypto.ts`）もここに閉じる
- `src/options/` — 設定画面、`src/popup/` — ロック中だけ使う解除ポップアップ
- `test/fixtures/forms/` — 実フォームの構造を再現した HTML。`test/fixtures/expected.ts` が欄ごとの正解表（spike とテストで共有）
- `.claude_workflow/` — 要件・設計・タスク・完了記録

設計上の要点（コードだけでは読み取りにくいもの）:
- **誤入力 0 件を最優先**。手がかりが食い違う・確信度が閾値（0.85）未満・選択肢が一致しない欄は入力せず黄（要確認）にする
- 分割欄（電話3欄・郵便番号2欄・年月日）は全欄に同じキーを割り当て、何番目かはコードが出現順で決める（Jev は数えるのが苦手）
- 電話番号はプロフィールにハイフン区切りで保存し、その区切り位置で分割する（市外局番の桁数を推測しない）
- 暗号化オン時は local に `vault`（暗号文）だけを置き、解除中の鍵は `chrome.storage.session` に置く。ロック中は `chrome.action.setPopup` で解除ポップアップを出す（ポップアップ設定中は onClicked が発火しない）

## プロジェクト固有ルール

- **個人情報の値は外部に送らない**: Jevに送るのはフィールドのメタ情報（ラベル・name・placeholder等）のみ。値の流し込みは拡張内で行う
- **プロフィールと APIキーは `chrome.storage.local` に保存**（`storage.sync` は使わない）。読み書きは `storage/repository.ts` 経由のみ。書き込みは read-modify-write なので直列化（`serialized`）を通す
- **Jev APIキーはハードコード禁止**: 設定画面でユーザーが入力して保存。API呼び出しは service worker から行う
- **本人以外の人の欄（保護者・同行者・緊急連絡先・受信契約者など）には入力しない**（ルールで none に確定し、Jev の none の説明にも含める）
- **FieldKey やプロフィール項目を追加したら**: フィクスチャと `expected.ts` に欄を足す。「ルールの結果は null か正解のどちらか」のテストが全フィクスチャで誤判定を検出する。select の選択肢は実フォームと同じ全範囲にする（狭いと実データで要確認になる）
- Jevは日本語精度が英語より劣り、カウントも苦手 → 確定的に判定できる項目はルールで処理し、分割フィールドの順序などはコード側で扱う
- ロック中だけ使う `src/popup/unlock.html` は manifest に書かず、`vite.config.ts` の `build.rollupOptions.input` でビルド対象にしている
- **エントリファイル名を重複させない**: CRXJS はチャンクをファイル名で解決するため、`background/index.ts` と `content/index.ts` のように basename が同じだと service worker のローダーが別エントリを読み込む（アイコンを押しても何も起きない症状になる）。エントリは `service-worker.ts` / `content-script.ts` のように一意な名前にする
