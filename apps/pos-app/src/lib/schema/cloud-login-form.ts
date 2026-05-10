import {
  email,
  type InferOutput,
  minLength,
  nonEmpty,
  object,
  pipe,
  string,
} from "valibot";

export const CloudLoginSchema = object({
  email: pipe(
    string("Email wajib diisi"),
    nonEmpty("Email wajib diisi"),
    email("Format email tidak valid")
  ),
  password: pipe(
    string("Kata sandi wajib diisi"),
    nonEmpty("Kata sandi wajib diisi"),
    minLength(8, "Kata sandi minimal 8 karakter")
  ),
});

export const CloudRegisterSchema = object({
  name: pipe(string("Nama wajib diisi"), nonEmpty("Nama wajib diisi")),
  email: pipe(
    string("Email wajib diisi"),
    nonEmpty("Email wajib diisi"),
    email("Format email tidak valid")
  ),
  password: pipe(
    string("Kata sandi wajib diisi"),
    nonEmpty("Kata sandi wajib diisi"),
    minLength(8, "Kata sandi minimal 8 karakter")
  ),
});

export type CloudLoginValues = InferOutput<typeof CloudLoginSchema>;
export type CloudRegisterValues = InferOutput<typeof CloudRegisterSchema>;
