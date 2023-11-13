/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import assert from 'assert'
import { NodeImplementations } from './types'
import { makeCompilation } from '../test-helpers'
import generateDeclarationsNodes from './generate-declarations-nodes'
import { makeGraph } from '../dsp-graph/test-helpers'
import precompile from './precompile'
import { ast, Var } from '../ast/declare'
import { assertAstSequencesAreEqual } from '../ast/test-helpers'

describe('generateDeclarationsNodes', () => {
    it('should compile custom declarations', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                args: {
                    arg1: 440,
                },
            },
            node2: {
                type: 'type2',
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                generateDeclarations: ({ node }) =>
                    ast`// [type1] arg1 ${node.args.arg1.toString()}`,
            },
            type2: {
                generateDeclarations: ({ compilation: { audioSettings } }) =>
                    ast`// [type2] channelCount ${audioSettings.channelCount.out.toString()}`,
            },
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1', 'node2'],
            nodeImplementations,
        })

        precompile(compilation)

        const sequence = generateDeclarationsNodes(compilation)

        assertAstSequencesAreEqual(sequence, {
            astType: 'Sequence',
            content: ['// [type1] arg1 440\n// [type2] channelCount 2'],
        })
    })

    it('should compile declarations for signal outlets declared in variable names', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                outlets: { '0': { id: '0', type: 'signal' } },
            },
            node2: {
                type: 'type2',
                inlets: {
                    '0': { id: '0', type: 'signal' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {},
            type2: {},
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1', 'node2'],
            nodeImplementations,
        })

        compilation.variableNamesIndex.nodes.node1.outs['0'] = 'node1_OUTS_0'

        const sequence = generateDeclarationsNodes(compilation)

        assertAstSequencesAreEqual(sequence, {
            astType: 'Sequence',
            content: [Var('Float', 'node1_OUTS_0', '0')],
        })
    })

    it('should compile node message receivers for message inlets declared in variable names and omit the others', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                inlets: {
                    '0': { id: '0', type: 'message' },
                    '1': { id: '1', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                generateMessageReceivers: () => ({
                    '0': ast`// [type1] message receiver 0`,
                    '1': ast`// [type1] message receiver 1`,
                }),
            },
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1'],
            nodeImplementations,
        })

        compilation.variableNamesIndex.nodes.node1.rcvs['0'] = 'node1_RCVS_0'

        const sequence = generateDeclarationsNodes(compilation)

        assertAstSequencesAreEqual(sequence, {
            astType: 'Sequence',
            content: [
                {
                    astType: 'Func',
                    name: 'node1_RCVS_0',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: [
                            '// [type1] message receiver 0\n'
                                + `throw new Error('[type1], id "node1", inlet "0", unsupported message : ' + msg_display(m))`,
                        ],
                    },
                },
            ],
        })
    })

    it('should render correct error throw if debug = true', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                generateMessageReceivers: () => ({
                    '0': ast`// [type1] message receiver`,
                }),
            },
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1'],
            debug: true,
            nodeImplementations,
        })

        compilation.variableNamesIndex.nodes.node1.rcvs['0'] = 'node1_RCVS_0'

        const sequence = generateDeclarationsNodes(compilation)

        assertAstSequencesAreEqual(sequence, {
            astType: 'Sequence',
            content: [
                {
                    astType: 'Func',
                    name: 'node1_RCVS_0',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: [
                            '// [type1] message receiver\n' +
                                `throw new Error('[type1], id "node1", inlet "0", unsupported message : ' + msg_display(m) + '\\nDEBUG : remember, you must return from message receiver')`,
                        ],
                    },
                },
            ],
        })
    })

    it('should throw an error if no implementation for message receiver', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                generateMessageReceivers: () => ({}),
            },
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1'],
            nodeImplementations,
        })

        compilation.variableNamesIndex.nodes.node1.rcvs['0'] = 'node1_RCVS_0'

        assert.throws(() => generateDeclarationsNodes(compilation))
    })

    it('should not throw an error if message receiver is implemented but string empty', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                generateMessageReceivers: () => ({ '0': ast`` }),
            },
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1'],
            nodeImplementations,
        })

        compilation.variableNamesIndex.nodes.node1.rcvs['0'] = 'node1_RCVS_0'

        assert.doesNotThrow(() => generateDeclarationsNodes(compilation))
    })

    it('should compile node message senders for message outlets declared in variable names and omit others', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                outlets: {
                    '0': { id: '0', type: 'message' },
                    // This one will be omitted
                    '1': { id: '1', type: 'message' },
                },
                sinks: {
                    '0': [
                        ['node2', '0'],
                        ['node3', '0'],
                    ],
                },
            },
            node2: {
                type: 'type2',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
            node3: {
                type: 'type2',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {},
            type2: {
                generateMessageReceivers: () => ({
                    '0': ast`// [type2] message receiver`,
                }),
            },
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1', 'node2', 'node3'],
            nodeImplementations,
        })

        compilation.variableNamesIndex.nodes.node1.snds['0'] = 'node1_SNDS_0'
        compilation.variableNamesIndex.nodes.node2.rcvs['0'] = 'node2_RCVS_0'
        compilation.precompilation.node2.rcvs['0'] = 'node2_RCVS_0'
        compilation.variableNamesIndex.nodes.node3.rcvs['0'] = 'node3_RCVS_0'
        compilation.precompilation.node3.rcvs['0'] = 'node3_RCVS_0'

        const sequence = generateDeclarationsNodes(compilation)

        assertAstSequencesAreEqual(sequence, {
            astType: 'Sequence',
            content: [
                {
                    astType: 'Func',
                    name: 'node2_RCVS_0',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: [
                            '// [type2] message receiver\n' + 
                                `throw new Error('[type2], id "node2", inlet "0", unsupported message : ' + msg_display(m))`,
                        ],
                    },
                },
                {
                    astType: 'Func',
                    name: 'node3_RCVS_0',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: [
                            '// [type2] message receiver\n' + 
                                `throw new Error('[type2], id "node3", inlet "0", unsupported message : ' + msg_display(m))`,
                        ],
                    },
                },
                {
                    astType: 'Func',
                    name: 'node1_SNDS_0',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: ['node2_RCVS_0(m)\nnode3_RCVS_0(m)'],
                    },
                },
            ],
        })
    })

    it('should inject outlet listener in node message senders', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                outlets: {
                    '0': { id: '0', type: 'message' },
                    '1': { id: '1', type: 'message' },
                },
                sinks: { '1': [['node2', '0']] },
            },
            node2: {
                type: 'type2',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {},
            type2: {
                generateMessageReceivers: () => ({
                    '0': ast`// [type2] message receiver`,
                }),
            },
        }

        const outletListenerSpecs = { node1: ['0', '1'] }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1', 'node2'],
            nodeImplementations,
            outletListenerSpecs,
        })

        compilation.variableNamesIndex.nodes.node1.snds['0'] = 'node1_SNDS_0'
        compilation.variableNamesIndex.nodes.node1.snds['1'] = 'node1_SNDS_1'
        compilation.variableNamesIndex.nodes.node2.rcvs['0'] = 'node2_RCVS_0'
        compilation.precompilation.node2.rcvs['0'] = 'node2_RCVS_0'
        compilation.variableNamesIndex.outletListeners.node1 = {}
        compilation.variableNamesIndex.outletListeners.node1['0'] =
            'outletListener_node1_0'
        compilation.variableNamesIndex.outletListeners.node1['1'] =
            'outletListener_node1_1'

        const sequence = generateDeclarationsNodes(compilation)

        assertAstSequencesAreEqual(sequence, {
            astType: 'Sequence',
            content: [
                {
                    astType: 'Func',
                    name: 'node2_RCVS_0',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: [
                            '// [type2] message receiver\n' + 
                                `throw new Error('[type2], id "node2", inlet "0", unsupported message : ' + msg_display(m))`,
                        ],
                    },
                },
                {
                    astType: 'Func',
                    name: 'node1_SNDS_0',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: ['outletListener_node1_0(m)'],
                    },
                },
                {
                    astType: 'Func',
                    name: 'node1_SNDS_1',
                    args: [
                        {
                            astType: 'Var',
                            name: 'm',
                            type: 'Message',
                            value: undefined,
                        },
                    ],
                    returnType: 'void',
                    body: {
                        astType: 'Sequence',
                        content: ['outletListener_node1_1(m)\nnode2_RCVS_0(m)'],
                    },
                },
            ],
        })
    })

    it('should not fail when node implementation has no "generateDeclarations" hook', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                inlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'signal' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {},
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1'],
            nodeImplementations,
        })

        precompile(compilation)

        assert.doesNotThrow(() => generateDeclarationsNodes(compilation))
    })
})