# JavaScript and Node.js Asynchronous Scheduling

This guide explains asynchronous JavaScript specifically in Node.js. It builds the model from synchronous execution through callbacks, Node APIs, event-loop phases, Promise microtasks, and `process.nextTick()`.

## 1. JavaScript executes one operation at a time

Ordinary JavaScript statements execute synchronously, in source order:

```js
console.log("A");
console.log("B");
console.log("C");
```

The output is:

```text
A
B
C
```

The JavaScript engine in Node.js is V8. V8 uses a **call stack** to keep track of currently executing functions.

```js
function greet() {
  console.log("B");
}

console.log("A");
greet();
console.log("C");
```

When `greet()` is called, it is placed on the call stack. It runs to completion and returns before the final `console.log()` executes.

An executing JavaScript function is not interrupted so that an unrelated timer, I/O handler, or Promise handler can run. The current JavaScript operation runs until its call stack unwinds.

## 2. A callback is a function supplied to other code

A **callback** is a function given to other code so that the other code can invoke it:

```js
function run(callback) {
  callback();
}

run(() => {
  console.log("callback executed");
});
```

The word "callback" says nothing about scheduling. A callback may execute synchronously or asynchronously.

This callback executes synchronously:

```js
console.log("A");

[1, 2].forEach((number) => {
  console.log(number);
});

console.log("B");
```

The output is:

```text
A
1
2
B
```

This timer callback executes asynchronously:

```js
console.log("A");

setTimeout(() => {
  console.log("timer callback");
}, 0);

console.log("B");
```

The output is:

```text
A
B
timer callback
```

The scheduling mechanism, not the fact that a function is a callback, determines when it runs.

## 3. Node.js is the host environment

JavaScript itself defines language features such as functions, objects, and Promises. It does not by itself provide file access, TCP sockets, or the Node event loop.

**Node.js** is the host environment around V8. It provides:

- File-system and networking APIs
- Timers
- An event loop implemented with libuv
- Integration with operating-system I/O
- A worker pool for operations that cannot be performed as non-blocking OS I/O

The responsibilities are separated like this:

```text
V8 / JavaScript                 Node.js, libuv, OS, worker pool
────────────────────────────────────────────────────────────────
Executes JavaScript             Provides asynchronous facilities
Calls a Node API        ──────► Starts or monitors an operation
Continues executing             Waits without blocking JavaScript
Executes a callback     ◄────── Makes the callback eligible later
```

Ordinary JavaScript callbacks still execute one at a time on the main JavaScript thread. Node, the operating system, and the worker pool can handle other activity while that thread is free.

## 4. Starting, completing, and handling an operation are separate

Consider callback-based file reading:

```js
import { readFile } from "node:fs";

console.log("before");

readFile("notes.txt", "utf8", (error, text) => {
  if (error) {
    console.error(error);
    return;
  }

  console.log(text);
});

console.log("after");
```

Three different moments occur:

1. **Registration:** JavaScript passes a callback to `readFile()`.
2. **Completion:** The file operation finishes and Node learns its result.
3. **Callback execution:** Node later invokes the callback on the JavaScript thread.

The sequence is:

```text
JavaScript calls readFile()
        ↓
Node starts or delegates the operation
        ↓
readFile() returns; JavaScript prints "after"
        ↓
the file operation completes
        ↓
Node makes the callback eligible
        ↓
the event loop eventually executes the callback
```

Completion does not mean that the callback has already executed. The JavaScript thread might still be busy, or other eligible work might run first.

## 5. Events are occurrences; listeners are callbacks

An **event** is an occurrence such as data arriving, a connection opening, or a resource closing. A **listener** is a callback registered to respond to an event.

```js
socket.on("data", (chunk) => {
  console.log("received", chunk);
});
```

Here, `"data"` names the event and the arrow function is its listener. Data can arrive more than once, so the listener can execute more than once.

An event listener is not automatically asynchronous. Node's ordinary `EventEmitter.emit()` calls listeners synchronously:

```js
import { EventEmitter } from "node:events";

const emitter = new EventEmitter();

emitter.on("message", () => {
  console.log("listener");
});

console.log("A");
emitter.emit("message");
console.log("B");
```

The output is:

```text
A
listener
B
```

The source that calls `emit()` determines when the listeners run. For example, a socket may call `emit("data")` while Node is handling an asynchronous I/O result.

## 6. The event loop coordinates eligible callbacks

The **event loop** is Node's repeating coordination mechanism. It checks asynchronous activity, processes categories of eligible callbacks, and lets their JavaScript execute one at a time.

