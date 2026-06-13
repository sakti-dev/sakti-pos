import type { PolymorphicProps } from "@kobalte/core";
import * as TextFieldPrimitive from "@kobalte/core/text-field";
import { cva } from "class-variance-authority";
import type { ValidComponent } from "solid-js";
import { mergeProps, splitProps } from "solid-js";
import { cn } from "~/lib/utils";

type TextFieldRootProps<T extends ValidComponent = "div"> =
  TextFieldPrimitive.TextFieldRootProps<T> & {
    class?: string | undefined;
  };

const TextField = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TextFieldRootProps<T>>
) => {
  const [local, others] = splitProps(props as TextFieldRootProps, ["class"]);
  return (
    <TextFieldPrimitive.Root
      class={cn("flex flex-col gap-1", local.class)}
      {...others}
    />
  );
};

type TextFieldInputProps<T extends ValidComponent = "input"> =
  TextFieldPrimitive.TextFieldInputProps<T> & {
    class?: string | undefined;
    type?:
      | "button"
      | "checkbox"
      | "color"
      | "date"
      | "datetime-local"
      | "email"
      | "file"
      | "hidden"
      | "image"
      | "month"
      | "number"
      | "password"
      | "radio"
      | "range"
      | "reset"
      | "search"
      | "submit"
      | "tel"
      | "text"
      | "time"
      | "url"
      | "week";
  };

const TextFieldInput = <T extends ValidComponent = "input">(
  rawProps: PolymorphicProps<T, TextFieldInputProps<T>>
) => {
  const props = mergeProps<TextFieldInputProps<T>[]>(
    { type: "text" },
    rawProps
  );
  const [local, others] = splitProps(props as TextFieldInputProps, [
    "type",
    "class",
  ]);
  return (
    <TextFieldPrimitive.Input
      class={cn(
        "h-12 w-full rounded-sm border-[1.5px] border-input bg-background px-3.5 font-sans text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-standard ease-standard placeholder:text-muted-foreground",
        "focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-2 focus:outline-ring focus:outline-offset-1",
        "dark:focus:border-primary",
        "data-[invalid]:border-destructive data-[invalid]:ring-2 data-[invalid]:ring-destructive/10",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:font-medium file:text-sm",
        local.class
      )}
      type={local.type}
      {...others}
    />
  );
};

type TextFieldTextAreaProps<T extends ValidComponent = "textarea"> =
  TextFieldPrimitive.TextFieldTextAreaProps<T> & { class?: string | undefined };

const TextFieldTextArea = <T extends ValidComponent = "textarea">(
  props: PolymorphicProps<T, TextFieldTextAreaProps<T>>
) => {
  const [local, others] = splitProps(props as TextFieldTextAreaProps, [
    "class",
  ]);
  return (
    <TextFieldPrimitive.TextArea
      class={cn(
        "min-h-[80px] w-full rounded-sm border-[1.5px] border-input bg-background px-3.5 py-3 font-sans text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-standard ease-standard placeholder:text-muted-foreground",
        "focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-2 focus:outline-ring focus:outline-offset-1",
        "dark:focus:border-accent",
        "data-[invalid]:border-destructive data-[invalid]:ring-2 data-[invalid]:ring-destructive/10",
        "disabled:cursor-not-allowed disabled:opacity-50",
        local.class
      )}
      {...others}
    />
  );
};

const labelVariants = cva(
  "font-medium text-[13px] text-foreground leading-none tracking-[0.01em] peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  {
    variants: {
      variant: {
        label: "data-[invalid]:text-destructive",
        description: "font-normal text-muted-foreground",
        error: "text-destructive text-xs",
      },
    },
    defaultVariants: {
      variant: "label",
    },
  }
);

type TextFieldLabelProps<T extends ValidComponent = "label"> =
  TextFieldPrimitive.TextFieldLabelProps<T> & { class?: string | undefined };

const TextFieldLabel = <T extends ValidComponent = "label">(
  props: PolymorphicProps<T, TextFieldLabelProps<T>>
) => {
  const [local, others] = splitProps(props as TextFieldLabelProps, ["class"]);
  return (
    <TextFieldPrimitive.Label
      class={cn(labelVariants(), local.class)}
      {...others}
    />
  );
};

type TextFieldDescriptionProps<T extends ValidComponent = "div"> =
  TextFieldPrimitive.TextFieldDescriptionProps<T> & {
    class?: string | undefined;
  };

const TextFieldDescription = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TextFieldDescriptionProps<T>>
) => {
  const [local, others] = splitProps(props as TextFieldDescriptionProps, [
    "class",
  ]);
  return (
    <TextFieldPrimitive.Description
      class={cn(labelVariants({ variant: "description" }), local.class)}
      {...others}
    />
  );
};

type TextFieldErrorMessageProps<T extends ValidComponent = "div"> =
  TextFieldPrimitive.TextFieldErrorMessageProps<T> & {
    class?: string | undefined;
  };

const TextFieldErrorMessage = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TextFieldErrorMessageProps<T>>
) => {
  const [local, others] = splitProps(props as TextFieldErrorMessageProps, [
    "class",
  ]);
  return (
    <TextFieldPrimitive.ErrorMessage
      class={cn(labelVariants({ variant: "error" }), local.class)}
      {...others}
    />
  );
};

export {
  TextField,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  TextFieldTextArea,
};
