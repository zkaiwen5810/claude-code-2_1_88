export * from '@anthropic-ai/sdk/streaming';
import { EventStreamSerdeContext, SerdeContext } from '@smithy/types';
export declare const toUtf8: (input: Uint8Array) => string;
export declare const fromUtf8: (input: string) => Uint8Array;
export declare const getMinimalSerdeContext: () => SerdeContext & EventStreamSerdeContext;
/**
 * Transcodes a Bedrock streaming response from AWS's binary EventStream
 * framing to the SSE format the Anthropic API uses, preserving status,
 * headers (apart from content type/length), and URL.
 *
 * Chunk frames carry Anthropic-shaped JSON payloads; each becomes an SSE
 * frame named by the payload's `type`, so Anthropic error payloads become
 * standard SSE `error` events. AWS exception frames become SSE `error`
 * events with an Anthropic-shaped error body.
 */
export declare function eventStreamToSSEResponse(response: Response): Response;
//# sourceMappingURL=streaming.d.mts.map