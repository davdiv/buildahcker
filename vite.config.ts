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
        "alpine/index": "src/alpine/index.ts",
        "alpine/partitions/index": "src/alpine/partitions/index.ts",
        "alpine/grub/index": "src/alpine/grub/index.ts",
        "alpine/mksquashfs/index": "src/alpine/mksquashfs/index.ts",
        "alpine/mkvfatfs/index": "src/alpine/mkvfatfs/index.ts",
      },
      formats: ["es", "cjs"],
    },
  },
});
