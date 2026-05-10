import * as v from "valibot";

export const CreateUserSchema = v.pipe(
	v.object({
		name: v.pipe(
			v.string("Nama wajib diisi"),
			v.nonEmpty("Nama wajib diisi"),
		),
		role: v.pipe(
			v.string("Peran wajib dipilih"),
			v.nonEmpty("Peran wajib dipilih"),
		),
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

export const EditUserSchema = v.object({
	name: v.pipe(
		v.string("Nama wajib diisi"),
		v.nonEmpty("Nama wajib diisi"),
	),
	role: v.pipe(
		v.string("Peran wajib dipilih"),
		v.nonEmpty("Peran wajib dipilih"),
	),
});

export type CreateUserValues = v.InferOutput<typeof CreateUserSchema>;
export type EditUserValues = v.InferOutput<typeof EditUserSchema>;
