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
import { GlobalDefinitions } from '../types'
import precompileDependencies, {
    collectAndDedupeExports,
    collectAndDedupeImports,
    flattenDependencies,
    instantiateAndDedupeDependencies,
} from './dependencies'
import { Class, Func, Sequence, ast } from '../../ast/declare'
import { makeGraph } from '../../test-helpers/graph-test-helpers'
import { PrecompiledCode } from './types'
import { makePrecompilation } from '../test-helpers'

describe('precompile.dependencies', () => {
    describe('default', () => {
        it('should collect, precompile and deduplicate nested dependencies code and add minimal dependencies', () => {
            // ARRANGE
            const globalDefinitions1: GlobalDefinitions = {
                namespace: 'module1',
                code: () => ast`"bli"`,
                dependencies: [
                    { namespace: '_', code: () => ast`"bla"` },
                    { namespace: '_', code: () => ast`"ble"` },
                ],
            }

            const globalDefinitions2: GlobalDefinitions = {
                namespace: 'module2',
                code: () => ast`"blu"`,
                dependencies: [
                    { namespace: '_', code: () => ast`"bly"` },
                    { namespace: '_', code: () => ast`"blo"` },
                    globalDefinitions1,
                ],
            }

            const dependencies: Array<GlobalDefinitions> = [
                { namespace: '_', code: () => ast`"bla"` },
                globalDefinitions2,
            ]

            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations = {
                type1: {
                    dependencies,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCode.graph.fullTraversal = ['node1']

            // ACT
            precompileDependencies(precompilation, [])

            // ASSERT
            assert.deepStrictEqual<PrecompiledCode['dependencies']>(
                precompilation.precompiledCode.dependencies,
                {
                    ast: Sequence([
                        ast`"bla"`,
                        ast`"bly"`,
                        ast`"blo"`,
                        ast`"ble"`,
                        ast`"bli"`,
                        ast`"blu"`,
                    ]),
                    exports: [],
                    imports: [],
                }
            )
        })

        it('should collect, precompile and deduplicate imports and exports', () => {
            // ARRANGE
            const globalDefinitions1: GlobalDefinitions = {
                namespace: 'module1',
                code: () => ast`"bli"`,
                dependencies: [] as Array<GlobalDefinitions>,
                imports: () => [Func('bla')``, Func('bli')``],
                exports: () => ['ble', 'blo'],
            }
            const globalDefinitions2: GlobalDefinitions = {
                namespace: 'module2',
                code: () => ast`"blu"`,
                dependencies: [globalDefinitions1],
                imports: () => [Func('bli')``],
                exports: () => ['blo'],
            }
            const dependencies: Array<GlobalDefinitions> = [
                { namespace: '_', code: () => ast`"bla"` },
                globalDefinitions2,
            ]

            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations = {
                type1: {
                    dependencies,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCode.graph.fullTraversal = ['node1']

            // ACT
            precompileDependencies(precompilation, [])

            // ASSERT
            assert.deepStrictEqual<PrecompiledCode['dependencies']['exports']>(
                precompilation.precompiledCode.dependencies.exports,
                ['ble', 'blo']
            )
            assert.deepStrictEqual<PrecompiledCode['dependencies']['imports']>(
                precompilation.precompiledCode.dependencies.imports,
                [Func('bla')``, Func('bli')``]
            )
        })

        it('should add new variables to the namespace', () => {
            // ARRANGE
            const dependencies: Array<GlobalDefinitions> = [
                {
                    namespace: 'module1',
                    code: ({ ns: module1 }) =>
                        Sequence([
                            Func(module1.func1!)``,
                            Class(module1.Class1!, []),
                        ]),
                },
                {
                    namespace: 'module2',
                    code: ({ ns: module2 }) =>
                        Sequence([Func(module2.func2!)``]),
                },
            ]

            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations = {
                type1: {
                    dependencies,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCode.graph.fullTraversal = ['node1']

            // ACT
            precompileDependencies(precompilation, [])

            // ASSERT
            assert.deepStrictEqual<PrecompiledCode['dependencies']>(
                precompilation.precompiledCode.dependencies,
                {
                    ast: Sequence([
                        Func('G_module1_func1')``,
                        Class('G_module1_Class1', []),
                        Func('G_module2_func2')``,
                    ]),
                    exports: [],
                    imports: [],
                }
            )
        })
    })

    describe('collectDependencies', () => {
        it('should compile the global code, removing duplicates', () => {
            const precompilation = makePrecompilation({})

            const bli = ast`"bli"`
            const blo = ast`"blo"`
            const bla1 = ast`"bla"`
            const bla2 = ast`"bla"`

            const bloDefinitions: GlobalDefinitions = {
                namespace: '_',
                code: () => blo,
            }
            const blaDefinitions1: GlobalDefinitions = {
                namespace: '_',
                code: () => bla1,
            }
            const blaDefinitions2: GlobalDefinitions = {
                namespace: '_',
                code: () => bla2,
            }
            const astSequence = instantiateAndDedupeDependencies(
                [
                    bloDefinitions,
                    blaDefinitions1,
                    {
                        namespace: 'module1',
                        code: () => bli,
                        dependencies: [bloDefinitions],
                    },
                    blaDefinitions2,
                ],
                precompilation.variableNamesAssigner,
                precompilation.variableNamesAssigner.globals,
                precompilation.settings
            )
            assert.deepStrictEqual(astSequence, Sequence([blo, bla1, bli]))
        })
    })

    describe('flattenDependencies', () => {
        it('should render code and dependencies recursively, dependencies should come first', () => {
            const globalDefinitions1: GlobalDefinitions = {
                namespace: '_',
                code: () => ast`"bla"`,
            }
            const globalDefinitions2: GlobalDefinitions = {
                namespace: '_',
                code: () => ast`"bli"`,
            }
            const globalDefinitions3: GlobalDefinitions = {
                namespace: '_',
                code: () => ast`"blo"`,
            }
            const globalDefinitions4: GlobalDefinitions = {
                namespace: '_',
                code: () => ast`"bly"`,
            }
            const globalDefinitions5: GlobalDefinitions = {
                namespace: '_',
                code: () => ast`"ble"`,
                dependencies: [globalDefinitions2],
            }

            const globalDefinitions6: GlobalDefinitions = {
                namespace: '_',
                code: () => ast`"blb"`,
                dependencies: [globalDefinitions1, globalDefinitions5],
            }
            const globalDefinitions7: GlobalDefinitions = {
                namespace: '_',
                code: () => ast`"blc"`,
                dependencies: [
                    globalDefinitions4,
                    globalDefinitions3,
                    globalDefinitions1,
                ],
            }
            const dependencies: Array<GlobalDefinitions> = [
                globalDefinitions6,
                globalDefinitions7,
            ]
            const generated = flattenDependencies(dependencies)

            assert.strictEqual(generated.length, 8)
            assert.deepStrictEqual(generated[0], globalDefinitions1)
            assert.deepStrictEqual(generated[1], globalDefinitions2)
            assert.deepStrictEqual(generated[2], globalDefinitions5)
            assert.deepStrictEqual(generated[3], globalDefinitions6)
            assert.deepStrictEqual(generated[4], globalDefinitions4)
            assert.deepStrictEqual(generated[5], globalDefinitions3)
            assert.deepStrictEqual(generated[6], globalDefinitions1)
            assert.deepStrictEqual(generated[7], globalDefinitions7)
        })
    })

    describe('collectAndDedupeExports', () => {
        it('should collect exports and remove duplicates', () => {
            const precompilation = makePrecompilation({})
            const globalDefinitions1: GlobalDefinitions = {
                namespace: 'module1',
                code: () => Sequence([]),
                exports: () => ['ex1', 'ex3'],
            }
            const globalDefinitions2: GlobalDefinitions = {
                namespace: 'module2',
                code: () => Sequence([]),
                // no exports here shouldnt break
                dependencies: [],
            }
            const globalDefinitions3: GlobalDefinitions = {
                namespace: 'module3',
                code: () => Sequence([]),
                exports: () => ['ex4', 'ex3'],
            }
            const dependencies: Array<GlobalDefinitions> = [
                globalDefinitions1,
                { namespace: '_', code: () => Sequence([]) },
                globalDefinitions2,
                globalDefinitions3,
                { namespace: '_', code: () => Sequence([]) },
            ]

            assert.deepStrictEqual(
                collectAndDedupeExports(
                    dependencies,
                    precompilation.variableNamesAssigner,
                    precompilation.variableNamesAssigner.globals,
                    precompilation.settings
                ),
                ['ex1', 'ex3', 'ex4']
            )
        })
    })

    describe('collectAndDedupeImports', () => {
        it('should collect imports and remove duplicates', () => {
            const precompilation = makePrecompilation({})
            const globalDefinitions1: GlobalDefinitions = {
                namespace: 'module1',
                code: () => Sequence([]),
                imports: () => [Func('ex1')``, Func('ex3')``],
            }
            const globalDefinitions2: GlobalDefinitions = {
                namespace: 'module2',
                code: () => Sequence([]),
                // no imports here shouldnt break
            }
            const globalDefinitions3: GlobalDefinitions = {
                namespace: 'module3',
                code: () => Sequence([]),
                imports: () => [Func('ex4')``],
            }
            const dependencies: Array<GlobalDefinitions> = [
                { namespace: '_', code: () => Sequence([]) },
                globalDefinitions1,
                globalDefinitions2,
                { namespace: '_', code: () => Sequence([]) },
                globalDefinitions3,
            ]

            assert.deepStrictEqual(
                collectAndDedupeImports(
                    dependencies,
                    precompilation.variableNamesAssigner,
                    precompilation.variableNamesAssigner.globals,
                    precompilation.settings
                ),
                [Func('ex1')``, Func('ex3')``, Func('ex4')``]
            )
        })
    })
})
