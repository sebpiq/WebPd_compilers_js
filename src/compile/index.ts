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

import {
    Compilation,
    CompilationSettings,
    CompilerTarget,
    NodeImplementations,
} from './types'
import compileToJavascript from '../engine-javascript/compile'
import compileToAssemblyscript from '../engine-assemblyscript/compile'
import { JavaScriptEngineCode } from '../engine-javascript/compile/types'
import { AssemblyScriptWasmEngineCode } from '../engine-assemblyscript/compile/types'
import { generateVariableNamesIndex } from './variable-names-index'
import { buildGraphTraversalAll } from './compile-helpers'
import { DspGraph } from '../dsp-graph/types'
import { traversal } from '../dsp-graph'
import precompile, { initializePrecompilation } from './precompile'

interface CompilationSuccess {
    status: 0
    code: JavaScriptEngineCode | AssemblyScriptWasmEngineCode
}

interface CompilationFailure {
    status: 1
}

type CompilationResult = CompilationSuccess | CompilationFailure

export default (
    graph: DspGraph.Graph,
    nodeImplementations: NodeImplementations,
    target: CompilerTarget,
    compilationSettings: CompilationSettings
): CompilationResult => {
    const settings = validateSettings(compilationSettings)
    const variableNamesIndex = generateVariableNamesIndex(graph, settings.debug)
    const graphTraversalAll = buildGraphTraversalAll(
        graph,
        settings.inletCallerSpecs
    )
    const trimmedGraph = traversal.trimGraph(graph, graphTraversalAll)
    const precompilation = initializePrecompilation(
        trimmedGraph,
        graphTraversalAll,
        variableNamesIndex
    )

    return {
        status: 0,
        code: executeCompilation({
            graph: trimmedGraph,
            nodeImplementations,
            target,
            settings,
            variableNamesIndex,
            precompilation,
        }),
    }
}

/** Asserts user provided settings are valid (or throws error) and sets default values. */
export const validateSettings = (
    compilationSettings: CompilationSettings
): Compilation['settings'] => {
    const arrays = compilationSettings.arrays || {}
    const inletCallerSpecs = compilationSettings.inletCallerSpecs || {}
    const outletListenerSpecs = compilationSettings.outletListenerSpecs || {}
    const debug = compilationSettings.debug || false
    const audio = compilationSettings.audio || {
        channelCount: { in: 2, out: 2 },
        bitDepth: 64,
    }
    if (![32, 64].includes(audio.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }
    return {
        audio,
        arrays,
        outletListenerSpecs,
        inletCallerSpecs,
        debug,
    }
}

/** Helper to execute compilation */
export const executeCompilation = (compilation: Compilation) => {
    precompile(compilation)
    if (compilation.target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (compilation.target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    } else {
        throw new Error(`Invalid compilation.target ${compilation.target}`)
    }
}

class InvalidSettingsError extends Error {}
