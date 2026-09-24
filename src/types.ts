import type { z } from "zod";
import type { portfolioSchema } from "../shared/schema.js";
export type PortfolioData = z.infer<typeof portfolioSchema>;
export type Section = PortfolioData["sections"][number];
export type Item = Section["items"][number];
export type Source = {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  note: string;
};
export type StudioState = {
  draft: PortfolioData;
  publishedAt: string | null;
  updatedAt: string;
  revision: number;
  history: { id: string; createdAt: string; label: string }[];
  sources: Source[];
};
