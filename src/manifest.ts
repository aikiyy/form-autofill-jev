import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

const icons = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png",
};

export default defineManifest({
  manifest_version: 3,
  name: "Form Autofill (Jev)",
  version: pkg.version,
  description: pkg.description,
  permissions: ["activeTab", "scripting", "storage"],
  host_permissions: ["https://api.typesafe.ai/*"],
  background: { service_worker: "src/background/service-worker.ts", type: "module" },
  icons,
  action: { default_title: "このページのフォームに自動入力", default_icon: icons },
  options_page: "src/options/index.html",
});
