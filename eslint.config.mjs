import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import functional from "eslint-plugin-functional";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  functional.configs.noExceptions,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "scripts/test-real-codebase/*.ts",
            "src/refactorings/__tests__/*.test.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Prefer named exports for grep-ability.",
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.fixture.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "functional/no-throw-statements": "off",
      "functional/no-try-statements": "off",
    },
  },
  {
    files: [
      "src/core/cli/commands/*.ts",
      "src/core/server/*.ts",
      "src/core/refactor-client.ts",
      "src/core/symbol-resolver.ts",
      "src/core/cleanup-unused.ts",
      "src/testing/**/*.ts",
      "src/refactorings/**/*.ts",
      "scripts/**/*.ts",
    ],
    rules: {
      "functional/no-throw-statements": "off",
      "functional/no-try-statements": "off",
    },
  },
  prettier,
  {
    ignores: ["dist/", "node_modules/", "**/*.fixture.ts", "jest.config.ts", "eslint.config.mjs"],
  },
);
