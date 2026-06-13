import { SearchIcon } from "~/assets";

interface SearchBarProps {
  readonly onInput: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}

export const SearchBar = (props: SearchBarProps) => (
  <div class="relative shrink-0">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint-foreground" />
    <input
      autocomplete="off"
      class="h-10 w-full rounded-[14px] border-[1.5px] border-border bg-card py-0 pr-3.5 pl-[38px] font-medium text-[13px] text-foreground transition-[border-color,box-shadow] duration-200 placeholder:text-faint-foreground placeholder:tracking-[0.02em] focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none"
      onInput={(e) => props.onInput(e.currentTarget.value)}
      placeholder={props.placeholder ?? "Cari menu..."}
      type="text"
      value={props.value}
    />
  </div>
);
