import * as v from "valibot";

export const CategorySchema = v.object({
	name: v.pipe(
		v.string("Nama wajib diisi"),
		v.nonEmpty("Nama wajib diisi"),
	),
});

export type CategoryFormValues = v.InferOutput<typeof CategorySchema>;
