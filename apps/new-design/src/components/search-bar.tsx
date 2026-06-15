import { Show } from "solid-js";
import { SearchIcon, XCloseIcon } from "~/assets";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/components/ui/input-group";
import { cn } from "~/lib/utils";

interface SearchBarProps {
  readonly class?: string;
  readonly mode?: "compact" | "full";
  readonly onInput: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}

export const SearchBar = (props: SearchBarProps) => {
  const startPadding = () => (props.mode === "compact" ? "pl-2" : "pl-4");
  const endWidth = () => (props.mode === "compact" ? "w-9" : "w-10");

  return (
    <InputGroup class={cn("rounded-xl shadow-sm", props.class)}>
      <InputGroupAddon class={startPadding()}>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        autocomplete="off"
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && props.value) {
            e.preventDefault();
            props.onInput("");
          }
        }}
        placeholder={props.placeholder ?? "Cari produk..."}
        type="text"
        value={props.value}
      />
      <Show when={props.value.length > 0}>
        <InputGroupAddon align="inline-end" class={endWidth()} separator>
          <InputGroupButton
            aria-label="Reset"
            look="ghost"
            onClick={() => props.onInput("")}
            size="icon-xs"
            tone="danger"
          >
            <XCloseIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </Show>
    </InputGroup>
  );
};
