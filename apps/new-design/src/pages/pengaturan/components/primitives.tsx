import type { JSX } from "solid-js";

/* ── shared primitives ────────────────────────────────────────── */

export function SectionCard(props: {
  readonly children: JSX.Element;
  readonly class?: string;
}) {
  return (
    <div
      class={`flex flex-col gap-5 rounded-[14px] border border-border bg-card px-6 py-6 ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
}

export function CardTitle(props: { readonly children: JSX.Element }) {
  return (
    <h3 class="font-bold font-display text-body text-foreground tracking-[-0.01em]">
      {props.children}
    </h3>
  );
}

export function CardDesc(props: { readonly children: JSX.Element }) {
  return (
    <p class="mt-0.5 text-body-sm text-muted-foreground leading-relaxed">
      {props.children}
    </p>
  );
}

export function FormGrid(props: { readonly children: JSX.Element }) {
  return (
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">{props.children}</div>
  );
}

export function FormGroup(props: {
  readonly children: JSX.Element;
  readonly fullWidth?: boolean;
}) {
  return (
    <div
      class={`flex flex-col gap-1.5 ${props.fullWidth ? "col-span-auto sm:col-span-1 sm:-col-end-1" : ""}`}
    >
      {props.children}
    </div>
  );
}

export function FormLabel(props: { readonly children: JSX.Element }) {
  return (
    <span class="font-semibold text-caption text-muted-foreground uppercase tracking-[0.04em]">
      {props.children}
    </span>
  );
}

export function FormInput(props: {
  readonly type?: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly min?: string;
  readonly max?: string;
  readonly step?: string;
}) {
  return (
    <input
      class="h-[42px] rounded-[10px] border border-border bg-card px-3.5 font-[inherit] text-body-sm text-foreground outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
      max={props.max}
      min={props.min}
      placeholder={props.placeholder}
      step={props.step}
      type={props.type ?? "text"}
      value={props.value}
    />
  );
}

export function FormTextarea(props: {
  readonly value?: string;
  readonly placeholder?: string;
  readonly rows?: number;
}) {
  return (
    <textarea
      class="min-h-[80px] resize-y rounded-[10px] border border-border bg-card px-3.5 py-2.5 font-[inherit] text-body-sm text-foreground leading-relaxed outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
      placeholder={props.placeholder}
      rows={props.rows ?? 3}
      value={props.value}
    />
  );
}

export function FormSelect(props: {
  readonly children: JSX.Element;
  readonly value?: string;
}) {
  return (
    <select
      class="h-[42px] cursor-pointer appearance-none rounded-[10px] border border-border bg-[length:12px_8px] bg-[position:right_14px_center] bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2712%27%20height%3D%278%27%20viewBox%3D%270%200%2012%208%27%20fill%3D%27none%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cpath%20d%3D%27M1%201.5L6%206.5L11%201.5%27%20stroke%3D%27%23737c77%27%20stroke-width%3D%271.5%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%2F%3E%3C%2Fsvg%3E')] bg-card bg-no-repeat px-3.5 pr-9 font-[inherit] text-body-sm text-foreground outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
      value={props.value}
    >
      {props.children}
    </select>
  );
}

export function ToggleRow(props: {
  readonly title: string;
  readonly desc: string;
  readonly checked?: boolean;
  readonly last?: boolean;
}) {
  return (
    <div
      class={`flex items-center justify-between gap-4 py-3 ${props.last ? "" : "border-border border-b"}`}
    >
      <div class="min-w-0 flex-1">
        <div class="font-medium text-body-sm text-foreground">
          {props.title}
        </div>
        <div class="mt-0.5 text-caption text-muted-foreground">
          {props.desc}
        </div>
      </div>
      <label class="relative h-6 w-11 shrink-0">
        <input
          checked={props.checked}
          class="absolute h-0 w-0 opacity-0"
          type="checkbox"
        />
        <span class="absolute top-0 right-0 bottom-0 left-0 cursor-pointer rounded-full bg-border transition-[background] duration-250 before:absolute before:bottom-[3px] before:left-[3px] before:h-[18px] before:w-[18px] before:rounded-full before:bg-white before:shadow-card before:transition-[transform] before:duration-250 before:content-[''] checked:bg-primary dark:checked:bg-accent" />
      </label>
    </div>
  );
}

export function BtnRow(props: { readonly children: JSX.Element }) {
  return (
    <div class="flex items-center justify-end gap-2.5 pt-2">
      {props.children}
    </div>
  );
}
