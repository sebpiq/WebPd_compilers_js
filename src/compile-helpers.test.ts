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

import { DspGraph } from '@webpd/dsp-graph'
import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import {
    getNodeImplementation,
    graphTraversalForCompile,
    preCompileSignalAndMessageFlow,
} from './compile-helpers'
import { makeCompilation } from './test-helpers'
import { Compilation, NodeImplementation, NodeImplementations } from './types'

describe('compile-helpers', () => {
    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            someNodeType: { loop: () => `` },
            boringNodeType: {},
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType')
                    .loop,
                NODE_IMPLEMENTATIONS['someNodeType'].loop
            )
        })

        it('should fill-in all fields with default functions', () => {
            const referenceImplementation: Required<NodeImplementation<any>> = {
                stateVariables: {},
                declare: () => '',
                loop: () => '',
                messages: () => ({}),
                sharedCode: [],
            }
            const defaultImplementation = getNodeImplementation(
                NODE_IMPLEMENTATIONS,
                'boringNodeType'
            )

            assert.deepStrictEqual(
                Object.entries(referenceImplementation).map(([name, obj]) => [
                    name,
                    typeof obj === 'function' ? (obj as any)() : obj,
                ]),
                Object.entries(defaultImplementation).map(([name, obj]) => [
                    name,
                    typeof obj === 'function' ? (obj as any)() : obj,
                ])
            )
        })

        it('should throw an error if implementation doesnt exist', () => {
            assert.throws(() =>
                getNodeImplementation(
                    NODE_IMPLEMENTATIONS,
                    'someUnknownNodeType'
                )
            )
        })
    })

    describe('preCompileSignalAndMessageFlow', () => {
        describe('signal INS/OUTS', () => {
            it('should substitute connected signal IN with its source OUT', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'signal' },
                        },
                        sinks: {
                            '0': [['node2', '0']],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'signal' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1', 'node2'],
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node2.ins['0'],
                    compilation.codeVariableNames.nodes.node1.outs['0']
                )
                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: {
                            node2: ['0'],
                        },
                        precompiledOutlets: {},
                    }
                )
            })

            it('should leave unconnected signal IN unchanged', () => {
                const graph = makeGraph({
                    node1: {
                        inlets: {
                            '0': { id: '0', type: 'signal' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1'],
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: {},
                        precompiledOutlets: {},
                    }
                )
            })
        })

        describe('message SNDS', () => {
            it("should substitute message SND with the sink's RCV if only one sink", () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                            '1': { id: '1', type: 'message' },
                        },
                        sinks: {
                            '0': [
                                ['node2', '0'],
                                ['node3', '0'],
                            ],
                            '1': [['node2', '1']],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                            '1': { id: '1', type: 'message' },
                        },
                    },
                    node3: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1', 'node2', 'node3'],
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node1.snds['1'],
                    compilation.codeVariableNames.nodes.node2.rcvs['1']
                )
                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: {},
                        precompiledOutlets: {
                            node1: ['1'],
                        },
                    }
                )
            })

            it('should NOT substitute message SND if an outlet listener is also specified', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                        sinks: {
                            '0': [['node2', '0']],
                        },
                    },
                    node2: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1', 'node2'],
                    outletListenerSpecs: {
                        node1: ['0'],
                    },
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: {},
                        precompiledOutlets: {},
                    }
                )
            })

            it('should substitute SND with outlet listener if no sinks', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1'],
                    outletListenerSpecs: {
                        node1: ['0'],
                    },
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node1.snds['0'],
                    compilation.codeVariableNames.outletListeners.node1['0']
                )
                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: {},
                        precompiledOutlets: {
                            node1: ['0'],
                        },
                    }
                )
            })

            it('should substitute SND with null function if no sink and not outlet listener', () => {
                const graph = makeGraph({
                    node1: {
                        outlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1'],
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.strictEqual(
                    compilation.codeVariableNames.nodes.node1.snds['0'],
                    compilation.codeVariableNames.globs.nullMessageReceiver
                )
                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: {},
                        precompiledOutlets: {
                            node1: ['0'],
                        },
                    }
                )
            })
        })

        describe('message RCVS', () => {
            it('should remove message inlets when inlet has no source', () => {
                const graph = makeGraph({
                    node1: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1'],
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: { node1: ['0'] },
                        precompiledOutlets: {},
                    }
                )
            })

            it('should keep message inlet when inlet caller is declared', () => {
                const graph = makeGraph({
                    node1: {
                        inlets: {
                            '0': { id: '0', type: 'message' },
                        },
                    },
                })

                const compilation = makeCompilation({
                    target: 'javascript',
                    graph,
                    graphTraversal: ['node1'],
                    inletCallerSpecs: { node1: ['0'] },
                })

                preCompileSignalAndMessageFlow(compilation)

                assert.deepStrictEqual<Compilation['precompiledPortlets']>(
                    compilation.precompiledPortlets,
                    {
                        precompiledInlets: {},
                        precompiledOutlets: {},
                    }
                )
            })
        })
    })

    describe('graphTraversalForCompile', () => {
        it('should combine signal and message traversals and remove duplicates', () => {
            // [  n1  ]
            //    / \
            //   |  [  n2  ]
            //   |    /   \
            // [  n3  ]  [  n4  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    isPushingMessages: true,
                    sinks: {
                        '0': [['n4', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n3: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })
            const traversal = graphTraversalForCompile(graph, {})
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal, [
                'n2',
                'n4',
                'n1',
                'n3',
            ])
        })

        it('should add nodes that have an inlet caller declared', () => {
            const graph = makeGraph({
                n1: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })
            const traversal = graphTraversalForCompile(graph, {
                n1: ['0'],
            })
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal, ['n1'])
        })
    })
})
