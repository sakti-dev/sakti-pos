import {
  check,
  type InferOutput,
  minLength,
  nonEmpty,
  object,
  pipe,
  string,
} from "valibot";

export const CreateUserSchema = pipe(
  object({
    name: pipe(string("Nama wajib diisi"), nonEmpty("Nama wajib diisi")),
    role: pipe(string("Peran wajib dipilih"), nonEmpty("Peran wajib dipilih")),
    pin: pipe(
      string("PIN wajib diisi"),
      nonEmpty("PIN wajib diisi"),
      minLength(6, "PIN minimal 6 digit")
    ),
    confirmPin: pipe(
      string("Konfirmasi PIN wajib diisi"),
      nonEmpty("Konfirmasi PIN wajib diisi")
    ),
  }),
  check(
    (input) => input.confirmPin === "" || input.pin === input.confirmPin,
    "PIN tidak cocok"
  )
);

export const EditUserSchema = object({
  name: pipe(string("Nama wajib diisi"), nonEmpty("Nama wajib diisi")),
  role: pipe(string("Peran wajib dipilih"), nonEmpty("Peran wajib dipilih")),
});

export type CreateUserValues = InferOutput<typeof CreateUserSchema>;
export type EditUserValues = InferOutput<typeof EditUserSchema>;
