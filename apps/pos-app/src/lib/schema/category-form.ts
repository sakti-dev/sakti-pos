import { type InferOutput, nonEmpty, object, pipe, string } from "valibot";

export const CategorySchema = object({
  name: pipe(string("Nama wajib diisi"), nonEmpty("Nama wajib diisi")),
});

export type CategoryFormValues = InferOutput<typeof CategorySchema>;
