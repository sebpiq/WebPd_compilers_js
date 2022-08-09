import typescript from '@rollup/plugin-typescript'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default [
    {
        input: './src/engine-assemblyscript/assemblyscript-wasm-bindings.ts',
        output: {
            file: './dist/assemblyscript-wasm-bindings.iife.js',
            sourcemap: true,
            format: 'iife',
            name: 'AscWasmBindings',
        },
        plugins: [
            typescript({
                tsconfig: 'tsconfig-assemblyscript-wasm-bindings.json',
            }),
            nodeResolve(),
            commonjs(),
        ],
    },
]