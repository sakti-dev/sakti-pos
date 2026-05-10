import {
  finite,
  type InferOutput,
  integer,
  literal,
  minValue,
  nonEmpty,
  number,
  object,
  pipe,
  string,
  transform,
  union,
  url,
} from "valibot";

export const ProductSchema = object({
  name: pipe(
    string("Nama produk wajib diisi"),
    nonEmpty("Nama produk wajib diisi")
  ),
  categoryId: pipe(
    string("Kategori wajib dipilih"),
    nonEmpty("Kategori wajib dipilih")
  ),
  price: pipe(
    string("Harga wajib diisi"),
    nonEmpty("Harga wajib diisi"),
    transform((input) => Number(input)),
    number("Harga harus berupa angka"),
    finite("Harga harus berupa angka"),
    integer("Harga harus bilangan bulat"),
    minValue(0, "Harga tidak boleh negatif")
  ),
  imageUrl: union([literal(""), pipe(string(), url("URL gambar tidak valid"))]),
});

export type ProductFormValues = InferOutput<typeof ProductSchema>;
