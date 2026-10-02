import type { FillAfterUnlockMessage, VaultStateChangedMessage } from "../core/messages.ts";
import { WrongPassphraseError } from "../storage/crypto.ts";

/** 外部とのやり取り（テストで差し替える） */
export interface UnlockDeps {
  unlock(passphrase: string): Promise<void>;
  /** ポップアップを開いたタブの ID（取れなければ undefined） */
  activeTabId(): Promise<number | undefined>;
  sendMessage(message: FillAfterUnlockMessage | VaultStateChangedMessage): Promise<unknown>;
}

export type UnlockResult = { ok: true } | { ok: false; message: string };

/**
 * パスフレーズで解除し、そのまま今のタブで自動入力を続けるよう background に頼む。
 * @returns パスフレーズ違いなどの失敗はメッセージ付きで返す（throw しない）
 */
export async function unlockAndFill(passphrase: string, deps: UnlockDeps): Promise<UnlockResult> {
  if (passphrase === "") return { ok: false, message: "パスフレーズを入力してください" };
  try {
    await deps.unlock(passphrase);
  } catch (error) {
    if (error instanceof WrongPassphraseError) return { ok: false, message: "パスフレーズが違います" };
    console.error("[form-autofill] 解除できませんでした", error);
    return { ok: false, message: "解除できませんでした" };
  }
  const tabId = await deps.activeTabId();
  await deps.sendMessage(tabId === undefined ? { type: "vaultStateChanged" } : { type: "fillAfterUnlock", tabId });
  return { ok: true };
}
