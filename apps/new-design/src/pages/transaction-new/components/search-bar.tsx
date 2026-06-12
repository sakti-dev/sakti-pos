import { SearchIcon } from "~/assets";

interface SearchBarProps {
  readonly onInput: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}

export const SearchBar = (props: SearchBarProps) => (
  <div class="relative shrink-0">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" />
    <input
      autocomplete="off"
      class="h-10 w-full rounded-[14px] border-[1.5px] border-border bg-surface py-0 pr-3.5 pl-[38px] font-medium text-[13px] text-text transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted placeholder:tracking-[0.02em] focus:border-primary focus:shadow-[0_0_0_3px_rgba(9,73,51,0.08)] focus:outline-none dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1e1e1e] dark:text-[#f0f0f0] dark:focus:border-[rgba(60,208,112,0.40)] dark:focus:shadow-[0_0_0_3px_rgba(60,208,112,0.08)] dark:placeholder:text-[#555]"
      onInput={(e) => props.onInput(e.currentTarget.value)}
      placeholder={props.placeholder ?? "Cari menu..."}
      type="text"
      value={props.value}
    />
  </div>
);
