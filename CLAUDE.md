# CLAUDE.md

このファイルは Claude Code がこのリポジトリを扱う際のガイダンスを提供する。
グローバルルール（~/.claude/CLAUDE.md）と重複する内容は書かない。

## リポジトリ概要

どんなWebフォームでも入力項目を読み取り、保存済みプロフィールから個人情報を自動入力するChrome拡張（Manifest V3）。
項目判定はルールベース＋TypeSafe Jev（Choice質問・confidence判定）の2段構え。
技術スタック: TypeScript（strict）/ Vite + CRXJS / Vitest

## コマンド

<!-- 実装フェーズで確定後に記載 -->

## アーキテクチャ / ディレクトリ構造

<!-- 設計フェーズで確定後に記載 -->

## プロジェクト固有ルール

- **個人情報の値は外部に送らない**: Jevに送るのはフィールドのメタ情報（ラベル・name・placeholder等）のみ。値の流し込みは拡張内で行う
- **プロフィールは `chrome.storage.local` に保存**（`storage.sync` は使わない）。保存処理はリポジトリ層に閉じ込め、後から暗号化を差し込めるようにする
- **Jev APIキーはハードコード禁止**: オプション画面でユーザーが入力し `chrome.storage.local` に保存。API呼び出しは service worker から行う
- Jevは日本語精度が英語より劣り、カウントも苦手 → 確定的に判定できる項目はルールで処理し、分割フィールドの順序などはコード側で扱う
- **エントリファイル名を重複させない**: CRXJS はチャンクをファイル名で解決するため、`background/index.ts` と `content/index.ts` のように basename が同じだと service worker のローダーが別エントリを読み込む（アイコンを押しても何も起きない症状になる）。エントリは `service-worker.ts` / `content-script.ts` のように一意な名前にする
