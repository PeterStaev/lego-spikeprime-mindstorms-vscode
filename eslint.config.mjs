
import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import stylisticTs from "@stylistic/eslint-plugin-ts";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

import { defineConfig, globalIgnores } from "eslint/config";
import _import from "eslint-plugin-import";
import preferArrow from "eslint-plugin-prefer-arrow";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default defineConfig([globalIgnores(["**/*.d.ts"]), {
    extends: fixupConfigRules(
        compat.extends("eslint:recommended", "plugin:import/errors", "plugin:import/typescript"),
    ),

    files: ["**/*.ts"],

    plugins: {
        import: fixupPluginRules(_import),
        "prefer-arrow": preferArrow,
        "simple-import-sort": simpleImportSort,
        "@typescript-eslint": typescriptEslint,
        "@stylistic/ts": stylisticTs,
    },

    languageOptions: {
        globals: {
            ...globals.node,
        },

        parser: tsParser,
        ecmaVersion: 6,
        sourceType: "module",
    },

    settings: {
        "import/core-modules": ["vscode"],
    },

    rules: {
        "@typescript-eslint/adjacent-overload-signatures": "error",

        "@typescript-eslint/array-type": ["error", {
            default: "array-simple",
        }],

        "@typescript-eslint/consistent-type-assertions": ["error", {
            assertionStyle: "as",
            objectLiteralTypeAssertions: "never",
        }],

        "@typescript-eslint/dot-notation": "off",

        "@stylistic/ts/indent": ["error", 4, {
            SwitchCase: 1,
            ObjectExpression: "first",

            FunctionDeclaration: {
                parameters: "first",
            },

            FunctionExpression: {
                parameters: "first",
            },
        }],

        "@stylistic/ts/member-delimiter-style": ["error", {
            multiline: {
                delimiter: "comma",
                requireLast: true,
            },

            singleline: {
                delimiter: "comma",
                requireLast: false,
            },

            overrides: {
                interface: {
                    multiline: {
                        delimiter: "semi",
                        requireLast: true,
                    },
                },
            },
        }],

        "@typescript-eslint/naming-convention": [
            "error",
            {
                selector: "interface",
                format: ["PascalCase"],

                custom: {
                    regex: "^I[A-Z]",
                    match: false,
                },
            },
            {
                selector: "enumMember",
                format: ["PascalCase"],
            },
        ],

        "@typescript-eslint/no-empty-function": "error",
        "@typescript-eslint/no-empty-interface": "error",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-namespace": "error",

        "@typescript-eslint/no-shadow": ["error", {
            hoist: "all",
        }],

        "@typescript-eslint/no-this-alias": "error",
        "@typescript-eslint/no-unused-expressions": "error",
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-function-type": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@stylistic/ts/semi": ["error"],

        "@typescript-eslint/triple-slash-reference": ["error", {
            path: "always",
            types: "prefer-import",
            lib: "always",
        }],

        "@typescript-eslint/unified-signatures": "error",

        "brace-style": ["error", "stroustrup", {
            allowSingleLine: true,
        }],

        "comma-dangle": ["error", "always-multiline"],
        complexity: "off",
        "constructor-super": "error",
        "default-case": "off",
        "eol-last": "off",
        eqeqeq: ["error", "smart"],
        "guard-for-in": "error",

        "id-denylist": [
            "error",
            "any",
            "Number",
            "number",
            "String",
            "string",
            "Boolean",
            "boolean",
            "Undefined",
            "undefined",
        ],

        "id-match": "error",
        "import/no-extraneous-dependencies": "error",
        "max-len": "off",
        "new-parens": "error",
        "no-bitwise": "error",
        "no-caller": "error",

        "no-console": ["warn", {
            allow: ["error"],
        }],

        "no-duplicate-imports": "error",
        "no-eval": "error",
        "no-extra-bind": "error",
        "no-fallthrough": "error",
        "no-invalid-this": "error",
        "no-new-func": "error",
        "no-new-wrappers": "error",
        "no-redeclare": "error",
        "no-return-await": "error",
        "no-sequences": "error",
        "no-template-curly-in-string": "error",
        "no-throw-literal": "error",
        "no-trailing-spaces": "error",
        "no-undef-init": "error",

        "no-underscore-dangle": ["error", {
            allowAfterThis: true,
        }],

        "no-unused-labels": "error",

        "no-unused-vars": ["error", {
            args: "none",
        }],

        "no-var": "error",
        "object-shorthand": "error",
        "one-var": ["error", "never"],
        "prefer-arrow-callback": "error",

        "prefer-arrow/prefer-arrow-functions": ["error", {
            disallowPrototype: true,
            singleReturnOnly: false,
            classPropertiesAllowed: false,
            allowStandaloneDeclarations: true,
        }],

        "prefer-const": "error",
        "prefer-object-spread": "error",
        quotes: ["error", "double"],
        radix: "error",

        "simple-import-sort/imports": ["error", {
            groups: [["^\\u0000"], ["^@\\w"], ["^\\w"], ["^"], ["^\\."]],
        }],

        "simple-import-sort/exports": "error",

        "space-before-function-paren": ["error", {
            anonymous: "always",
            named: "never",
            asyncArrow: "always",
        }],

        "space-in-parens": ["error", "never"],

        "spaced-comment": ["error", "always", {
            markers: ["/"],
        }],
    },
}]);