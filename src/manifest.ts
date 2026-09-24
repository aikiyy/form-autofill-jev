import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "Form Autofill (Jev)",
  version: pkg.version,
  description: pkg.description,
  permissions: ["activeTab", "scripting", "storage"],
  host_permissions: ["https://api.typesafe.ai/*"],
  background: { service_worker: "src/background/index.ts", type: "module" },
  action: { default_title: "このページのフォームに自動入力" },
  options_page: "src/options/index.html",
});
