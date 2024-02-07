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
import { NodeImplementations } from '../types'
import { makeGraph } from '../../dsp-graph/test-helpers'
import {
    AnonFunc,
    Class,
    ConstVar,
    Func,
    Sequence,
    Var,
    ast,
} from '../../ast/declare'
import {
    assertAstSequencesAreEqual,
    normalizeAstSequence,
    makeRenderInput,
    makeSettings,
} from '../test-helpers'
import templates from './templates'
import { AstSequence } from '../../ast/types'

describe('templates', () => {
    describe('templates.portletsDeclarations', () => {
        const MESSAGE_RECEIVER_FUNC = AnonFunc([Var('Message', 'm')])``

        it('should compile declarations for signal outlets', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.graph.fullTraversal = ['n1', 'n2']
            renderInput.precompiledCode.nodes.n1!.signalOuts.$0 = 'n1_OUTS_0'
            renderInput.precompiledCode.nodes.n1!.signalOuts.$1 = 'n1_OUTS_1'
            renderInput.precompiledCode.nodes.n2!.signalOuts.$0 = 'n2_OUTS_0'

            const sequence = templates.portletsDeclarations(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    Var('Float', 'n1_OUTS_0', '0'),
                    Var('Float', 'n1_OUTS_1', '0'),
                    Var('Float', 'n2_OUTS_0', '0'),
                ],
            })
        })

        it('should compile node message receivers', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true
                },
                n2: {
                    isPushingMessages: true
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.graph.fullTraversal = ['n1', 'n2']
            renderInput.precompiledCode.nodes.n1!.messageReceivers.$0 = Func(
                'n1_RCVS_0',
                [Var('Message', 'm')]
            )`// [n1] message receiver 0`
            renderInput.precompiledCode.nodes.n1!.messageReceivers.$1 = Func(
                'n1_RCVS_1',
                [Var('Message', 'm')]
            )`// [n1] message receiver 1`
            renderInput.precompiledCode.nodes.n2!.messageReceivers.$0 = Func(
                'n2_RCVS_0',
                [Var('Message', 'm')]
            )`// [n2] message receiver 0`

            const sequence = templates.portletsDeclarations(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_RCVS_0',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [n1] message receiver 0\n' +
                                    `throw new Error('Node "n1", inlet "0", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_RCVS_1',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [n1] message receiver 1\n' +
                                    `throw new Error('Node "n1", inlet "1", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n2_RCVS_0',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [n2] message receiver 0\n' +
                                    `throw new Error('Node "n2", inlet "0", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                ],
            })
        })

        it('should render correct error throw if debug = true', () => {
            const settings = makeSettings({ debug: true })

            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
                settings,
            })

            renderInput.precompiledCode.graph.fullTraversal = ['n1']
            renderInput.precompiledCode.nodes.n1!.messageReceivers.$0 = Func(
                'n1_RCVS_0',
                [Var('Message', 'm')]
            )`// [n1] message receiver 0`

            const sequence = templates.portletsDeclarations(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'n1_RCVS_0',
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
                                '// [n1] message receiver 0\n' +
                                    `throw new Error('Node "n1", inlet "0", unsupported message : ' + msg_display(m) + '\\nDEBUG : remember, you must return from message receiver')`,
                            ],
                        },
                    },
                ],
            })
        })

        it('should compile node message senders', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
                n2: {
                    isPushingMessages: true,
                },
                n3: {
                    isPushingMessages: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.graph.fullTraversal = ['n1', 'n2', 'n3']
            renderInput.precompiledCode.nodes.n1!.messageSenders.$0 = {
                messageSenderName: 'n1_SNDS_0',
                functionNames: ['n2_RCVS_0', 'n2_RCVS_1', 'DSP_1'],
            }
            renderInput.precompiledCode.nodes.n1!.messageSenders.$1 = {
                messageSenderName: 'n1_SNDS_1',
                functionNames: ['outlerListener_n1_0'],
            }
            renderInput.precompiledCode.nodes.n2!.messageSenders.$0 = {
                messageSenderName: 'n2_SNDS_0',
                functionNames: ['n3_RCVS_0'],
            }

            const sequence = templates.portletsDeclarations(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_SNDS_0',
                        body: {
                            astType: 'Sequence',
                            content: ['n2_RCVS_0(m)\nn2_RCVS_1(m)\nDSP_1(m)'],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_SNDS_1',
                        body: {
                            astType: 'Sequence',
                            content: ['outlerListener_n1_0(m)'],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n2_SNDS_0',
                        body: {
                            astType: 'Sequence',
                            content: ['n3_RCVS_0(m)'],
                        },
                    },
                ],
            })
        })
    })

    describe('templates.nodeStateInstances', () => {
        it('should compile declarations for node state and filter out nodes with no state declaration', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
                n2: {
                    isPushingMessages: true,
                },
                n3: {
                    isPushingMessages: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.graph.fullTraversal = ['n1', 'n2', 'n3']
            renderInput.precompiledCode.nodes.n1!.state = {
                className: 'State',
                initialization: {
                    a: Sequence(['111']),
                    b: Sequence([AnonFunc([Var('Float', 'x')])`return x * 2`]),
                },
            }
            renderInput.precompiledCode.nodes.n2!.state = {
                className: 'State',
                initialization: {
                    a: Sequence(['333']),
                    b: Sequence(['444']),
                },
            }
            renderInput.precompiledCode.nodes.n3!.state = null

            const sequence = templates.nodeStateInstances(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    ConstVar(
                        'State',
                        'n1_STATE',
                        ast`{\na: 111,\nb: ${AnonFunc([
                            Var('Float', 'x'),
                        ])`return x * 2`},\n}`
                    ),
                    ConstVar('State', 'n2_STATE', ast`{\na: 333,\nb: 444,\n}`),
                ],
            })
        })
    })

    describe('templates.nodeImplementationsCoreAndStateClasses', () => {
        it('should generate initializations for nodes', () => {
            const renderInput = makeRenderInput({})

            renderInput.precompiledCode.nodeImplementations.type1 = {
                stateClass: Class('State_type1', [Var('Float', 'a')]),
                core: Sequence([
                    ConstVar('Bla', 'bla', '"hello"'),
                    Func('blo', [Var('State_type1', 'state')])`// blo`,
                ]),
                nodeImplementation: {},
            }

            renderInput.precompiledCode.nodeImplementations.type2 = {
                stateClass: Class('State_type2', [Var('Float', 'b')]),
                core: Sequence([ConstVar('Int', 'i', '0')]),
                nodeImplementation: {},
            }

            const sequence =
                templates.nodeImplementationsCoreAndStateClasses(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Class',
                        name: 'State_type1',
                        members: [
                            {
                                astType: 'Var',
                                name: 'a',
                                type: 'Float',
                                value: undefined,
                            },
                        ],
                    },
                    {
                        astType: 'ConstVar',
                        name: 'bla',
                        type: 'Bla',
                        value: ast`"hello"`,
                    },
                    {
                        astType: 'Func',
                        name: 'blo',
                        args: [
                            {
                                astType: 'Var',
                                name: 'state',
                                type: 'State_type1',
                                value: undefined,
                            },
                        ],
                        returnType: 'void',
                        body: {
                            astType: 'Sequence',
                            content: ['// blo'],
                        },
                    },
                    {
                        astType: 'Class',
                        name: 'State_type2',
                        members: [
                            {
                                astType: 'Var',
                                name: 'b',
                                type: 'Float',
                                value: undefined,
                            },
                        ],
                    },
                    {
                        astType: 'ConstVar',
                        name: 'i',
                        type: 'Int',
                        value: ast`0`,
                    },
                ],
            })
        })
    })

    describe('templates.nodeInitializations', () => {
        it('should generate initializations for nodes', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                },
                n2: {
                    isPushingMessages: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.graph.fullTraversal = ['n1', 'n2']
            renderInput.precompiledCode.nodes.n1!.initialization = ast`
                ${Var('Float', 'n1', '0')}
                console.log(n1)
            `
            renderInput.precompiledCode.nodes.n2!.initialization = ast``

            const sequence = templates.nodeInitializations(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [Var('Float', 'n1', '0'), 'console.log(n1)'],
            })
        })
    })

    describe('templates.ioMessageReceivers', () => {
        it('should compile declared inlet callers', () => {
            const settings = makeSettings({
                io: {
                    messageReceivers: { n1: { portletIds: ['0'] } },
                    messageSenders: {},
                },
            })

            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    messageReceivers: () => ({
                        '0': AnonFunc(
                            [Var('Message', 'm')],
                            'void'
                        )`// [type1] message receiver`,
                    }),
                },
            }

            const renderInput = makeRenderInput({
                graph,
                settings,
                nodeImplementations,
            })

            renderInput.precompiledCode.variableNamesIndex.nodes.n1!.messageReceivers.$0 =
                'n1_RCVS_0'
            renderInput.precompiledCode.variableNamesIndex.io.messageReceivers.n1!.$0!.nodeId = 'n_ioRcv_n1_0'
            renderInput.precompiledCode.variableNamesIndex.io.messageReceivers.n1!.$0!.funcName = 'ioRcv_n1_0'
            renderInput.precompiledCode.nodes.n_ioRcv_n1_0!.generationContext.messageSenders.$0 = 'n1_SNDS_0'

            const sequence = templates.ioMessageReceivers(renderInput)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'ioRcv_n1_0',
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
                            content: ['n1_SNDS_0(m)'],
                        },
                    },
                ],
            })
        })
    })

    describe('templates.dspLoop', () => {
        it('should compile the dsp loop function', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
                n3: {
                    isPullingSignal: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.graph.hotDspGroup = {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            }
            renderInput.precompiledCode.nodes.n1!.dsp.loop = ast`// n1`
            renderInput.precompiledCode.nodes.n2!.dsp.loop = ast`// n2`
            renderInput.precompiledCode.nodes.n3!.dsp.loop = ast`// n3`

            const sequence = templates.dspLoop(renderInput)

            assert.deepStrictEqual<AstSequence>(
                normalizeAstSequence(sequence),
                {
                    astType: 'Sequence',
                    content: [
                        `for (F = 0; F < BLOCK_SIZE; F++) {\n_commons_emitFrame(FRAME)\n` +
                            '// n1\n' +
                            '// n2\n' +
                            '// n3\n' +
                            `FRAME++\n}`,
                    ],
                }
            )
        })

        it('should add to the dsp loop inlet dsp functions not connected to cold dsp', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.nodes.n1!.dsp.inlets.$0 = ast`// inlet dsp 0`
            renderInput.precompiledCode.nodes.n1!.dsp.loop = ast`// n1`
            renderInput.precompiledCode.graph.hotDspGroup = {
                traversal: ['n1'],
                outNodesIds: ['n1'],
            }
            renderInput.precompiledCode.graph.coldDspGroups = {}

            const sequence = templates.dspLoop(renderInput)

            assert.deepStrictEqual<AstSequence>(
                normalizeAstSequence(sequence),
                {
                    astType: 'Sequence',
                    content: [
                        `for (F = 0; F < BLOCK_SIZE; F++) {\n_commons_emitFrame(FRAME)\n` +
                            '// inlet dsp 0\n' +
                            '// n1\n' +
                            `FRAME++\n}`,
                    ],
                }
            )
        })
    })

    describe('templates.coldDspInitialization', () => {
        it('should compile cold dsp initialization', () => {
            const graph = makeGraph({})

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.graph.coldDspGroups = {
                '0': {
                    traversal: [],
                    outNodesIds: [],
                    sinkConnections: [],
                },
                '1': {
                    traversal: [],
                    outNodesIds: [],
                    sinkConnections: [],
                },
            }

            renderInput.precompiledCode.variableNamesIndex.coldDspGroups.$0 =
                'DSP_0'
            renderInput.precompiledCode.variableNamesIndex.coldDspGroups.$1 =
                'DSP_1'

            const sequence = templates.coldDspInitialization(renderInput)

            assertAstSequencesAreEqual(normalizeAstSequence(sequence), {
                astType: 'Sequence',
                content: [`DSP_0(EMPTY_MESSAGE)\nDSP_1(EMPTY_MESSAGE)`],
            })
        })
    })

    describe('templates.coldDspFunctions', () => {
        it('should compile cold dsp functions', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
                n3: {
                    isPullingSignal: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.nodes.n1!.dsp.loop = ast`// n1`
            renderInput.precompiledCode.nodes.n2!.dsp.loop = ast`// n2`
            renderInput.precompiledCode.nodes.n3!.dsp.loop = ast`// n3`

            renderInput.precompiledCode.graph.coldDspGroups = {
                '0': {
                    traversal: ['n1', 'n2'],
                    outNodesIds: ['n2'],
                    sinkConnections: [],
                },
                '1': {
                    traversal: ['n3'],
                    outNodesIds: ['n3'],
                    sinkConnections: [],
                },
            }

            renderInput.precompiledCode.variableNamesIndex.coldDspGroups.$0 =
                'DSP_0'
            renderInput.precompiledCode.variableNamesIndex.coldDspGroups.$1 =
                'DSP_1'

            const sequence = templates.coldDspFunctions(renderInput)

            assertAstSequencesAreEqual(normalizeAstSequence(sequence), {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'DSP_0',
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
                            content: ['// n1' + '\n' + '// n2'],
                        },
                    },
                    {
                        astType: 'Func',
                        name: 'DSP_1',
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
                            content: ['// n3'],
                        },
                    },
                ],
            })
        })

        it('should add calls to inlet dsp functions which are connected to cold dsp groups', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.nodes.n1!.dsp.loop = ast`// n1`
            renderInput.precompiledCode.nodes.n2!.dsp.inlets.$0 = ast`// inlet dsp n2`
            renderInput.precompiledCode.graph.coldDspGroups = {
                '0': {
                    traversal: ['n1'],
                    outNodesIds: ['n1'],
                    sinkConnections: [
                        [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n2', portletId: '0' },
                        ],
                    ],
                },
            }
            renderInput.precompiledCode.variableNamesIndex.coldDspGroups.$0 =
                'DSP_0'

            const sequence = templates.coldDspFunctions(renderInput)

            assertAstSequencesAreEqual(normalizeAstSequence(sequence), {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'DSP_0',
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
                            content: ['// n1\n// inlet dsp n2'],
                        },
                    },
                ],
            })
        })

        it('should not add calls to inlet dsp if not defined by the sink node', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                },
                n2: {
                    isPullingSignal: true,
                },
            })

            const renderInput = makeRenderInput({
                graph,
            })

            renderInput.precompiledCode.nodes.n1!.dsp.loop = ast`// n1`
            renderInput.precompiledCode.graph.coldDspGroups = {
                '0': {
                    traversal: ['n1'],
                    outNodesIds: ['n1'],
                    sinkConnections: [
                        [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n2', portletId: '0' },
                        ],
                    ],
                },
            }
            renderInput.precompiledCode.variableNamesIndex.coldDspGroups.$0 =
                'DSP_0'

            const sequence = templates.coldDspFunctions(renderInput)

            assertAstSequencesAreEqual(normalizeAstSequence(sequence), {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'DSP_0',
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
                            content: ['// n1'],
                        },
                    },
                ],
            })
        })
    })
})
