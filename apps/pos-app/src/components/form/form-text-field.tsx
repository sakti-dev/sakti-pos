import type { FieldElementProps } from "@formisch/solid";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

import { TextField, TextFieldInput, TextFieldLabel } from "../ui/text-field";

interface FormTextFieldProps extends FieldElementProps {
  class?: string;
  errors: [string, ...string[]] | null;
  input: string | undefined;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "email" | "password" | "url" | "number";
}

export function FormTextField(props: FormTextFieldProps) {
  const [local, inputProps] = splitProps(props, [
    "input",
    "label",
    "errors",
    "class",
    "required",
    "type",
  ]);

  return (
    <TextField class="gap-1.5">
      <TextFieldLabel for={props.name}>
        {props.label}
        {props.required && <span class="ml-0.5 text-muted-foreground">*</span>}
      </TextFieldLabel>
      <TextFieldInput
        {...inputProps}
        aria-errormessage={`${props.name}-error`}
        aria-invalid={!!props.errors}
        class={cn(
          props.class,
          props.errors && "border-destructive text-destructive"
        )}
        id={props.name}
        placeholder={props.placeholder}
        type={local.type}
        value={props.input ?? ""}
      />
      {props.errors && (
        <p
          class="text-destructive text-xs"
          id={`${props.name}-error`}
          role="alert"
        >
          {props.errors[0]}
        </p>
      )}
    </TextField>
  );
}
