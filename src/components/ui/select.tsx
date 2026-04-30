import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import { cn } from "~/lib/utils";

export interface SelectOption {
  disabled?: boolean;
  label: string;
  value: string | number;
}

interface SelectProps {
  class?: string;
  disabled?: boolean;
  label?: string;
  name?: string;
  onChange?: (value: string | number | undefined) => void;
  options: SelectOption[];
  placeholder?: string;
  value?: string | number | undefined;
}

const Select: Component<SelectProps> = (props) => {
  const selectedLabel = createMemo(() => {
    if (props.value == null) {
      return;
    }
    return props.options.find((o) => o.value === props.value)?.label;
  });

  return (
    <>
      <Drawer
        closeOnEscapeKeyDown={false}
        closeOnOutsideFocus={false}
        modal={false}
        trapFocus={false}
      >
        {(drawer) => (
          <>
            <DrawerTrigger
              class={cn(
                "flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                props.class
              )}
              disabled={props.disabled}
            >
              <span class={cn(!selectedLabel() && "text-muted-foreground")}>
                {selectedLabel() ?? props.placeholder ?? "Pilih..."}
              </span>
              <svg
                aria-hidden="true"
                class="size-4 shrink-0 opacity-50"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M8 9l4 -4l4 4" />
                <path d="M16 15l-4 4l-4 -4" />
              </svg>
            </DrawerTrigger>
            <DrawerPortal>
              <DrawerOverlay />
              <DrawerContent>
                <Show when={props.label}>
                  {(label) => (
                    <div class="border-b px-4 py-3">
                      <DrawerTitle>{label()}</DrawerTitle>
                    </div>
                  )}
                </Show>
                <div class="max-h-[40vh] overflow-y-auto p-2">
                  <For each={props.options}>
                    {(option) => (
                      <button
                        class={cn(
                          "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm",
                          option.disabled
                            ? "cursor-not-allowed text-muted-foreground"
                            : "hover:bg-accent active:bg-accent/80",
                          option.value === props.value && "font-medium"
                        )}
                        disabled={option.disabled}
                        onClick={() => {
                          if (option.disabled) {
                            return;
                          }
                          props.onChange?.(option.value);
                          drawer.setOpen(false);
                        }}
                        type="button"
                      >
                        <span>{option.label}</span>
                        <Show when={option.value === props.value}>
                          <svg
                            aria-hidden="true"
                            class="size-4 text-primary"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M5 12l5 5l10 -10" />
                          </svg>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </DrawerContent>
            </DrawerPortal>
          </>
        )}
      </Drawer>
      <input
        name={props.name ?? "select"}
        type="hidden"
        value={props.value == null ? "" : String(props.value)}
      />
    </>
  );
};

export { Select };
