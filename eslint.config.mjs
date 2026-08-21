import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // The React Compiler rules below flag patterns that are correct here. Each is disabled with
    // its reason at the narrowest possible scope — never repo-wide — because a blanket disable
    // would also hide the real cascading-render bug this lint run just found in scene/index.tsx.
    files: ["src/components/scene/field.tsx"],
    rules: {
      // Math.random() runs inside useMemo(() => …, []) to seed particle positions once. The rule
      // cannot see that the impurity is confined to a memo that never re-runs, and a seeded PRNG
      // would add a dependency to make a linter happy about a field of dots.
      "react-hooks/purity": "off",
      // useFrame mutates uniform values and a mesh rotation 60 times a second. That is the entire
      // react-three-fiber contract: the render loop writes to the GPU objects rather than to
      // React state. Routing it through state would re-render the tree every frame.
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-render": "off",
    },
  },
  {
    files: ["src/components/mdx.tsx"],
    rules: {
      // useMDXComponent compiles a component from a string at render. That is Velite's documented
      // API for MDX content, and the alternative is shipping a compiler to the browser.
      "react-hooks/static-components": "off",
    },
  },
  {
    files: ["postcss.config.mjs"],
    // PostCSS's config format is a default-exported object literal.
    rules: { "import/no-anonymous-default-export": "off" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
