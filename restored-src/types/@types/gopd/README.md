# Installation
> `npm install --save @types/gopd`

# Summary
This package contains type definitions for gopd (https://github.com/ljharb/gopd#readme).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/gopd.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/gopd/index.d.ts)
````ts
/**
 * Gets the own property descriptor of the specified object.
 * An own property descriptor is one that is defined directly on the object and is not inherited from the object's prototype.
 *
 * @param target Object that contains the property.
 * @param propertyKey Name of the property.
 */
declare const getOwnPropertyDescriptor:
    | (
        <T, P extends PropertyKey>(target: T, propertyKey: P) =>
            | (P extends keyof T ? TypedPropertyDescriptor<T[P]> : PropertyDescriptor)
            | undefined
    )
    | undefined
    | null;
export = getOwnPropertyDescriptor;

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 03:09:37 GMT
 * Dependencies: none

# Credits
These definitions were written by [Jordan Harband](https://github.com/ljharb).
