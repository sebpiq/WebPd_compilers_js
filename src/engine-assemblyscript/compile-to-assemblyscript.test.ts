/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import assert from 'assert'
import { makeCompilation, round } from '../test-helpers'
import {
    Compilation,
    EngineVariableNames,
    NodeImplementations,
    PortSpecs,
} from '../types'
import compileToAssemblyscript, {
    attachPortsVariableNames,
} from './compile-to-assemblyscript'
import { compileWasmModule } from './test-helpers'
import { AssemblyScriptWasmExports, EngineMetadata } from './types'
import {
    createEngine,
    EngineSettings,
    liftString,
} from './assemblyscript-wasm-bindings'
import { makeGraph } from '@webpd/shared/test-helpers'
import macros from './macros'
import { generateEngineVariableNames } from '../engine-variable-names'

describe('compileToAssemblyscript', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            loop: () => `// [DUMMY] loop`,
        },
        'osc~': {
            initialize: () => `// [osc~] setup`,
            loop: () => `// [osc~] loop`,
        },
        'dac~': {
            initialize: () => `// [dac~] setup`,
            loop: () => `// [dac~] loop`,
        },
    }

    const filterPortFunctionKeys = (wasmExports: any) =>
        Object.keys(wasmExports).filter(
            (key) => key.startsWith('read_') || key.startsWith('write_')
        )

    const compileEngine = async (
        compilation: Compilation,
        extraCode: string = '',
        extraEngineSettings: Partial<EngineSettings> = {}
    ) => {
        const code = compileToAssemblyscript(compilation)
        const wasmModule = await compileWasmModule(`${extraCode}\n${code}`)
        return createEngine(wasmModule, {
            ...compilation,
            ...extraEngineSettings,
        })
    }

    it('should create the specified ports', async () => {
        const engine = await compileEngine(
            makeCompilation({
                target: 'assemblyscript',
                nodeImplementations: NODE_IMPLEMENTATIONS,
                macros,
                portSpecs: {
                    bla: { access: 'r', type: 'float' },
                    blo: { access: 'w', type: 'messages' },
                    bli: { access: 'rw', type: 'float' },
                    blu: { access: 'rw', type: 'messages' },
                },
            }),
            // prettier-ignore
            `
                let bla: f32 = 1
                let blo: Message[]
                let bli: f32 = 2
                let bluMessage1: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING, 4 ])
                let bluMessage2: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT ])
                let blu: Message[] = [bluMessage1, bluMessage2]
                let blu2: Message[] = [bluMessage2]

                export function getBlu2(): Message[] {
                    return blu2
                }
                export function getBluMessage1(): Message {
                    return bluMessage1
                }
                export function getBluMessage2(): Message {
                    return bluMessage2
                }
            `
        )
        const wasmExports = engine.wasmExports as any

        assert.deepStrictEqual(
            filterPortFunctionKeys(wasmExports).sort(),
            [
                'read_bla',
                'write_blo',
                'read_bli',
                'write_bli',
                'read_blu_length',
                'read_blu_elem',
                'write_blu',
            ].sort()
        )

        assert.strictEqual(wasmExports.read_bla(), 1)

        assert.strictEqual(wasmExports.read_bli(), 2)
        wasmExports.write_bli(666.666)
        assert.strictEqual(round(wasmExports.read_bli()), 666.666)

        assert.deepStrictEqual(wasmExports.read_blu_length(), 2)
        assert.strictEqual(
            wasmExports.read_blu_elem(0),
            wasmExports.getBluMessage1()
        )
        assert.strictEqual(
            wasmExports.read_blu_elem(1),
            wasmExports.getBluMessage2()
        )

        const blu2Pointer = wasmExports.getBlu2()
        wasmExports.write_blu(blu2Pointer)
        assert.deepStrictEqual(wasmExports.read_blu_length(), 1)
        assert.strictEqual(
            wasmExports.read_blu_elem(0),
            wasmExports.getBluMessage2()
        )
    })

    it('should create inlet listeners and trigger them whenever inlets receive new messages', async () => {
        const called: Array<Array<PdSharedTypes.ControlValue>> = []
        const inletVariableName = 'someNode_INS_someInlet'
        const nodeImplementations: NodeImplementations = {
            messageGeneratorType: {
                loop: (_, { outs, globs, macros }) => `
                    if (${globs.frame} % 5 === 0) {
                        ${macros.createMessage('m', [0])}
                        writeFloatDatum(m, 0, f32(${globs.frame}))
                        ${outs.someOutlet}.push(m)
                    }
                `,
            },
            someNodeType: {
                loop: () => ``,
            },
        }

        const graph = makeGraph({
            messageGenerator: {
                type: 'messageGeneratorType',
                outlets: { someOutlet: { type: 'control', id: 'someOutlet' } },
                sinks: { someOutlet: [['someNode', 'someInlet']] },
            },
            someNode: {
                type: 'someNodeType',
                isEndSink: true,
                inlets: { someInlet: { type: 'control', id: 'someInlet' } },
            },
        })

        const engine = await compileEngine(
            makeCompilation({
                target: 'assemblyscript',
                graph,
                nodeImplementations,
                macros,
                inletListeners: {
                    someNode: ['someInlet'],
                },
                portSpecs: {
                    [inletVariableName]: {
                        access: 'r',
                        type: 'messages',
                    },
                },
            }),
            '',
            {
                inletListenersCallbacks: {
                    someNode: {
                        someInlet: (
                            messages: Array<PdSharedTypes.ControlValue>
                        ) => called.push(messages),
                    },
                },
            }
        )

        const blockSize = 18
        engine.configure(44100, blockSize)
        engine.loop()
        assert.deepStrictEqual(called, [[[0]], [[5]], [[10]], [[15]]])
    })

    it('should attach the metadata as a global string when compiled', async () => {
        const compilation = makeCompilation({
            target: 'assemblyscript',
            nodeImplementations: NODE_IMPLEMENTATIONS,
            macros,
            portSpecs: {
                bla: { access: 'rw', type: 'float' },
            },
        })
        const { wasmExports } = await compileEngine(
            compilation, // prettier-ignore
            `
                let bla: f32 = 1
            `
        )

        const metadata = JSON.parse(
            liftString(wasmExports, wasmExports.metadata.valueOf())
        )
        assert.deepStrictEqual(metadata, {
            compilation: {
                audioSettings: compilation.audioSettings,
                portSpecs: compilation.portSpecs,
                inletListeners: compilation.inletListeners,
                engineVariableNames: compilation.engineVariableNames,
            },
        } as EngineMetadata)
    })

    it('should be a wasm engine when compiled', async () => {
        const { wasmExports } = await compileEngine(
            makeCompilation({
                target: 'assemblyscript',
                nodeImplementations: NODE_IMPLEMENTATIONS,
                macros,
            })
        )

        const expectedExports: AssemblyScriptWasmExports = {
            configure: (_: number) => 0,
            loop: () => new Float32Array(),
            setArray: () => undefined,
            metadata: new WebAssembly.Global({ value: 'i32' }),
            MESSAGE_DATUM_TYPE_FLOAT: new WebAssembly.Global({ value: 'i32' }),
            MESSAGE_DATUM_TYPE_STRING: new WebAssembly.Global({ value: 'i32' }),
            createMessage: () => 0,
            getMessageDatumTypes: () => 0,
            createMessageArray: () => 0,
            pushMessageToArray: () => undefined,
            writeStringDatum: () => undefined,
            writeFloatDatum: () => undefined,
            readStringDatum: () => 0,
            readFloatDatum: () => 0,
            __new: () => 0,
            memory: new WebAssembly.Memory({ initial: 128 }),
        }

        // Plenty of low-level exported function are added by asc compiler when using
        // option 'export-runtime'
        const exportsIgnoredKeys = [
            '__collect',
            '__pin',
            '__rtti_base',
            '__unpin',
        ]

        const actualExportsKeys = Object.keys(wasmExports).filter(
            (key) => !exportsIgnoredKeys.includes(key)
        )

        assert.deepStrictEqual(
            actualExportsKeys.sort(),
            Object.keys(expectedExports).sort()
        )
    })

    describe('attachPortsVariableNames', () => {
        it('should attach variable names relating to ports and inlet listeners', () => {
            const engineVariableNames: EngineVariableNames = generateEngineVariableNames(
                NODE_IMPLEMENTATIONS,
                makeGraph({
                    node1: {
                        inlets: {
                            inlet1: { type: 'control', id: 'inlet1' },
                            inlet2: { type: 'control', id: 'inlet2' },
                        },
                    },
                })
            )
            const portSpecs: PortSpecs = {
                node1_INS_inlet1: { access: 'r', type: 'float' },
                node1_INS_inlet2: { access: 'rw', type: 'messages' },
            }
            attachPortsVariableNames(engineVariableNames, portSpecs)
            assert.deepStrictEqual(engineVariableNames.ports, {
                node1_INS_inlet1: {
                    r: 'read_node1_INS_inlet1',
                },
                node1_INS_inlet2: {
                    r_length: 'read_node1_INS_inlet2_length',
                    r_elem: 'read_node1_INS_inlet2_elem',
                    r: 'read_node1_INS_inlet2',
                    w: 'write_node1_INS_inlet2',
                },
            })
        })
    })
})
