export type ParentInboundMessage =
  | { type: "widget-tap"; x: number; y: number }
  | { type: "widget-current-page"; pathname: string }
  | { type: "widget-form-user-edit"; field: string; value: string };

export type ParentOutboundMessage =
  | { type: "widget-ready" }
  | { type: "widget-navigate"; page: string }
  | { type: "widget-form-update"; field: string; value: string }
  | { type: "widget-form-submit" }
  | { type: "widget-mouse-left-button" };

export function postToParent(msg: ParentOutboundMessage): void {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  window.parent.postMessage(msg, "*");
}

export function onParentMessage(
  handler: (msg: ParentInboundMessage) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: MessageEvent) => {
    const data = e.data as ParentInboundMessage | undefined;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;
    if (
      data.type === "widget-tap" ||
      data.type === "widget-current-page" ||
      data.type === "widget-form-user-edit"
    ) {
      handler(data);
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
