// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Regression test for JSRPC tracing: when an RPC method receives a callback/stub as an argument
// and invokes it, the follow-up jsRpcCall (the server calling back into the client) must nest
// under the server-side jsRpcCall span of the method that received the callback -- not become a
// sibling of it under the onset. The parent/child relationship is asserted in the tail worker's
// test() handler (see jsrpc-callback-trace-test-tail.js).

import { WorkerEntrypoint, RpcTarget } from 'cloudflare:workers';

class TargetCallback extends RpcTarget {
  invokeTarget() {
    return 43;
  }

  invokeProxy() {
    return 44;
  }
}

export class CallbackService extends WorkerEntrypoint {
  // Cross an async boundary before invoking each transient argument shape.
  // Their calls must remain children of this server dispatch span.
  async invokeCallbacks(fn, target, proxy) {
    await scheduler.wait(1);
    return [await fn(), await target.invokeTarget(), await proxy.invokeProxy()];
  }
}

export default {
  async test(controller, env, ctx) {
    const target = new TargetCallback();
    const proxyTarget = new TargetCallback();
    const result = await env.CallbackService.invokeCallbacks(
      () => 42,
      target,
      new Proxy(proxyTarget, {})
    );
    if (
      result.length !== 3 ||
      result[0] !== 42 ||
      result[1] !== 43 ||
      result[2] !== 44
    ) {
      throw new Error(
        `Expected callback results [42,43,44], got ${JSON.stringify(result)}`
      );
    }
  },
};
