# Installation
> `npm install --save @types/merge-stream`

# Summary
This package contains type definitions for merge-stream (https://github.com/grncdr/merge-stream).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/merge-stream.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/merge-stream/index.d.ts)
````ts
/// <reference types="node"/>

interface MergedStream extends NodeJS.ReadWriteStream {
    /**
     * A method to dynamically add more sources to the stream. The argument supplied to add can be
     * either a source or an array of sources.
     */
    add(source: NodeJS.ReadableStream | readonly NodeJS.ReadableStream[]): MergedStream;

    /**
     * A method that tells you if the merged stream is empty.
     */
    isEmpty(): boolean;
}

declare function merge<T extends NodeJS.ReadableStream>(...streams: Array<T | readonly T[]>): MergedStream;
export = merge;

````

### Additional Details
 * Last updated: Fri, 27 Sep 2024 16:40:34 GMT
 * Dependencies: [@types/node](https://npmjs.com/package/@types/node)

# Credits
These definitions were written by [Keita Kagurazaka](https://github.com/k-kagurazaka), [Tom X. Tobin](https://github.com/tomxtobin), [Daniel Zazula](https://github.com/daniel-zazula), and [Daniel Cassidy](https://github.com/djcsdy).
