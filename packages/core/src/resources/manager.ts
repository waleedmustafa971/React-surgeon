import os from "node:os";
import type { ModelProvider } from "@react-surgeon/shared";
export class ResourceManager {
  browser = false;
  vite = false;
  private active = false;
  constructor(public model: ModelProvider) {}
  async status() {
    return {
      memoryMode: "LOW",
      totalGB: +(os.totalmem() / 2 ** 30).toFixed(2),
      freeGB: +(os.freemem() / 2 ** 30).toFixed(2),
      model: (await this.model.isRunning()) ? "RUNNING" : "STOPPED",
      browser: this.browser ? "RUNNING" : "STOPPED",
      vite: this.vite ? "RUNNING" : "STOPPED",
      agents: 1,
    };
  }
  async runtime<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active) throw new Error("A verification phase is already active");
    this.active = true;
    try {
      await this.model.stop();
      this.browser = true;
      return await fn();
    } finally {
      this.browser = false;
      this.active = false;
    }
  }
}
