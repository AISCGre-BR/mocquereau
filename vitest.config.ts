import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    // Agent worktrees under .claude/ carry their own copy of src/ and would
    // otherwise be collected (with @shared pointing at this tree).
    exclude: [...configDefaults.exclude, ".claude/**", "out/**"],
  },
});
