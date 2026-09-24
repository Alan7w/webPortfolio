import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    watch: { ignored: ["**/data/**", "**/tmp/**"] },
    fs: {
      strict: true,
      deny: [
        ".env",
        ".env.*",
        "**/.git/**",
        "**/data/**",
        "**/tmp/**",
        "**/*.pdf",
        "**/*.docx",
      ],
    },
  },
});
