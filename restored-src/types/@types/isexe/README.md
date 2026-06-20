# Installation
> `npm install --save @types/isexe`

# Summary
This package contains type definitions for isexe (https://github.com/isaacs/isexe#readme).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/isexe.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/isexe/index.d.ts)
````ts
/// <reference types="node" />

export = isExe;

declare function isExe(path: string, options?: isExe.Options): Promise<boolean>;
declare function isExe(
    path: string,
    callback: (error: NodeJS.ErrnoException | undefined, isExe: boolean) => void,
): void;
declare function isExe(
    path: string,
    options: isExe.Options,
    callback: (error: NodeJS.ErrnoException | undefined, isExe: boolean) => void,
): void;

declare namespace isExe {
    function sync(path: string, options?: Options): boolean;

    interface Options {
        ignoreErrors?: boolean | undefined;
        uid?: number | undefined;
        gid?: number | undefined;
        pathExt?: string | undefined;
    }
}

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 03:09:37 GMT
 * Dependencies: [@types/node](https://npmjs.com/package/@types/node)

# Credits
These definitions were written by [BendingBender](https://github.com/BendingBender).