Node begins by executing the input script. That script can register callbacks, start I/O, and schedule timers. After the initial script finishes, Node continues processing asynchronous work while something keeps the process alive.

One journey through the full event-loop phase cycle is commonly called an **iteration** or **turn**. An iteration is not one phase: it gives the event loop an opportunity to visit all of its phases in order. A phase can be empty and pass without executing a callback. The informal word **tick** is also used for an iteration, but it should not be confused with the specific `process.nextTick()` API.

The event loop does not make slow JavaScript non-blocking. A long callback occupies the JavaScript thread and delays other callbacks:

```js
setTimeout(() => {
  const end = Date.now() + 5_000;

  while (Date.now() < end) {
    // Blocks the JavaScript thread for about five seconds.
  }
}, 0);
```

While that loop runs, Node cannot execute other JavaScript callbacks on the same thread.

## 7. Event-loop phases have an order

An event-loop **phase** is a stage responsible for a category of callbacks. The most useful phases for application code are:

| Phase | Main responsibility |
| --- | --- |
| `timers` | Eligible `setTimeout()` and `setInterval()` callbacks |
| `pending callbacks` | Certain system callbacks deferred from an earlier iteration |
| `idle, prepare` | Internal Node/libuv work |
| `poll` | Retrieve I/O events, execute many I/O callbacks, and wait when appropriate |
| `check` | `setImmediate()` callbacks |
| `close callbacks` | Certain close callbacks, such as some socket close handlers |

The event loop traverses these phases in a defined cycle. A conceptual modern-Node view is:

```text
                         EVENT-LOOP ITERATION N

 ┌─────────────────────┐
 │ pending callbacks   │  certain callbacks deferred from earlier work
 └──────────┬──────────┘
            ↓
 ┌─────────────────────┐
 │ idle / prepare      │  internal Node/libuv work
 └──────────┬──────────┘
            ↓
 ┌─────────────────────┐       incoming connections, data,
 │ poll                │◄────  and completed I/O become ready here
 └──────────┬──────────┘
            ↓
 ┌─────────────────────┐
 │ check               │  setImmediate() callbacks
 └──────────┬──────────┘
            ↓
 ┌─────────────────────┐
 │ close callbacks     │  certain close handlers
 └──────────┬──────────┘
            ↓
 ┌─────────────────────┐
 │ timers              │  eligible setTimeout()/setInterval() callbacks
 └──────────┬──────────┘
            │
            └──────────────► EVENT-LOOP ITERATION N + 1
```

Timers require a qualification. Starting with libuv 1.45.0, used by Node 20 and later, timers are run after the poll phase during an event-loop iteration. Node may also process a timer before entering the loop during startup. For everyday reasoning, remember that timers are checked in connection with poll and run when their thresholds have elapsed; do not assume that a timer must be the first callback of every iteration.

The boxes represent a full iteration, but the diagram does not imply that every box executes a callback. For example, one iteration might execute an I/O callback in `poll`, a `setImmediate()` callback in `check`, and no callbacks in any other phase.

After any phase callback executes, Node processes the two special queues before continuing within the phase or advancing to another phase:

```text
 ┌───────────────────────────────────────────────────────────────┐
 │ one event-loop phase                                         │
 │                                                               │
 │  execute one eligible callback                               │
 │                 ↓                                             │
 │  drain process.nextTick queue                                 │
 │                 ↓                                             │
 │  drain Promise/queueMicrotask queue                           │
 │                 ↓                                             │
 │  execute another eligible phase callback, or leave the phase  │
 └───────────────────────────────────────────────────────────────┘
```

The next-tick and microtask queues are therefore checkpoints inside event-loop progress, not additional phases in the iteration.

A phase can have no eligible work. Node then moves on. When a phase does have callbacks, it generally processes its FIFO queue until the queue is empty or an internal callback limit is reached.

Phase order alone cannot predict every output. The result also depends on:

- When an operation becomes ready
- Where in the current iteration new work is scheduled
- Whether a timer's delay threshold has elapsed
- Whether the poll phase waits for I/O

## 8. Timers specify minimum delay thresholds

`setTimeout()` schedules a timer callback:

```js
setTimeout(callback, 1000);
```

The delay means that the callback cannot become eligible until approximately 1,000 milliseconds have elapsed. It does not guarantee execution at exactly 1,000 milliseconds.

```text
timer registered
        ↓
minimum delay elapses
        ↓
timer becomes eligible
        ↓
event loop reaches an appropriate timers opportunity
        ↓
callback executes when JavaScript is available
```

Other callbacks or long-running JavaScript can delay timer execution.

`setImmediate()` uses the check phase rather than the timers mechanism:

