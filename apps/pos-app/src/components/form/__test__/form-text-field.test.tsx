import { createForm, Field, Form } from "@formisch/solid";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { FormTextField } from "../form-text-field";

const TestSchema = v.object({
	name: v.pipe(v.string(), v.nonEmpty("Name is required")),
});

function TestWrapper() {
	const form = createForm({
		schema: TestSchema,
		initialInput: { name: "" },
	});

	return (
		<Form of={form} onSubmit={() => {}}>
			<Field of={form} path={["name"]}>
				{(field) => (
					<FormTextField
						{...field.props}
						errors={field.errors}
						input={field.input}
						label="Nama"
						placeholder="Masukkan nama"
						required
						type="text"
					/>
				)}
			</Field>
		</Form>
	);
}

const user = userEvent.setup();

describe("FormTextField", () => {
	test("renders label text", () => {
		render(() => <TestWrapper />);
		expect(screen.getByText("Nama")).toBeInTheDocument();
	});

	test("renders required asterisk when required is true", () => {
		render(() => <TestWrapper />);
		expect(screen.getByText("*")).toBeInTheDocument();
	});

	test("renders input with correct placeholder", () => {
		render(() => <TestWrapper />);
		expect(screen.getByPlaceholderText("Masukkan nama")).toBeInTheDocument();
	});

	test("shows error message when errors are present", async () => {
		const ErrorSchema = v.object({
			email: v.pipe(v.string(), v.email("Format email tidak valid")),
		});

		function ErrorWrapper() {
			const form = createForm({
				schema: ErrorSchema,
				initialInput: { email: "not-an-email" },
				validate: "input",
				revalidate: "input",
			});

			return (
				<Form of={form} onSubmit={() => {}}>
					<Field of={form} path={["email"]}>
						{(field) => (
							<FormTextField
								{...field.props}
								errors={field.errors}
								input={field.input}
								label="Email"
								placeholder="email@example.com"
								required
								type="email"
							/>
						)}
					</Field>
				</Form>
			);
		}

		render(() => <ErrorWrapper />);
		const input = screen.getByPlaceholderText("email@example.com");
		await user.type(input, "a");
		expect(screen.getByText("Format email tidak valid")).toBeInTheDocument();
	});

	test("updates input value on user typing", async () => {
		render(() => <TestWrapper />);
		const input = screen.getByPlaceholderText("Masukkan nama");
		await user.type(input, "Hello");
		expect(input).toHaveValue("Hello");
	});

	test("hides error message when errors are null", () => {
		function NoErrorWrapper() {
			const form = createForm({
				schema: v.object({ name: v.string() }),
				initialInput: { name: "test" },
			});

			return (
				<Form of={form} onSubmit={() => {}}>
					<Field of={form} path={["name"]}>
						{(field) => (
							<FormTextField
								{...field.props}
								errors={field.errors}
								input={field.input}
								label="Nama"
								type="text"
							/>
						)}
					</Field>
				</Form>
			);
		}

		render(() => <NoErrorWrapper />);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
