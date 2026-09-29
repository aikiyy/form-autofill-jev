import "./style.css";
import type { Profile } from "../core/types.ts";
import { EMPTY_PROFILE, getApiKey, getProfile, saveApiKey, saveProfile } from "../storage/repository.ts";
import { normalizeProfile, validateProfile } from "./form.ts";

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
    const [profile, apiKey] = await Promise.all([getProfile(), getApiKey()]);
    writeForm(profile, apiKey);
  } catch (error) {
    console.error(error);
    showStatus("保存済みの設定を読み込めませんでした", "error");
  }
}

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
      await Promise.all([saveProfile(profile), saveApiKey(control("apiKey").value)]);
      writeForm(await getProfile(), await getApiKey());
      showStatus("保存しました", "ok");
    } catch (error) {
      console.error(error);
      showStatus("保存できませんでした", "error");
    }
  })();
});

void load();
