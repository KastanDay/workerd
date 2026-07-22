// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Streaming tail worker that validates jsRpcCall span nesting for callback arguments.
//
// Within the CallbackService (jsrpc) invocation we expect:
//   onset
//     jsRpcCall (jsrpc.method = "invokeCallback", target_kind = "entrypoint")  <- server dispatch
//       jsRpcCall (target_kind = "stub")                                       <- server invokes cb
//
// The inner (callback) jsRpcCall must be a child of the method's jsRpcCall span, proving the
// argument stub recorded the correct originating call.

import * as assert from 'node:assert';
import unsafe from 'workerd:unsafe';

// Per-invocation span data: invocationId -> { onset, rootSpanId, spans: Map(spanId -> span) }.
// Each span records its name, its parent span ID (from the spanOpen's spanContext), and any
// attributes merged from subsequent attributes events targeting that span.
let invocations = new Map();

export default {
  tailStream(onsetEvent, env, ctx) {
    const invocationId = onsetEvent.invocationId;
    const rootSpanId = onsetEvent.event.spanId;
    const data = {
      onset: {
        info: onsetEvent.event.info?.type,
        entrypoint: onsetEvent.event.entrypoint,
      },
      rootSpanId,
      spans: new Map(),
      complete: false,
    };
    invocations.set(invocationId, data);

    return (event) => {
      const type = event.event.type;
      if (type === 'spanOpen') {
        data.spans.set(event.event.spanId, {
          name: event.event.name,
          parentId: event.spanContext.spanId,
          attrs: {},
        });
      } else if (type === 'attributes') {
        const span = data.spans.get(event.spanContext.spanId);
        if (span) {
          for (const { name, value } of event.event.info) {
            span.attrs[name] = value;
          }
        }
      } else if (type === 'outcome') {
        data.complete = true;
      }
    };
  },
};

// Find the server dispatch and all three callback spans, or return incomplete results.
// Tail events are delivered asynchronously, so callers poll.
function findCallbackSpans() {
  let target = null;
  for (const data of invocations.values()) {
    if (
      data.onset.info === 'jsrpc' &&
      data.onset.entrypoint === 'CallbackService'
    ) {
      target = data;
      break;
    }
  }
  if (!target) return { target: null, methodSpan: null, callbackSpans: [] };

  const jsRpcCalls = [...target.spans.entries()]
    .filter(([, s]) => s.name === 'jsRpcCall')
    .map(([spanId, s]) => ({ spanId, ...s }));

  // Separate the invokeCallbacks server dispatch from calls through transient argument stubs.
  // The latter cover a function, an RpcTarget, and a Proxy-of-RpcTarget.
  const methodSpan = jsRpcCalls.find(
    (s) => s.attrs['jsrpc.method'] === 'invokeCallbacks'
  );
  const callbackSpans = jsRpcCalls.filter(
    (s) => s.attrs['jsrpc.target_kind'] === 'stub'
  );
  return { target, methodSpan, callbackSpans };
}

export const test = {
  async test() {
    const tracingEnabled = unsafe.isTestAutogateEnabled();
    // Poll until the expected spans arrive or, with tracing disabled, the invocation completes.
    // Tail events are asynchronous, so avoid relying on a fixed delay.
    const deadline = Date.now() + 5000;
    let found = findCallbackSpans();
    while (
      !(tracingEnabled
        ? found.methodSpan && found.callbackSpans.length === 3
        : found.target?.complete) &&
      Date.now() < deadline
    ) {
      await scheduler.wait(10);
      found = findCallbackSpans();
    }

    const { target, methodSpan, callbackSpans } = found;
    assert.ok(
      target,
      'Could not find the CallbackService JSRPC invocation in tail events'
    );
    if (!tracingEnabled) {
      assert.ok(target.complete, 'CallbackService invocation did not complete');
      assert.strictEqual(
        [...target.spans.values()].filter((span) => span.name === 'jsRpcCall')
          .length,
        0,
        'jsRpcCall spans must not be emitted while the autogate is disabled'
      );
      return;
    }
    assert.ok(methodSpan, 'Missing jsRpcCall span for invokeCallbacks');
    assert.strictEqual(
      callbackSpans.length,
      3,
      'Expected function, RpcTarget, and Proxy-of-RpcTarget callback spans'
    );
    assert.deepStrictEqual(
      new Set(callbackSpans.map((span) => span.attrs['jsrpc.method'])),
      new Set(['(this)', 'invokeTarget', 'invokeProxy']),
      'Expected one span for each transient argument call'
    );

    // Every transient callback call must nest directly under the server method dispatch.
    // The async continuation must not lose or replace that parent.
    for (const callbackSpan of callbackSpans) {
      assert.strictEqual(
        callbackSpan.parentId,
        methodSpan.spanId,
        `Callback ${callbackSpan.attrs['jsrpc.method']} should nest under invokeCallbacks`
      );
      assert.notStrictEqual(
        callbackSpan.parentId,
        target.rootSpanId,
        `Callback ${callbackSpan.attrs['jsrpc.method']} must not nest under the onset`
      );
    }
  },
};
