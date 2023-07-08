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
    INT_ARRAY_BYTES_PER_ELEMENT,
    liftMessage,
    lowerMessage,
} from './msg-bindings'
import { AudioSettings, SharedCodeGenerator } from '../types'
import { TEST_PARAMETERS, ascCodeToRawModule } from './test-helpers'
import { getFloatArrayType } from '../compile-helpers'
import { getMacros } from '../compile'
import { commons, core, msg, sked } from '../core-code'

describe('msg-bindings', () => {
    const BYTES_IN_CHAR = 4

    const float64ToInt32Array = (value: number) => {
        const dataView = new DataView(
            new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT)
        )
        dataView.setFloat64(0, value)
        return [dataView.getInt32(0), dataView.getInt32(4)]
    }

    const float32ToInt32Array = (value: number) => {
        const dataView = new DataView(
            new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT)
        )
        dataView.setFloat32(0, value)
        return [dataView.getInt32(0)]
    }

    const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) => {
        const context: Parameters<SharedCodeGenerator>[0] = {
            target: 'assemblyscript',
            macros: getMacros('assemblyscript'),
            audioSettings: {
                bitDepth, channelCount: { in: 2, out: 2 }
            }
        }
        return (
            core(context) +
            sked(context) +
            commons(context) +
            msg(context) +
            `
            export function testReadMessageData(message: Message, index: Int): Int {
                return message.dataView.getInt32(index * sizeof<Int>())
            }

            export {
                // MSG EXPORTS
                x_msg_create as msg_create,
                x_msg_getTokenTypes as msg_getTokenTypes,
                x_msg_createTemplate as msg_createTemplate,
                msg_writeStringToken,
                msg_writeFloatToken,
                msg_readStringToken,
                msg_readFloatToken,
                MSG_FLOAT_TOKEN,
                MSG_STRING_TOKEN,

                // CORE EXPORTS
                createFloatArray,
                x_core_createListOfArrays as core_createListOfArrays,
                x_core_pushToListOfArrays as core_pushToListOfArrays,
                x_core_getListOfArraysLength as core_getListOfArraysLength,
                x_core_getListOfArraysElem as core_getListOfArraysElem,
            }
        `
        )
    }

    describe('lowerMessage', () => {
        it.each(TEST_PARAMETERS)(
            'should create the message with correct header and filled-in data %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)
                const floatArrayType = getFloatArrayType(bitDepth)
                const wasmExports = await ascCodeToRawModule(code, bitDepth)
                const messagePointer = lowerMessage(wasmExports, ['bla', 2.3])

                // Testing token count
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 0),
                    2
                )

                // Testing token types
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 1),
                    1
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 2),
                    0
                )

                // Testing token positions
                // <Header byte size>
                //      + <Size of f32>
                //      + <Size of 3 chars strings> + <Size of f32>
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 3),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 4),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT + 3 * BYTES_IN_CHAR
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 5),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT +
                        3 * BYTES_IN_CHAR +
                        floatArrayType.BYTES_PER_ELEMENT
                )

                // TOKEN "bla"
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 6),
                    'bla'.charCodeAt(0)
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 7),
                    'bla'.charCodeAt(1)
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 8),
                    'bla'.charCodeAt(2)
                )

                // TOKEN "2.3"
                if (bitDepth === 64) {
                    assert.strictEqual(
                        wasmExports.testReadMessageData(messagePointer, 9),
                        float64ToInt32Array(2.3)[0]
                    )
                    assert.strictEqual(
                        wasmExports.testReadMessageData(messagePointer, 10),
                        float64ToInt32Array(2.3)[1]
                    )
                } else {
                    assert.strictEqual(
                        wasmExports.testReadMessageData(messagePointer, 9),
                        float32ToInt32Array(2.3)[0]
                    )
                }
            }
        )
    })

    describe('liftMessage', () => {
        it.each(TEST_PARAMETERS)(
            'should read message to a JavaScript array %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode(bitDepth) + `
                    export function testCreateMessage(): Message {
                        const message: Message = msg_create([
                            MSG_STRING_TOKEN, 5,
                            MSG_FLOAT_TOKEN,
                        ])
                        msg_writeStringToken(message, 0, "hello")
                        msg_writeFloatToken(message, 1, 666)
                        return message
                    }
                `

                const wasmExports = await ascCodeToRawModule(code, bitDepth)

                const messagePointer = wasmExports.testCreateMessage()
                assert.deepStrictEqual(
                    liftMessage(wasmExports, messagePointer),
                    ['hello', 666]
                )
            }
        )
    })
})
