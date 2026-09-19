import resolve from "rollup-plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import babel from "rollup-plugin-babel";
import serve from "rollup-plugin-serve";
import { terser } from "rollup-plugin-terser";
import json from '@rollup/plugin-json';
import forkIdentity from "./rollup-fork-identity.js";

export default {
  input: ["src/floor3dpro-card.ts"],
  output: {
    file: "./dist/floor3dx-card.js",
    format: "es",
    inlineDynamicImports: true,
  },
  plugins: [
    resolve(),
    typescript(),
    json(),
    babel({
      exclude: "node_modules/**",
    }),
    forkIdentity(),
    terser(),
    serve({
      contentBase: "./dist",
      host: "0.0.0.0",
      port: 5000,
      allowCrossOrigin: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }),
  ],
};
