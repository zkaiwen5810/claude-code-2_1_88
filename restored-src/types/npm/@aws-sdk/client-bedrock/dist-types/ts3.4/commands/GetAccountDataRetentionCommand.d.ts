import { Command as $Command } from "@smithy/core/client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetAccountDataRetentionRequest,
  GetAccountDataRetentionResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetAccountDataRetentionCommandInput
  extends GetAccountDataRetentionRequest {}
export interface GetAccountDataRetentionCommandOutput
  extends GetAccountDataRetentionResponse,
    __MetadataBearer {}
declare const GetAccountDataRetentionCommand_base: {
  new (
    input: GetAccountDataRetentionCommandInput
  ): import("@smithy/core/client").CommandImpl<
    GetAccountDataRetentionCommandInput,
    GetAccountDataRetentionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [GetAccountDataRetentionCommandInput]
  ): import("@smithy/core/client").CommandImpl<
    GetAccountDataRetentionCommandInput,
    GetAccountDataRetentionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): {
    [x: string]: unknown;
  };
};
export declare class GetAccountDataRetentionCommand extends GetAccountDataRetentionCommand_base {
  protected static __types: {
    api: {
      input: {};
      output: GetAccountDataRetentionResponse;
    };
    sdk: {
      input: GetAccountDataRetentionCommandInput;
      output: GetAccountDataRetentionCommandOutput;
    };
  };
}
