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
import { makeGraph } from '../../test-helpers/graph-test-helpers'
import precompile from '.'
import { NodeImplementations } from '../types'
import { ColdDspGroup, DspGroup } from './types'
import { Class, Sequence, Var, ast } from '../../ast/declare'
import { AstSequence } from '../../ast/types'
import { makeSettings } from '../test-helpers'

describe('precompile', () => {
    const SETTINGS = makeSettings({})

    it('should precompile the inline dsp code', () => {
        //       [  nonInline1  ]
        //         |
        //       [  n1  ]
        //            \
        // [  n2  ]  [  n3  ]
        //   \        /
        //    \      /
        //     \    /
        //    [  n4  ]
        //       |
        //    [  nonInline2  ]
        const graph = makeGraph({
            nonInline1: {
                type: 'signalType',
                sinks: {
                    '0': [['n1', '0']],
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n1: {
                type: 'inlinableType1',
                args: { value: 'N1' },
                sinks: {
                    '0': [['n3', '0']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n2: {
                type: 'inlinableType0',
                args: { value: 'N2' },
                sinks: {
                    '0': [['n4', '0']],
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n3: {
                type: 'inlinableType1',
                args: { value: 'N3' },
                sinks: {
                    '0': [['n4', '1']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n4: {
                type: 'inlinableType2',
                args: { value: 'N4' },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'signal', id: '1' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    '0': [['nonInline2', '0']],
                },
            },
            nonInline2: {
                type: 'signalType',
                isPullingSignal: true,
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            inlinableType0: {
                flags: {
                    isDspInline: true,
                },
                dsp: ({ node: { args } }) => ast`${args.value} + 1`,
            },
            inlinableType1: {
                flags: {
                    isDspInline: true,
                },
                dsp: ({ node: { args }, ins }) =>
                    ast`${ins.$0!} * ${args.value}`,
            },
            inlinableType2: {
                flags: {
                    isDspInline: true,
                },
                dsp: ({ node: { args }, ins }) =>
                    ast`${args.value} * ${ins.$0!} - ${
                        args.value
                    } * ${ins.$1!}`,
            },
            signalType: {
                dsp: () => ast`// dsp signalType`,
            },
        }

        const { precompiledCode } = precompile({
            graph,
            nodeImplementations,
            settings: SETTINGS,
        })

        assert.strictEqual(
            precompiledCode.nodes.nonInline2!.signalIns['0'],
            '(N4 * (N2 + 1) - N4 * ((N_nonInline1_outs_0 * N1) * N3))'
        )

        assert.deepStrictEqual<DspGroup>(precompiledCode.graph.hotDspGroup, {
            traversal: ['nonInline1', 'nonInline2'],
            outNodesIds: ['nonInline2'],
        })
    })

    it('should precompile cold dsp groups and play well with inline dsp', () => {
        //
        //           [  n1  ]  <- inlinable & cold dsp
        //             |
        // [  n3  ]  [  n2  ]  <- inlinable but also out node of the dsp group
        //   \        /
        //    \      /
        //     \    /
        //    [  n4  ]
        //
        const graph = makeGraph({
            n1: {
                type: 'inlinableAndColdType',
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    0: [['n2', '0']],
                },
            },
            n2: {
                type: 'inlinableAndColdType',
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    0: [['n4', '0']],
                },
            },
            n3: {
                type: 'signalType',
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    0: [['n4', '1']],
                },
            },
            n4: {
                type: 'signalType',
                isPullingSignal: true,
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'signal', id: '1' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            signalType: {
                dsp: () => ast`// dsp signalType`,
            },
            inlinableAndColdType: {
                flags: {
                    isPureFunction: true,
                    isDspInline: true,
                },
                dsp: ({ ins }) => ast`1 + ${ins.$0!}`,
            },
        }

        const { precompiledCode } = precompile({
            graph,
            nodeImplementations,
            settings: SETTINGS,
        })

        assert.deepStrictEqual<DspGroup>(precompiledCode.graph.hotDspGroup, {
            traversal: ['n3', 'n4'],
            outNodesIds: ['n4'],
        })

        assert.deepStrictEqual<{ [groupId: string]: ColdDspGroup }>(
            precompiledCode.graph.coldDspGroups,
            {
                '0': {
                    // n1 has been inlined
                    dspGroup: {
                        traversal: ['n2'],
                        outNodesIds: ['n2'],
                    },
                    sinkConnections: [
                        [
                            { nodeId: 'n2', portletId: '0' },
                            { nodeId: 'n4', portletId: '0' },
                        ],
                    ],
                    functionName: 'COLD_0',
                },
            }
        )

        assert.strictEqual(
            precompiledCode.nodes.n2!.signalIns['0'],
            '(1 + NULL_SIGNAL)'
        )
    })

    it('should precompile cold dsp groups and inlets dsp functions', () => {
        //
        //  [  n1  ]  <- out node of the dsp group
        //    |
        //  [  n2  ]  <- sink node with inlet dsp function
        //
        const graph = makeGraph({
            n1: {
                type: 'coldNodeType',
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    0: [['n2', '0']],
                },
            },
            n2: {
                type: 'signalType',
                isPullingSignal: true,
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            signalType: {
                dsp: () => ({
                    inlets: {
                        '0': ast`// inlet dsp 0`,
                    },
                    loop: ast`// dsp signalType`,
                }),
            },
            coldNodeType: {
                flags: {
                    isPureFunction: true,
                    isDspInline: true,
                },
                dsp: ({ ins }) => ast`1 + ${ins.$0!}`,
            },
        }

        const { precompiledCode } = precompile({
            graph,
            nodeImplementations,
            settings: SETTINGS,
        })

        assert.deepStrictEqual<{ [groupId: string]: ColdDspGroup }>(
            precompiledCode.graph.coldDspGroups,
            {
                '0': {
                    dspGroup: {
                        traversal: ['n1'],
                        outNodesIds: ['n1'],
                    },
                    sinkConnections: [
                        [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n2', portletId: '0' },
                        ],
                    ],
                    functionName: 'COLD_0',
                },
            }
        )

        assert.deepStrictEqual<AstSequence>(
            precompiledCode.nodes.n2!.dsp.inlets['0'],
            Sequence([ast`// inlet dsp 0`])
        )
    })

    it('should not fail with unused node implementations', () => {
        const graph = makeGraph({
            n1: {
                type: 'type1',
                isPullingSignal: true,
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                state: ({ ns }) => Class(ns.State!, [Var(`Int`, `bla`, 0)]),
                dsp: () => ast`// dsp n1`,
                dependencies: [],
            },
            // Unused node implementation
            type2: {
                state: ({ ns }) => Class(ns.State!, [Var(`Int`, `bla`, 0)]),
            },
        }

        const precompilation = precompile({
            graph,
            nodeImplementations,
            settings: SETTINGS,
        })

        assert.deepStrictEqual(
            precompilation.precompiledCode.nodeImplementations.type1,
            {
                nodeImplementation: nodeImplementations.type1,
                stateClass: Class('NT_type1_State', [
                    Var(`Int`, `bla`, undefined),
                ]),
                core: null,
            }
        )

        assert.ok(
            !('type2' in precompilation.precompiledCode.nodeImplementations)
        )
    })
})