```js
setImmediate(() => {
  console.log("check-phase callback");
});
```

When `setImmediate()` and `setTimeout(..., 0)` are scheduled at the top level, their relative order can vary. When both are scheduled inside an I/O callback, `setImmediate()` normally runs first because the event loop proceeds from poll to check before reaching a later timers opportunity.

## 9. Promise handlers use the microtask queue

A **Promise** represents an eventual result. Its state begins as `pending` and later becomes either `fulfilled` with a value or `rejected` with a reason.

Handlers registered with `.then()`, `.catch()`, and `.finally()` do not run immediately. When the associated Promise is settled appropriately, Node/V8 places the handler in the **microtask queue**.

`queueMicrotask()` places its callback into that same queue:

```js
console.log("A");

Promise.resolve().then(() => {
  console.log("promise handler");
});

queueMicrotask(() => {
  console.log("queued microtask");
});

console.log("B");
```

The output is:

```text
A
B
promise handler
queued microtask
```

The current synchronous script finishes before either microtask executes. The two microtasks then execute in the order in which they were queued.

A **microtask checkpoint** is an opportunity to drain the microtask queue. At a checkpoint, Node/V8 keeps executing microtasks until the queue is empty, including microtasks added by other microtasks.

```js
Promise.resolve().then(() => {
  console.log("microtask 1");

  queueMicrotask(() => {
    console.log("microtask 2");
  });
});

setTimeout(() => {
  console.log("timer");
}, 0);
```

The output is:

```text
microtask 1
microtask 2
timer
```

Recursively adding microtasks can delay event-loop progress, including timers and I/O callbacks.

## 10. `process.nextTick()` has a separate queue

`process.nextTick()` is a Node-specific scheduling API:

```js
process.nextTick(() => {
  console.log("next-tick callback");
});
```

It adds the callback to Node's **next-tick queue**. Despite the API's name, the callback does not wait for the next event-loop iteration. Node drains this queue after the current JavaScript operation finishes and before allowing the event loop to continue.

The next-tick queue is separate from both event-loop phase queues and the Promise microtask queue. In ordinary CommonJS callback execution, the order is:

```text
current JavaScript operation finishes
        ↓
drain process.nextTick queue
        ↓
drain Promise/queueMicrotask queue
        ↓
continue event-loop processing
```

For example, in a CommonJS file:

```js
setTimeout(() => console.log("timer"), 0);
Promise.resolve().then(() => console.log("promise"));
process.nextTick(() => console.log("nextTick"));
console.log("script");
```

The output is:

```text
script
nextTick
promise
timer
```

Top-level ES module evaluation is already performed through the microtask machinery, so top-level ordering between Promise microtasks and `process.nextTick()` can differ in an ES module. This exception does not change the central fact that neither queue is an event-loop phase.

Current Node documentation marks `process.nextTick()` as legacy and recommends `queueMicrotask()` for most user code. Recursive next-tick scheduling can prevent the event loop from reaching I/O.

## 11. Special queues are processed between event-loop callbacks

Node processes the next-tick and microtask queues after a JavaScript callback returns, before proceeding to another event-loop callback. This can happen between two callbacks belonging to the same phase.

```js
setTimeout(() => {
  console.log("timer 1");

  process.nextTick(() => console.log("nextTick"));
  Promise.resolve().then(() => console.log("promise"));
}, 0);

setTimeout(() => {
  console.log("timer 2");
}, 0);
```

The output is:

```text
timer 1
nextTick
promise
timer 2
```

Both timer callbacks may belong to the same timers phase. The detailed sequence is:

```text
timers processing selects timer 1
        ↓
timer 1 callback executes and returns
        ↓
next-tick queue is drained
        ↓
microtask queue is drained
        ↓
timers processing selects timer 2
```

It would be incorrect to describe this as a next-tick phase followed by a microtask phase followed by a timers phase. Next ticks and microtasks are checkpoint work, not phases.

## 12. Promise-based I/O combines host work and microtasks

The Promise version of file reading combines two scheduling systems:

```js
import { readFile } from "node:fs/promises";

readFile("notes.txt", "utf8").then((text) => {
  console.log(text);
});
```

The sequence is:

```text
JavaScript calls readFile()
        ↓
Node starts or delegates file I/O
        ↓
the file operation completes
        ↓
Node fulfills the Promise
        ↓
fulfillment makes the .then() handler a microtask
        ↓
the handler executes at a microtask checkpoint
```

The underlying completion is an I/O occurrence. The `.then()` handler is a microtask because Promise reactions use the microtask queue.

## 13. `async` and `await` are built on Promises

An `async` function always returns a Promise:

