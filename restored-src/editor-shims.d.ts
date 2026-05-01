declare const process: any
declare const Buffer: any
declare const __dirname: string
declare const __filename: string

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: any
  }
}

declare namespace React {
  type ReactNode = any
  type FC<P = any> = any
  type ComponentType<P = any> = any
  type Dispatch<A = any> = (value: A) => void
  type SetStateAction<S> = S | ((prevState: S) => S)
  type MutableRefObject<T = any> = { current: T }
  type RefObject<T = any> = { current: T | null }
}

declare module "react" {
  const React: any
  export default React
  export type ReactNode = any
  export type FC<P = any> = any
  export type ComponentType<P = any> = any
  export type Dispatch<A = any> = (value: A) => void
  export type SetStateAction<S> = S | ((prevState: S) => S)
  export type MutableRefObject<T = any> = { current: T }
  export type RefObject<T = any> = { current: T | null }
  export const Fragment: any
  export const Suspense: any
  export const StrictMode: any
  export const Children: any
  export const createContext: any
  export const createElement: any
  export const forwardRef: any
  export const lazy: any
  export const memo: any
  export const startTransition: any
  export const use: any
  export const useCallback: any
  export const useContext: any
  export const useDebugValue: any
  export const useDeferredValue: any
  export const useEffect: any
  export const useId: any
  export const useImperativeHandle: any
  export const useLayoutEffect: any
  export const useMemo: any
  export const useReducer: any
  export const useRef: any
  export const useState: any
  export const useSyncExternalStore: any
  export const useTransition: any
}

declare module "react/compiler-runtime" {
  export const c: any
}

declare module "bun:bundle" {
  export function feature(name: string): boolean
}

declare module "node:*" {
  const value: any
  export = value
}
