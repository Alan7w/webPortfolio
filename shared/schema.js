import { z } from "zod";
const short = z.string().max(300);
const text = z.string().max(12000);
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "IDs may contain only letters, numbers, dashes, and underscores",
  );
const url = z
  .string()
  .max(2000)
  .refine(
    (value) => !value || /^https?:\/\/[^\s]+$/i.test(value),
    "Use a complete https:// or http:// URL",
  );
export const itemSchema = z.object({
  id,
  title: short,
  subtitle: short.default(""),
  period: short.default(""),
  description: text.default(""),
  tags: z.array(z.string().max(80)).max(40).default([]),
  url: url.default(""),
  featured: z.boolean().default(false),
  visible: z.boolean().default(true),
});
export const portfolioSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: z.object({
      name: z.string().min(1).max(100),
      role: short,
      headline: short,
      intro: text,
      location: short,
      email: z.union([z.literal(""), z.email()]),
      github: url,
      linkedin: url,
      availability: short,
      about: text,
      portrait: z
        .string()
        .max(2000)
        .refine(
          (v) => !v || v === "/portrait.jpg" || /^https?:\/\/[^\s]+$/i.test(v),
          "Use an image URL",
        ),
    }),
    theme: z.object({
      accent: z.enum(["lime", "blue", "terracotta"]),
      surface: z.enum(["paper", "dark"]),
      font: z.enum(["editorial", "modern"]),
    }),
    sections: z
      .array(
        z.object({
          id,
          type: z.enum([
            "projects",
            "experience",
            "education",
            "skills",
            "custom",
          ]),
          title: z.string().min(1).max(100),
          visible: z.boolean(),
          items: z.array(itemSchema).max(100),
        }),
      )
      .max(30),
  })
  .superRefine((data, ctx) => {
    const ids = data.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Section IDs must be unique",
        path: ["sections"],
      });
    data.sections.forEach((section, i) => {
      if (new Set(section.items.map((x) => x.id)).size !== section.items.length)
        ctx.addIssue({
          code: "custom",
          message: "Item IDs must be unique",
          path: ["sections", i, "items"],
        });
    });
  });
export function publicPortfolio(data) {
  const parsed = portfolioSchema.parse(data);
  return {
    ...parsed,
    sections: parsed.sections
      .filter((s) => s.visible)
      .map((s) => ({ ...s, items: s.items.filter((i) => i.visible) })),
  };
}