```js
async function answer() {
  return 42;
}

const result = answer(); // Promise<number> in TypeScript
```

`await` pauses only the surrounding async function. It does not block the Node.js thread while the operation is pending.

```js
import { readFile } from "node:fs/promises";

async function showFile() {
  console.log("inside: before");

  const text = await readFile("notes.txt", "utf8");

  console.log("inside: after");
  return text;
}

console.log("outside: A");
showFile();
console.log("outside: B");
```

The initial output is:

```text
outside: A
inside: before
outside: B
```

After the file read completes and its Promise is fulfilled, the portion of `showFile()` following `await` resumes as a microtask. It then prints `inside: after`.

## 14. Concurrency is different from parallel JavaScript execution

**Concurrency** means multiple operations can be in progress during overlapping periods. **Parallelism** means work literally executes at the same instant on different processing resources.

Node can have multiple I/O operations in progress concurrently:

```js
import { readFile } from "node:fs/promises";

const firstPromise = readFile("a.txt", "utf8");
const secondPromise = readFile("b.txt", "utf8");

const [first, second] = await Promise.all([
  firstPromise,
  secondPromise,
]);
```

The operating system or worker pool may perform work away from the main JavaScript thread. The resulting JavaScript callbacks and Promise continuations still execute one at a time on that thread.

Starting independent operations before awaiting them allows overlap. Awaiting each before starting the next makes them sequential:

```js
// Sequential: the second read starts after the first result arrives.
const first = await readFile("a.txt", "utf8");
const second = await readFile("b.txt", "utf8");
```

## 15. Error handling follows the chosen API style

Node callback APIs commonly use an error-first callback:

```js
readFile("missing.txt", "utf8", (error, text) => {
  if (error) {
    console.error(error);
    return;
  }

  console.log(text);
});
```

Promise errors are rejections:

```js
readFile("missing.txt", "utf8")
  .then((text) => console.log(text))
  .catch((error) => console.error(error));
```

With `await`, rejected Promises can be handled with `try`/`catch`:

```js
try {
  const text = await readFile("missing.txt", "utf8");
  console.log(text);
} catch (error) {
  console.error(error);
}
```

## 16. Terminology summary

| Term | Meaning in this guide |
| --- | --- |
| Call stack | V8's record of currently executing JavaScript function calls |
| Callback | A function supplied to other code to invoke; it may be synchronous or asynchronous |
| Host environment | Node.js facilities surrounding the JavaScript engine |
| Completion | The point when an asynchronous operation finishes; its callback may execute later |
| Event | An occurrence such as data arriving or a resource closing |
| Listener | A callback registered to respond to an event |
| Event loop | Node's repeating mechanism for coordinating asynchronous work and callback execution |
| Event-loop iteration | One traversal of the event-loop cycle; also informally called a turn or tick |
| Event-loop phase | A stage responsible for a category of callbacks, such as poll or check |
| Event-loop callback | A callback executed through a phase, such as a timer or I/O callback |
| Task / macrotask | Informal umbrella terminology; in Node explanations, naming the actual phase or mechanism is more precise |
| Microtask | A Promise reaction, `await` continuation, or `queueMicrotask()` callback |
| Next-tick callback | A callback queued with `process.nextTick()` in Node's separate next-tick queue |
| Timer threshold | The minimum delay before a timer callback may become eligible |

## 17. Compact scheduling model

The complete beginner-level model is:

```text
1. V8 executes synchronous JavaScript on the call stack.

2. JavaScript may ask Node to start I/O, register an event listener,
   or schedule a timer.

3. The Node API returns, so JavaScript continues instead of waiting.

4. An operation later completes or an event occurs.

5. Node makes the associated result handler eligible, or settles a
   Promise whose reaction becomes a microtask.

6. The current JavaScript operation always runs to completion.

7. After that operation, Node drains the next-tick queue and then
   drains the Promise/queueMicrotask queue.

8. Node continues traversing ordered event-loop phases and executes
   eligible phase callbacks one at a time.

9. After each callback, Node again processes next ticks and
   microtasks before continuing event-loop work.

10. Node exits when no remaining work keeps the event loop alive.
```

The most important rule is:

> A function's scheduling category is determined by the mechanism that schedules it, not merely by the fact that it is a callback or uses a Node API.

## References

- [Node.js: The Node.js Event Loop](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick)
- [Node.js: `process.nextTick()` and `queueMicrotask()`](https://nodejs.org/api/process.html#when-to-use-queuemicrotask-vs-processnexttick)
- [Node.js: Timers](https://nodejs.org/api/timers.html)
- [Node.js: Don't Block the Event Loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)
