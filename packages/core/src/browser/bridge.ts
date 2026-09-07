import http from "node:http";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import type { SelectedElement, ScenarioStep } from "@react-surgeon/shared";
import { Workspace } from "../security/workspace.js";
export class Bridge extends EventEmitter {
  token = randomBytes(24).toString("hex");
  selected?: SelectedElement;
  recording: ScenarioStep[] = [];
  private server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  private wss = new WebSocketServer({ noServer: true, maxPayload: 32000 });
  constructor(
    private ws: Workspace,
    public port = 18080,
    private appURL = "http://127.0.0.1:5173",
  ) {
    super();
  }
  async start() {
    this.server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
      if (
        url.searchParams.get("token") !== this.token ||
        req.headers.origin !== new URL(this.appURL).origin
      ) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (client) =>
        this.wss.emit("connection", client, req),
      );
    });
    this.wss.on("connection", (client) =>
      client.on("message", (raw) => {
        void this.receive(raw.toString()).catch((e) =>
          this.emit("bridgeError", e),
        );
      }),
    );
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "127.0.0.1", resolve);
    });
  }
  private async receive(raw: string) {
    const m = JSON.parse(raw);
    if (m.type === "selection") {
      const s = m.selection as SelectedElement;
      if (
        typeof s.file !== "string" ||
        !Number.isInteger(s.line) ||
        s.line < 1 ||
        typeof s.text !== "string" ||
        s.text.length > 2000
      )
        throw new Error("Invalid source selection");
      await this.ws.resolve(s.file);
      this.selected = s;
      this.emit("selection", s);
    } else if (
      m.type === "recording" &&
      Array.isArray(m.steps) &&
      m.steps.length <= 200
    ) {
      this.recording = m.steps;
      this.emit("recording", m.steps);
    }
  }
  send(type: string) {
    for (const client of this.wss.clients)
      if (client.readyState === WebSocket.OPEN)
        client.send(JSON.stringify({ type }));
  }
  async stop() {
    for (const c of this.wss.clients) c.terminate();
    this.wss.close();
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}
