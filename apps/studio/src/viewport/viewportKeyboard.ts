export type ViewportKeyboardCommand =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "down"
  | "up"
  | "inspect"
  | "reset";

const KEY_COMMANDS: Readonly<Record<string, ViewportKeyboardCommand>> = {
  w: "forward",
  s: "backward",
  a: "left",
  d: "right",
  q: "down",
  e: "up",
  f: "inspect",
  home: "reset",
};

export function resolveViewportKeyboardCommand(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "isComposing">,
  target: EventTarget | null,
  viewport: EventTarget,
): ViewportKeyboardCommand | null {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return null;
  const command = KEY_COMMANDS[event.key.toLowerCase()] ?? null;
  if (target === viewport) return command;
  return command === "inspect" && target instanceof HTMLElement && target.dataset.viewportEntityPick === "true"
    ? command
    : null;
}
