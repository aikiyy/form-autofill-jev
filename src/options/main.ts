import "./style.css";
import type { Profile } from "../core/types.ts";
import type { VaultStateChangedMessage } from "../core/messages.ts";
import { WrongPassphraseError } from "../storage/crypto.ts";
import {
  changePassphrase,
  disableEncryption,
  EMPTY_PROFILE,
  enableEncryption,
  getApiKey,
  getProfile,
  getVaultState,
  resetVault,
  saveApiKey,
  saveProfile,
  unlock,
  type VaultState,
} from "../storage/repository.ts";
import { normalizeProfile, validatePassphrase, validateProfile } from "./form.ts";

const form = document.querySelector<HTMLFormElement>("#settings")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const PROFILE_KEYS = Object.keys(EMPTY_PROFILE) as (keyof Profile)[];

function control(name: string): HTMLInputElement | HTMLSelectElement {
  const el = form.elements.namedItem(name);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) throw new Error(`missing field: ${name}`);
  return el;
}

function showStatus(message: string, kind: "ok" | "error"): void {
  status.textContent = message;
  status.className = `text-sm ${kind === "ok" ? "text-green-700" : "text-red-600"}`;
}

function clearErrors(): void {
  for (const el of form.querySelectorAll("[data-error]")) el.remove();
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
}

function showError(key: keyof Profile, message: string): void {
  const el = control(key);
  el.setAttribute("aria-invalid", "true");
  const note = document.createElement("span");
  note.dataset["error"] = "";
  note.className = "mt-1 block text-xs text-red-600";
  note.textContent = message;
  el.insertAdjacentElement("afterend", note);
}

function readForm(): Profile {
  const profile = { ...EMPTY_PROFILE };
  for (const key of PROFILE_KEYS) (profile as Record<string, string>)[key] = control(key).value;
  return profile;
}

function writeForm(profile: Profile, apiKey: string): void {
  for (const key of PROFILE_KEYS) control(key).value = profile[key];
  control("apiKey").value = apiKey;
}

async function load(): Promise<void> {
  try {
    const state = await getVaultState();
    renderVault(state);
    if (state === "locked") return; // 解除するまでプロフィールは読めない
    const [profile, apiKey] = await Promise.all([getProfile(), getApiKey()]);
    writeForm(profile, apiKey);
  } catch (error) {
    console.error(error);
    showStatus("保存済みの設定を読み込めませんでした", "error");
  }
}

// ---- 暗号化 ----

const vaultStatus = document.querySelector<HTMLParagraphElement>("#vault-status")!;
const panels: Record<VaultState, HTMLElement> = {
  plain: document.querySelector("#vault-plain")!,
  locked: document.querySelector("#vault-locked")!,
  unlocked: document.querySelector("#vault-unlocked")!,
};
const resetConfirm = document.querySelector<HTMLElement>("#reset-confirm")!;

/** 状態に合ったパネルだけを表示し、ロック中はプロフィール欄を隠す */
function renderVault(state: VaultState): void {
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== state;
  form.hidden = state === "locked";
  resetConfirm.hidden = true;
}

function showVaultStatus(message: string, kind: "ok" | "error"): void {
  vaultStatus.textContent = message;
  vaultStatus.className = `text-sm ${kind === "ok" ? "text-green-700" : "text-red-600"}`;
}

function field(formEl: HTMLFormElement, name: string): HTMLInputElement {
  const el = formEl.elements.namedItem(name);
  if (!(el instanceof HTMLInputElement)) throw new Error(`missing field: ${name}`);
  return el;
}

/** アイコンの動作（解除ポップアップの有無）を background に切り替えてもらう */
function notifyVaultChanged(): void {
  const message: VaultStateChangedMessage = { type: "vaultStateChanged" };
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

/**
 * 暗号化まわりのフォームを処理する共通部分。成功したら画面を読み直し、パスワード欄を空にする。
 * 鍵導出（60万回）に時間がかかるので、処理中はボタンを押せないようにする。
 */
function onVaultSubmit(formEl: HTMLFormElement, action: () => Promise<string | null>): void {
  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const button = formEl.querySelector<HTMLButtonElement>("button[type=submit]");
      if (button) button.disabled = true;
      showVaultStatus("処理中…", "ok");
      try {
        const message = await action();
        if (message === null) return;
        formEl.reset();
        notifyVaultChanged();
        await load();
        showVaultStatus(message, "ok");
      } catch (error) {
        if (error instanceof WrongPassphraseError) {
          showVaultStatus("パスフレーズが違います", "error");
        } else {
          console.error(error);
          showVaultStatus("処理できませんでした", "error");
        }
      } finally {
        if (button) button.disabled = false;
      }
    })();
  });
}

const enableForm = document.querySelector<HTMLFormElement>("#enable-form")!;
onVaultSubmit(enableForm, async () => {
  const passphrase = field(enableForm, "passphrase").value;
  const error = validatePassphrase(passphrase, field(enableForm, "confirmation").value);
  if (error) {
    showVaultStatus(error, "error");
    return null;
  }
  await enableEncryption(passphrase);
  return "暗号化しました";
});

const unlockForm = document.querySelector<HTMLFormElement>("#unlock-form")!;
onVaultSubmit(unlockForm, async () => {
  await unlock(field(unlockForm, "passphrase").value);
  return "解除しました";
});

const changeForm = document.querySelector<HTMLFormElement>("#change-form")!;
onVaultSubmit(changeForm, async () => {
  const passphrase = field(changeForm, "passphrase").value;
  const error = validatePassphrase(passphrase, field(changeForm, "confirmation").value);
  if (error) {
    showVaultStatus(error, "error");
    return null;
  }
  await changePassphrase(field(changeForm, "current").value, passphrase);
  return "パスフレーズを変更しました";
});

const disableForm = document.querySelector<HTMLFormElement>("#disable-form")!;
onVaultSubmit(disableForm, async () => {
  await disableEncryption(field(disableForm, "passphrase").value);
  return "暗号化をやめました（平文で保存しています）";
});

document.querySelector("#reset-open")!.addEventListener("click", () => {
  resetConfirm.hidden = false;
});
document.querySelector("#reset-cancel")!.addEventListener("click", () => {
  resetConfirm.hidden = true;
});
document.querySelector("#reset-run")!.addEventListener("click", () => {
  void (async () => {
    try {
      await resetVault();
      notifyVaultChanged();
      await load();
      writeForm({ ...EMPTY_PROFILE }, "");
      showVaultStatus("初期化しました。プロフィールを入力し直してください", "ok");
    } catch (error) {
      console.error(error);
      showVaultStatus("初期化できませんでした", "error");
    }
  })();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    clearErrors();
    const profile = normalizeProfile(readForm());
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      for (const e of errors) showError(e.key, e.message);
      showStatus("入力内容を確認してください", "error");
      return;
    }
    try {
      await saveProfile(profile);
      await saveApiKey(control("apiKey").value);
      writeForm(await getProfile(), await getApiKey());
      showStatus("保存しました", "ok");
    } catch (error) {
      console.error(error);
      showStatus("保存できませんでした", "error");
    }
  })();
});

void load();
