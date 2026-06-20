import { Command as $Command } from "@smithy/core/client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  PutAccountDataRetentionRequest,
  PutAccountDataRetentionResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface PutAccountDataRetentionCommandInput
  extends PutAccountDataRetentionRequest {}
export interface PutAccountDataRetentionCommandOutput
  extends PutAccountDataRetentionResponse,
    __MetadataBearer {}
declare const PutAccountDataRetentionCommand_base: {
  new (
    input: PutAccountDataRetentionCommandInput
  ): import("@smithy/core/client").CommandImpl<
    PutAccountDataRetentionCommandInput,
    PutAccountDataRetentionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: PutAccountDataRetentionCommandInput
  ): import("@smithy/core/client").CommandImpl<
    PutAccountDataRetentionCommandInput,
    PutAccountDataRetentionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): {
    [x: string]: unknown;
  };
};
export declare class PutAccountDataRetentionCommand extends PutAccountDataRetentionCommand_base {
  protected static __types: {
    api: {
      input: PutAccountDataRetentionRequest;
      output: PutAccountDataRetentionResponse;
    };
    sdk: {
      input: PutAccountDataRetentionCommandInput;
      output: PutAccountDataRetentionCommandOutput;
    };
  };
}
