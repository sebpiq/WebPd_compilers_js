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

import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import { makeCompilation } from '../test-helpers'
import { InletListenerSpecs, NodeImplementations, Message } from '../types'
import compileToJavascript from './compile-to-javascript'
import macros from './macros'
import { JavaScriptEngine } from './types'

describe('compileToJavascript', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        'osc~': {
            initialize: () => `// [osc~] setup`,
            loop: () => `// [osc~] loop`,
        },
        'dac~': {
            initialize: () => `// [dac~] setup`,
            loop: () => `// [dac~] loop`,
        },
        DUMMY: {
            loop: () => '',
        },
    }

    it('should create the specified accessors', () => {
        const compilation = makeCompilation({
            target: 'javascript',
            nodeImplementations: NODE_IMPLEMENTATIONS,
            accessorSpecs: {
                bla: { access: 'r', type: 'signal' },
                blo: { access: 'w', type: 'message' },
                bli: { access: 'rw', type: 'signal' },
                blu: { access: 'rw', type: 'message' },
            },
            macros,
        })

        const code = compileToJavascript(compilation)
        const engine: JavaScriptEngine = new Function(`
            let bla = 1
            let blo = [['bang']]
            let bli = 2
            let blu = [[123.123, 'bang']]
            ${code}
        `)()

        assert.deepStrictEqual(Object.keys(engine.accessors), [
            'read_bla',
            'write_blo',
            'read_bli',
            'write_bli',
            'read_blu',
            'write_blu',
        ])

        assert.strictEqual(engine.accessors.read_bla(), 1)

        assert.strictEqual(engine.accessors.read_bli(), 2)
        engine.accessors.write_bli(666.666)
        assert.strictEqual(engine.accessors.read_bli(), 666.666)

        const blu = engine.accessors.read_blu()
        assert.deepStrictEqual(blu, [[123.123, 'bang']])
        blu.push(['I am blu'])
        assert.deepStrictEqual(engine.accessors.read_blu(), [
            [123.123, 'bang'],
            ['I am blu'],
        ])
        engine.accessors.write_blu([['blurg']])
        assert.deepStrictEqual(engine.accessors.read_blu(), [['blurg']])
    })

    it('should be a JavaScript engine when evaled', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                args: {
                    frequency: 440,
                },
                inlets: {
                    '0_message': { id: '0_message', type: 'message' },
                },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
        })
        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            nodeImplementations: NODE_IMPLEMENTATIONS,
            macros,
        })
        const code = compileToJavascript(compilation)
        const modelEngine: JavaScriptEngine = {
            configure: (_: number) => {},
            loop: () => new Float32Array(),
            setArray: () => undefined,
            accessors: {},
        }
        const engine = new Function(code)()

        assert.deepStrictEqual(Object.keys(engine), Object.keys(modelEngine))
    })

    it('should create inlet listeners and trigger them whenever inlets receive new messages', async () => {
        const called: Array<Array<Message>> = []
        const inletVariableName = 'someNode_INS_someInlet'
        const nodeImplementations: NodeImplementations = {
            messageGeneratorType: {
                loop: (_, { outs, globs }) => `
                    if (${globs.frame} % 4 === 0) {
                        ${outs.someOutlet}.push([${globs.frame}])
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
                outlets: { someOutlet: { type: 'message', id: 'someOutlet' } },
                sinks: { someOutlet: [['someNode', 'someInlet']] },
            },
            someNode: {
                type: 'someNodeType',
                isEndSink: true,
                inlets: { someInlet: { type: 'message', id: 'someInlet' } },
            },
        })

        const inletListenerSpecs: InletListenerSpecs = {
            ['someNode']: ['someInlet'],
        }

        const code = compileToJavascript(
            makeCompilation({
                target: 'javascript',
                graph,
                nodeImplementations,
                macros,
                inletListenerSpecs: inletListenerSpecs,
                accessorSpecs: {
                    [inletVariableName]: {
                        access: 'r',
                        type: 'message',
                    },
                },
            })
        )

        const engine = new Function('inletListener_someNode_someInlet', code)(
            () => {
                const messages =
                    engine.accessors['read_someNode_INS_someInlet']()
                called.push(messages)
            }
        )

        const blockSize = 13
        engine.configure(44100, blockSize)
        engine.loop()
        assert.deepStrictEqual(called, [[[0]], [[4]], [[8]], [[12]]])
    })
})
