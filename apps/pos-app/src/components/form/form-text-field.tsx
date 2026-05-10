import type { FieldElementProps } from "@formisch/solid";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

import {
	TextField,
	TextFieldErrorMessage,
	TextFieldInput,
	TextFieldLabel,
} from "../ui/text-field";

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
				{props.required && <span class="text-muted-foreground ml-0.5">*</span>}
			</TextFieldLabel>
			<TextFieldInput
				{...inputProps}
				id={props.name}
				aria-invalid={!!props.errors}
				aria-errormessage={`${props.name}-error`}
				class={cn(
					props.class,
					props.errors && "border-destructive text-destructive",
				)}
				placeholder={props.placeholder}
				type={local.type}
				value={props.input ?? ""}
			/>
			{props.errors && (
				<TextFieldErrorMessage id={`${props.name}-error`} role="alert">
					{props.errors[0]}
				</TextFieldErrorMessage>
			)}
		</TextField>
	);
}
