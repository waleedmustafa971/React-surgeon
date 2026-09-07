export function overlay(port: number, token: string) {
  return `(${client.toString()})(${JSON.stringify({ port, token })})`;
}
function client(config: { port: number; token: string }) {
  let enabled = false,
    recording = false;
  const steps: unknown[] = [];
  const host = document.createElement("div");
  host.id = "react-surgeon-overlay";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    '<style>:host{all:initial}button{background:#162a38;color:#d5fff1;border:1px solid #4bd6aa;border-radius:6px;padding:9px;cursor:pointer;font:12px system-ui}.bar{position:fixed;bottom:16px;right:16px;z-index:2147483647;display:flex;gap:6px}.box{position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #26d6a1;background:#26d6a122}.status{color:white;background:#162a38;padding:8px;font:12px system-ui}</style><div class="box" hidden></div><div class="bar"><span class="status">React Surgeon</span><button id="select">Select UI</button><button id="record">Record</button></div>';
  document.body.append(host);
  const box = shadow.querySelector<HTMLElement>(".box")!,
    status = shadow.querySelector<HTMLElement>(".status")!;
  const supplied = new URL(location.href).searchParams.get("reactSurgeonToken");
  if (supplied) {
    sessionStorage.setItem("react-surgeon-token", supplied);
    const clean = new URL(location.href);
    clean.searchParams.delete("reactSurgeonToken");
    history.replaceState(null, "", clean);
  }
  const token =
    config.token || sessionStorage.getItem("react-surgeon-token") || "";
  let ws: WebSocket | undefined;
  const set = (on: boolean) => {
    enabled = on;
    box.hidden = true;
    shadow.querySelector("#select")!.textContent = on
      ? "Cancel selection"
      : "Select UI";
  };
  const connect = () => {
    if (!token) {
      status.textContent = "Start Surgeon to connect";
      return;
    }
    ws = new WebSocket(
      "ws://127.0.0.1:" + config.port + "/?token=" + encodeURIComponent(token),
    );
    ws.onopen = () => {
      status.textContent = "Connected";
    };
    ws.onclose = () => {
      status.textContent = "Disconnected";
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "select") set(true);
      if (m.type === "cancel") set(false);
    };
  };
  connect();
  const metadata = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    return {
      role:
        el.getAttribute("role") ||
        (
          {
            button: "button",
            a: "link",
            input: "textbox",
            textarea: "textbox",
            select: "combobox",
          } as Record<string, string>
        )[tag],
      name:
        el.getAttribute("aria-label") ||
        (el instanceof HTMLInputElement
          ? el.labels?.[0]?.textContent
          : el.textContent
        )
          ?.trim()
          .slice(0, 100),
      testId: el.getAttribute("data-testid") || undefined,
      selector: el.hasAttribute("data-react-surgeon-source")
        ? "[data-react-surgeon-source=" +
          JSON.stringify(el.getAttribute("data-react-surgeon-source")) +
          "]"
        : undefined,
    };
  };
  shadow
    .querySelector("#select")!
    .addEventListener("click", () => set(!enabled));
  shadow.querySelector("#record")!.addEventListener("click", () => {
    recording = !recording;
    if (recording) {
      steps.length = 0;
      steps.push({ action: "navigate", url: location.pathname });
    } else ws?.send(JSON.stringify({ type: "recording", steps }));
    shadow.querySelector("#record")!.textContent = recording
      ? "Stop recording"
      : "Record";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") set(false);
  });
  document.addEventListener(
    "mousemove",
    (e) => {
      if (!enabled || !(e.target instanceof Element) || e.target === host)
        return;
      const r = e.target.getBoundingClientRect();
      Object.assign(box.style, {
        left: r.x + "px",
        top: r.y + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
      box.hidden = false;
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (!(e.target instanceof Element) || e.target === host) return;
      if (enabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const el = e.target.closest("[data-react-surgeon-source]");
        if (!el) {
          status.textContent = "No source metadata";
          return;
        }
        const source = el.getAttribute("data-react-surgeon-source")!,
          match = source.match(/^(.*):(\d+):(\d+)$/);
        if (!match) return;
        const meta = metadata(el);
        ws?.send(
          JSON.stringify({
            type: "selection",
            selection: {
              file: match[1],
              line: Number(match[2]),
              column: Number(match[3]),
              ...meta,
              text: el.textContent?.slice(0, 500) || "",
              route: location.pathname,
            },
          }),
        );
        status.textContent = source;
        set(false);
      } else if (recording)
        steps.push({ action: "click", ...metadata(e.target) });
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      if (
        recording &&
        (e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement)
      ) {
        const el = e.target;
        const sensitive =
          el instanceof HTMLInputElement &&
          (el.type === "password" || /password|secret|token/i.test(el.name));
        steps.push({
          action: "fill",
          ...metadata(el),
          value: sensitive ? "[REDACTED]" : el.value,
        });
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    (e) => {
      if (recording && e.target instanceof HTMLFormElement)
        steps.push({ action: "submit", ...metadata(e.target) });
    },
    true,
  );
  window.addEventListener("popstate", () => {
    if (recording) steps.push({ action: "navigate", url: location.pathname });
  });
}
