import assert from 'assert'
import { AudioSettings } from '../../types'
import {
    generateTestBindings,
    getAscCode,
    TEST_PARAMETERS,
} from './test-helpers'

describe('buf-bindings', () => {
    const SKED_ID_NULL = -1

    describe('wait / trigger', () => {
        const EXPORTED_FUNCTIONS = {
            sked_create: 0,
            sked_cancel: 0,
            testSkedWait: 0,
            testSkedResolveWait: true,
            testCallbackResults: new Float32Array(0),
        }

        const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
            getAscCode('core.asc', bitDepth) +
            getAscCode('sked.asc', bitDepth) +
            `
                const DUMMY_EVENT_DATA: Map<string, Float> = new Map()
                const cbCalls: FloatArray = createFloatArray(20)
                let cbCallsCounter: Int = 0

                function callback (event: string): void {
                    cbCalls[cbCallsCounter] = DUMMY_EVENT_DATA.get(event)
                    cbCallsCounter++
                }

                function testSkedWait (
                    skeduler: Skeduler, 
                    event: string
                ): SkedId {
                    return sked_wait(skeduler, event, callback)
                }

                function testSkedResolveWait (
                    skeduler: Skeduler,
                    event: string, 
                    datum: Float
                ): boolean {
                    DUMMY_EVENT_DATA.set(event, datum)
                    sked_emit(skeduler, event)
                    return (skeduler.requests.has(event) === false || skeduler.requests.get(event).length === 0)
                        && skeduler.eventLog.has(event)
                }

                function testCallbackResults (): FloatArray {
                    return cbCalls.subarray(0, cbCallsCounter)
                }

                export {
                    sked_create,
                    sked_cancel,

                    // TEST FUNCTIONS
                    testSkedWait,
                    testSkedResolveWait,
                    testCallbackResults,
                }
            `

        it.each(TEST_PARAMETERS)(
            'should not have to wait if event already resolved %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                // Resolve the event before scheduling anything
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 1234)
                )

                // Schedule a wait which should be resolved imediately
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    SKED_ID_NULL
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should call waits callbacks when resolving %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                // Schedule a few waits
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    1
                )
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    2
                )
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_other_event'),
                    3
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )

                // Resolve the waits
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 5678)
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([5678, 5678])
                )

                assert.ok(
                    bindings.testSkedResolveWait(
                        skeduler,
                        'some_other_event',
                        1234
                    )
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([5678, 5678, 1234])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should not call callbacks again when resolving several times %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                // Schedule and resolve a few events
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    1
                )
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 666)
                )
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    SKED_ID_NULL
                )

                // Check the calls recorded and resolve again
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([666, 666])
                )
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 1234)
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([666, 666])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should cancel wait %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                const requestId = bindings.testSkedWait(skeduler, 'some_event')
                bindings.sked_cancel(skeduler, requestId)
                bindings.testSkedResolveWait(skeduler, 'some_event', 666)

                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )
            }
        )
    })

    describe('subscribe / trigger', () => {
        const EXPORTED_FUNCTIONS = {
            sked_create: 0,
            sked_cancel: 0,
            testSkedListen: 0,
            testSkedTriggerListeners: true,
            testCallbackResults: new Float32Array(0),
        }

        const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
            getAscCode('core.asc', bitDepth) +
            getAscCode('sked.asc', bitDepth) +
            `
                const DUMMY_EVENT_DATA: Map<string, Float> = new Map()
                const cbCalls: FloatArray = createFloatArray(20)
                let cbCallsCounter: Int = 0

                function callback (event: string): void {
                    cbCalls[cbCallsCounter] = DUMMY_EVENT_DATA.get(event)
                    cbCallsCounter++
                }

                function testSkedListen (
                    skeduler: Skeduler,
                    event: string,
                ): SkedId {
                    return sked_subscribe(skeduler, event, callback)
                }

                function testSkedTriggerListeners (
                    skeduler: Skeduler, 
                    event: string, 
                    datum: Float
                ): void {
                    DUMMY_EVENT_DATA.set(event, datum)
                    sked_emit(skeduler, event)
                }

                function testCallbackResults (): FloatArray {
                    return cbCalls.subarray(0, cbCallsCounter)
                }

                export {
                    sked_create,
                    sked_cancel,

                    // TEST FUNCTIONS
                    testSkedListen,
                    testSkedTriggerListeners,
                    testCallbackResults,
                }
            `

        it.each(TEST_PARAMETERS)(
            'should trigger existing listeners %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)

                // Trigger an event with no listeners
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 666)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )

                // Register a listener and emit event
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    1
                )
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 1234)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234])
                )

                // Register more listeners and emit event
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    2
                )
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    3
                )
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    4
                )
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 5678)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234, 5678, 5678, 5678, 5678])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should cancel listeners %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)

                // Register a couple of listeners and trigger
                const requestId: number = bindings.testSkedListen(
                    skeduler,
                    'some_event'
                )
                bindings.testSkedListen(skeduler, 'some_event')
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 1234)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234, 1234])
                )

                // Cancel a listener and trigger again
                bindings.sked_cancel(skeduler, requestId)
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 5678)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234, 1234, 5678])
                )
            }
        )
    })
})