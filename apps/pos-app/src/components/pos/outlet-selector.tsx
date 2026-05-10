import { createSignal, For, Show } from "solid-js";
import { currentOutletId } from "~/store/outlet";

interface OutletOption {
  id: string;
  name: string;
}

interface OutletSelectorProps {
  onChange: (outletId: string) => void;
  outlets: OutletOption[];
}

export default function OutletSelector(props: OutletSelectorProps) {
  const [open, setOpen] = createSignal(false);
  const currentId = currentOutletId;

  const currentName = () => {
    const id = currentId();
    if (!id) {
      return "";
    }
    return props.outlets.find((o) => o.id === id)?.name ?? "";
  };

  const handleSelect = (id: string) => {
    props.onChange(id);
    setOpen(false);
  };

  return (
    <Show when={props.outlets.length > 1}>
      <div class="relative">
        <button
          class="flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-sm hover:bg-accent"
          onClick={() => setOpen(!open())}
          type="button"
        >
          <span class="max-w-[120px] truncate">{currentName()}</span>
          <svg
            class="size-3.5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <title>Chevron</title>
            <path
              d="M6 9l6 6 6-6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <Show when={open()}>
          <div class="absolute top-full left-0 z-50 mt-1 min-w-[200px] rounded-xl border bg-card p-1 shadow-lg">
            <For each={props.outlets}>
              {(outlet) => (
                <button
                  class={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    outlet.id === currentId()
                      ? "bg-primary/10 font-medium text-primary"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => handleSelect(outlet.id)}
                  type="button"
                >
                  {outlet.name}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
