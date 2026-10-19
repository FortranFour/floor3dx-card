import typescript from 'rollup-plugin-typescript2';
import nodeResolve from 'rollup-plugin-node-resolve';
export default {
  input: 'dev/harness/unit/look-entry.ts',
  output: { file: 'dev/harness/unit/look-bundle.js', format: 'iife' },
  plugins: [nodeResolve(), typescript({ check: false, tsconfigOverride: { compilerOptions: { declaration: false } } })],
};
