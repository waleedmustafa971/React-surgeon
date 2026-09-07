import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { localURL } from "../browser/scenario.js";
export async function modelControl(root: string, stop: () => Promise<void>) {
  const token = randomBytes(24).toString("hex");
  const file = path.join(root, ".react-surgeon/model-control.json");
  const server = http.createServer((req, res) => {
    if (
      req.method !== "POST" ||
      req.url !== "/stop" ||
      req.headers.authorization !== `Bearer ${token}`
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.end("stopping");
    void stop();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Control listener failed");
  await fs.writeFile(
    file,
    JSON.stringify({ url: `http://127.0.0.1:${address.port}/stop`, token }),
  );
  return async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await fs.unlink(file).catch(() => {});
  };
}
export async function stopModel(root: string) {
  const saved = JSON.parse(
    await fs.readFile(
      path.join(root, ".react-surgeon/model-control.json"),
      "utf8",
    ),
  );
  const url = localURL(saved.url);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${saved.token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Model control refused the stop request");
}
