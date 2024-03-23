import { builtinModules } from "module";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: true,
    target: "node20",
    outDir: "./dist",
    rollupOptions: {
      external: [...builtinModules],
    },
    lib: {
      entry: {
        index: "src/index.ts",
        alpine: "src/alpine/index.ts",
      },
      formats: ["es", "cjs"],
    },
  },
});
