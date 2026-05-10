import * as v from "valibot";

export const ResetPinSchema = v.pipe(
	v.object({
		pin: v.pipe(
			v.string("PIN wajib diisi"),
			v.nonEmpty("PIN wajib diisi"),
			v.minLength(6, "PIN minimal 6 digit"),
		),
		confirmPin: v.pipe(
			v.string("Konfirmasi PIN wajib diisi"),
			v.nonEmpty("Konfirmasi PIN wajib diisi"),
		),
	}),
	v.check(
		(input) => input.confirmPin === "" || input.pin === input.confirmPin,
		"PIN tidak cocok",
	),
);

export type ResetPinFormValues = v.InferOutput<typeof ResetPinSchema>;
