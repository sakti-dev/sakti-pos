import { createSignal } from "solid-js";

export interface Toast {
  id: number;
  message: string;
  variant: "error" | "info" | "success";
}

let nextId = 0;

const [toasts, setToasts] = createSignal<Toast[]>([]);

export { toasts };

export function toast(message: string, variant: Toast["variant"] = "info") {
  const id = nextId++;
  setToasts((prev) => [...prev, { id, message, variant }]);
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 3000);
}

export function dismissToast(id: number) {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}
