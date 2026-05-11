import { type InferOutput, object, string } from "valibot";

export const PrinterSettingsSchema = object({
  receiptName: string(),
  receiptAddress: string(),
});

export type PrinterSettingsValues = InferOutput<typeof PrinterSettingsSchema>;
