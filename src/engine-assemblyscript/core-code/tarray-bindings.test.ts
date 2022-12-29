import assert from 'assert'
import {
    lowerTypedArray,
    lowerListOfTypedArrays,
    readListOfTypedArrays,
} from './tarray-bindings'
import {
    getAscCode,
    iterTestAudioSettings,
    replacePlaceholdersForTesting,
} from './test-helpers'

describe('tarray-bindings', () => {
    describe('lowerTypedArray', () => {
        it('should lower typed array to wasm module', async () => {
            await iterTestAudioSettings(
                // prettier-ignore
                (audioSettings) => getAscCode('tarray.asc', audioSettings) + `
                    export function testReadArrayElem (array: FloatArray, index: i32): f64 {
                        return array[index]
                    }
                    export function testReadArrayLength (array: FloatArray): i32 {
                        return array.length
                    }
                `,
                async (wasmExports, { bitDepth }) => {
                    const { arrayPointer, array } = lowerTypedArray(
                        wasmExports,
                        bitDepth,
                        new Float64Array([111, 222, 333])
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayLength(arrayPointer),
                        3
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arrayPointer, 0),
                        111
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arrayPointer, 1),
                        222
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arrayPointer, 2),
                        333
                    )

                    // Test that shares the same memory space
                    array[1] = 666
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arrayPointer, 1),
                        666
                    )
                }
            )
        })
    })

    describe('lowerListOfTypedArrays', () => {
        it('should lower a list of typed arrays', async () => {
            await iterTestAudioSettings(
                // prettier-ignore
                (audioSettings) => getAscCode('tarray.asc', audioSettings) + `
                    export function testReadArraysLength (arrays: FloatArray[], index: i32): f64 {
                        return arrays.length
                    }
                    export function testReadArrayElem (arrays: FloatArray[], arrIndex: i32, index: i32): f64 {
                        return arrays[arrIndex][index]
                    }
                    export function testReadArrayLength (arrays: FloatArray[], arrIndex: i32): i32 {
                        return arrays[arrIndex].length
                    }
                `,
                async (wasmExports, { bitDepth }) => {
                    const arraysPointer = lowerListOfTypedArrays(
                        wasmExports,
                        bitDepth,
                        [
                            new Float64Array([111, 222, 333]),
                            new Float32Array([444, 555, 666]),
                            [777, 888],
                            [999],
                        ]
                    )
                    assert.strictEqual(
                        wasmExports.testReadArraysLength(arraysPointer),
                        4
                    )

                    assert.strictEqual(
                        wasmExports.testReadArrayLength(arraysPointer, 0),
                        3
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayLength(arraysPointer, 1),
                        3
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayLength(arraysPointer, 2),
                        2
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayLength(arraysPointer, 3),
                        1
                    )

                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arraysPointer, 0, 0),
                        111
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arraysPointer, 0, 1),
                        222
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arraysPointer, 0, 2),
                        333
                    )

                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arraysPointer, 2, 0),
                        777
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arraysPointer, 2, 1),
                        888
                    )
                }
            )
        })
    })

    describe('readListOfTypedArrays', () => {
        it('should lower a list of typed arrays', async () => {
            await iterTestAudioSettings(
                // prettier-ignore
                (audioSettings) => getAscCode('tarray.asc', audioSettings) + replacePlaceholdersForTesting(`
                    const arrays: FloatArray[] = [
                        new \${FloatArrayType}(3),
                        new \${FloatArrayType}(3)
                    ]
                    arrays[0][0] = 11
                    arrays[0][1] = 22
                    arrays[0][2] = 33
                    arrays[1][0] = 44
                    arrays[1][1] = 55
                    arrays[1][2] = 66
                    export function testGetListOfArrays(): FloatArray[] {
                        return arrays
                    }
                `, audioSettings),
                async (wasmExports, { bitDepth, floatArrayType }) => {
                    const arraysPointer = wasmExports.testGetListOfArrays()
                    const arrays = readListOfTypedArrays(
                        wasmExports,
                        bitDepth,
                        arraysPointer
                    )
                    assert.deepStrictEqual(arrays, [
                        new floatArrayType([11, 22, 33]),
                        new floatArrayType([44, 55, 66]),
                    ])
                }
            )
        })

        it('should share the same memory space', async () => {
            await iterTestAudioSettings(
                // prettier-ignore
                (audioSettings) => getAscCode('tarray.asc', audioSettings) + replacePlaceholdersForTesting(`
                    const arrays: FloatArray[] = [
                        new \${FloatArrayType}(3),
                        new \${FloatArrayType}(3)
                    ]
                    arrays[0][0] = 11
                    arrays[0][1] = 22
                    arrays[0][2] = 33
                    arrays[1][0] = 44
                    arrays[1][1] = 55
                    arrays[1][2] = 66

                    export function testGetListOfArrays(): FloatArray[] {
                        return arrays
                    }
                    export function testReadSomeValue(): \${FloatType} {
                        return arrays[1][1]
                    }
                `, audioSettings),
                async (wasmExports, { bitDepth }) => {
                    const arraysPointer = wasmExports.testGetListOfArrays()
                    const arrays = readListOfTypedArrays(
                        wasmExports,
                        bitDepth,
                        arraysPointer
                    )
                    arrays[1][1] = 88
                    assert.deepStrictEqual(wasmExports.testReadSomeValue(), 88)
                }
            )
        })
    })
})
