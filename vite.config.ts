import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The chat and the admin page are built into dist/, which the Worker serves as static assets.
export default defineConfig({
  root: "ui",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: { input: { chat: "ui/chat.html", admin: "ui/admin.html" } },
  },
});
