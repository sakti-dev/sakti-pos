import type { PolymorphicProps } from "@kobalte/core";
import * as RadioGroupPrimitive from "@kobalte/core/radio-group";
import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

type RadioGroupRootProps<T extends ValidComponent = "div"> =
  RadioGroupPrimitive.RadioGroupRootProps<T> & {
    class?: string | undefined;
  };

export const RadioGroup = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, RadioGroupRootProps<T>>
) => {
  const [local, others] = splitProps(props as RadioGroupRootProps, ["class"]);
  return (
    <RadioGroupPrimitive.Root
      class={cn("flex flex-col gap-3", local.class)}
      {...others}
    />
  );
};

export const RadioOption = (props: {
  value: string;
  label: string;
  description?: string;
}) => (
  <RadioGroupPrimitive.Item
    class="flex cursor-pointer items-start gap-3"
    value={props.value}
  >
    <RadioGroupPrimitive.ItemControl class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-input transition-colors data-[checked]:border-primary">
      <RadioGroupPrimitive.ItemIndicator class="size-2.5 rounded-full bg-primary" />
    </RadioGroupPrimitive.ItemControl>
    <span class="flex min-w-0 flex-col gap-0.5">
      <RadioGroupPrimitive.ItemLabel class="font-medium text-body-sm text-foreground leading-none">
        {props.label}
      </RadioGroupPrimitive.ItemLabel>
      {props.description ? (
        <RadioGroupPrimitive.ItemDescription class="text-caption-sm text-muted-foreground">
          {props.description}
        </RadioGroupPrimitive.ItemDescription>
      ) : null}
    </span>
  </RadioGroupPrimitive.Item>
);
