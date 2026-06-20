# Installation
> `npm install --save @types/jwa`

# Summary
This package contains type definitions for jwa (https://github.com/auth0/node-jwa#readme).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/jwa.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/jwa/index.d.ts)
````ts
type Algorithm =
    | "HS256"
    | "HS384"
    | "HS512"
    | "RS256"
    | "RS384"
    | "RS512"
    | "PS256"
    | "PS384"
    | "PS512"
    | "ES256"
    | "ES384"
    | "ES512"
    | "none";

interface JWA {
    sign(input: string, secretOrPrivateKey: string): string;

    verify(input: string, signature: string, secretOrPublicKey: string): boolean;
}

declare function jwa(algorithm: Algorithm): JWA;

export = jwa;

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 03:09:37 GMT
 * Dependencies: none

# Credits
These definitions were written by [Daniel Hritzkiv](https://github.com/dhritzkiv).
