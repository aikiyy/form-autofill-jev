import contentScript from "../content/index.ts?script&iife";
import { injectContentScript } from "./inject.ts";

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void injectContentScript(tab.id, contentScript);
});
