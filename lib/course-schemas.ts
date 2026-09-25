import { z } from "zod";

const SUBJECTS = ["Fractions", "Algebra", "Biology", "General"] as const;

export const uploadMaterialSchema = z.object({
  title: z.string().trim().min(3).max(120),
  subject: z.enum(SUBJECTS).default("General"),
  material: z.string().trim().min(20).max(10_000),
});

export type UploadMaterialInput = z.infer<typeof uploadMaterialSchema>;
