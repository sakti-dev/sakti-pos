import { type ComponentProps, splitProps } from "solid-js";
import { cn } from "~/lib/utils";

/**
 * Table primitives (shadcn-style, SolidJS).
 *
 * The codebase standard is `border-separate border-spacing-0` (baked into
 * `Table`) because it gives reliable per-cell borders and keeps `position:
 * sticky` headers working. Note that in separate mode `<tr>` borders are
 * ignored by the browser — use cell borders / zebra striping for separation.
 * Base classes are kept non-sizing so consumers fully control padding/height.
 */

export function Table(props: ComponentProps<"table">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <table
      class={cn(
        "w-full caption-bottom border-separate border-spacing-0 text-body-sm",
        local.class
      )}
      data-slot="table"
      {...others}
    />
  );
}

export function TableHeader(props: ComponentProps<"thead">) {
  const [local, others] = splitProps(props, ["class"]);
  return <thead class={cn(local.class)} data-slot="table-header" {...others} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <tbody
      class={cn("[&_tr:last-child]:border-0", local.class)}
      data-slot="table-body"
      {...others}
    />
  );
}

export function TableFooter(props: ComponentProps<"tfoot">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <tfoot
      class={cn("border-border border-t bg-muted/50 font-medium", local.class)}
      data-slot="table-footer"
      {...others}
    />
  );
}

export function TableRow(props: ComponentProps<"tr">) {
  const [local, others] = splitProps(props, ["class"]);
  return <tr class={cn(local.class)} data-slot="table-row" {...others} />;
}

export function TableHead(props: ComponentProps<"th">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <th
      class={cn(
        "whitespace-nowrap text-left align-middle text-foreground",
        local.class
      )}
      data-slot="table-head"
      {...others}
    />
  );
}

export function TableCell(props: ComponentProps<"td">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <td
      class={cn("whitespace-nowrap align-middle", local.class)}
      data-slot="table-cell"
      {...others}
    />
  );
}

export function TableCaption(props: ComponentProps<"caption">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <caption
      class={cn("mt-4 text-body-sm text-muted-foreground", local.class)}
      data-slot="table-caption"
      {...others}
    />
  );
}
