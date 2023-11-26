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
import {
    assertValidNamePart,
    attachNodePortlet,
    attachOutletListenersAndInletCallers,
    generateVariableNamesIndex,
} from './variable-names-index'
import { VariableNamesIndex, NodeImplementations } from './types'
import { makeGraph } from '../dsp-graph/test-helpers'
import { makeCompilation } from '../test-helpers'

describe('variable-names-index', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        type1: {},
        type2: {}
    }

    describe('generate', () => {
        it('should create state variable names for each node', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
                node2: {
                    type: 'type2',
                },
            })

            const variableNamesIndex = generateVariableNamesIndex(NODE_IMPLEMENTATIONS, graph, false)

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    node1: {
                        outs: {},
                        snds: {},
                        rcvs: {},
                        state: 'node1_STATE',
                    },
                    node2: {
                        outs: {},
                        rcvs: {},
                        snds: {},
                        state: 'node2_STATE',
                    },
                }
            )
        })

        it('should throw error for unknown namespaces', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const variableNamesIndex = generateVariableNamesIndex(NODE_IMPLEMENTATIONS, graph, false)

            assert.throws(() => variableNamesIndex.nodes.unknownNode)
            assert.throws(
                () => variableNamesIndex.nodes.node1.rcvs['unknown receiver']
            )
            assert.throws(
                () => variableNamesIndex.nodes.node1.outs['unknown portlet']
            )
            assert.throws(
                () => variableNamesIndex.nodes.node1.snds['unknown sender']
            )
        })
    })

    describe('attachNodePortlet', () => {
        it('should attach portlet variable names for a node', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                        '2': { type: 'signal', id: '2' },
                        '3': { type: 'message', id: '3' },
                    },
                },
                node2: {
                    type: 'type2',
                }
            })

            const variableNamesIndex = generateVariableNamesIndex(NODE_IMPLEMENTATIONS, graph, false)

            const compilation = makeCompilation({
                nodeImplementations: NODE_IMPLEMENTATIONS,
                variableNamesIndex: variableNamesIndex,
                graph,
            })

            attachNodePortlet(compilation, 'outs', 'node1', '0')
            attachNodePortlet(compilation, 'outs', 'node1', '2')
            attachNodePortlet(compilation, 'snds', 'node1', '1')
            attachNodePortlet(compilation, 'snds', 'node1', '3')
            attachNodePortlet(compilation, 'rcvs', 'node1', '1')

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    node1: {
                        outs: {
                            '0': 'node1_OUTS_0',
                            '2': 'node1_OUTS_2',
                        },
                        snds: {
                            '1': 'node1_SNDS_1',
                            '3': 'node1_SNDS_3',
                        },
                        rcvs: {
                            '1': 'node1_RCVS_1',
                        },
                        state: 'node1_STATE',
                    },
                    node2: {
                        outs: {},
                        rcvs: {},
                        snds: {},
                        state: 'node2_STATE',
                    },
                }
            )
        })

        it('should create more verbose variable names if debug is true', () => {
            const nodeImplementations: NodeImplementations = {
                'dac~bla*wow!': {},
            }

            const graph = makeGraph({
                someObj: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                    type: 'dac~bla*wow!',
                },
            })

            const variableNamesIndex = generateVariableNamesIndex(nodeImplementations, graph, true)

            const compilation = makeCompilation({
                nodeImplementations,
                variableNamesIndex,
                debug: true,
                graph,
            })

            attachNodePortlet(compilation, 'outs', 'someObj', '0')
            attachNodePortlet(compilation, 'snds', 'someObj', '1')
            attachNodePortlet(compilation, 'rcvs', 'someObj', '2')

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    someObj: {
                        outs: {
                            '0': 'dacblawow_someObj_OUTS_0',
                        },
                        snds: {
                            '1': 'dacblawow_someObj_SNDS_1',
                        },
                        rcvs: {
                            '2': 'dacblawow_someObj_RCVS_2',
                        },
                        state: 'dacblawow_someObj_STATE',
                    },
                }
            )
        })

        it('should not throw an error if variable already assigned', () => {
            const graph = makeGraph({
                node1: {},
            })

            const compilation = makeCompilation({ graph })

            attachNodePortlet(compilation, 'rcvs', 'node1', '0')
            assert.strictEqual(compilation.variableNamesIndex.nodes.node1.rcvs.$0, 'node1_RCVS_0')
            assert.doesNotThrow(() => attachNodePortlet(compilation, 'rcvs', 'node1', '0'))
            assert.strictEqual(compilation.variableNamesIndex.nodes.node1.rcvs.$0, 'node1_RCVS_0')
        })
    })

    describe('assertValidNamePart', () => {
        it('should throw an error if name part contains invalid characters', () => {
            assert.throws(() => assertValidNamePart('bla)-he'))
            assert.throws(() => assertValidNamePart('bla he'))
        })

        it('should not throw an error if name part is valid', () => {
            assert.deepStrictEqual(assertValidNamePart('bla_he0'), 'bla_he0')
        })
    })

    describe('attachOutletListenersAndInletCallers', () => {
        it('should attach outlet listeners variable names', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                    inlets: {
                        inlet1: { type: 'message', id: 'inlet1' },
                    },
                    outlets: {
                        outlet1: { type: 'message', id: 'outlet1' },
                        outlet2: { type: 'message', id: 'outlet2' },
                    },
                },
            })

            const variableNamesIndex: VariableNamesIndex = generateVariableNamesIndex(
                NODE_IMPLEMENTATIONS,
                graph,
                false
            )
            const outletListenerSpecs = {
                node1: ['outlet1'],
            }
            const inletCallerSpecs = {
                node1: ['inlet1'],
            }

            const compilation = makeCompilation({
                graph,
                outletListenerSpecs,
                inletCallerSpecs,
                variableNamesIndex,
                nodeImplementations: NODE_IMPLEMENTATIONS,
            })

            attachOutletListenersAndInletCallers(compilation)
            assert.deepStrictEqual(variableNamesIndex.outletListeners, {
                node1: {
                    outlet1: 'outletListeners_node1_outlet1',
                },
            })
            assert.deepStrictEqual(variableNamesIndex.inletCallers, {
                node1: {
                    inlet1: 'inletCallers_node1_inlet1',
                },
            })
        })
    })
})