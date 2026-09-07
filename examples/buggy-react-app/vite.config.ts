import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import surgeon from "@react-surgeon/vite-plugin";
export default defineConfig({
  plugins: [surgeon(), react()],
  server: { host: "127.0.0.1" },
});
