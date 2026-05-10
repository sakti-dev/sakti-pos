import * as v from "valibot";

export const CloudLoginSchema = v.object({
	email: v.pipe(
		v.string("Email wajib diisi"),
		v.nonEmpty("Email wajib diisi"),
		v.email("Format email tidak valid"),
	),
	password: v.pipe(
		v.string("Kata sandi wajib diisi"),
		v.nonEmpty("Kata sandi wajib diisi"),
	),
});

export const CloudRegisterSchema = v.object({
	name: v.pipe(
		v.string("Nama wajib diisi"),
		v.nonEmpty("Nama wajib diisi"),
	),
	email: v.pipe(
		v.string("Email wajib diisi"),
		v.nonEmpty("Email wajib diisi"),
		v.email("Format email tidak valid"),
	),
	password: v.pipe(
		v.string("Kata sandi wajib diisi"),
		v.nonEmpty("Kata sandi wajib diisi"),
		v.minLength(8, "Kata sandi minimal 8 karakter"),
	),
});

export type CloudLoginValues = v.InferOutput<typeof CloudLoginSchema>;
export type CloudRegisterValues = v.InferOutput<typeof CloudRegisterSchema>;
