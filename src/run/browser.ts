import { type Browser, chromium } from "playwright";

import type { Config } from "../config/env.js";

/** Lazily launches one shared Chromium and hands out isolated contexts per run. */
export class BrowserPool {
  private browser: Browser | undefined;
  private launching: Promise<Browser> | undefined;

  constructor(private readonly config: Config) {}

  async get(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching !== undefined) return this.launching;
    const launching = chromium
      .launch({ args: this.config.chromiumArgs })
      .then((browser) => {
        this.browser = browser;
        this.launching = undefined;
        return browser;
      })
      .catch((error: unknown) => {
        this.launching = undefined;
        throw error;
      });
    this.launching = launching;
    return launching;
  }

  async ready(): Promise<boolean> {
    try {
      await this.get();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    if (browser !== undefined) await browser.close();
  }
}
