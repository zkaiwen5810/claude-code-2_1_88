import { Command as $Command } from "@smithy/core/client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  ListAccountRolesRequest,
  ListAccountRolesResponse,
} from "../models/models_0";
import {
  ServiceInputTypes,
  ServiceOutputTypes,
  SSOClientResolvedConfig,
} from "../SSOClient";
export { __MetadataBearer };
export { $Command };
export interface ListAccountRolesCommandInput extends ListAccountRolesRequest {}
export interface ListAccountRolesCommandOutput
  extends ListAccountRolesResponse,
    __MetadataBearer {}
declare const ListAccountRolesCommand_base: {
  new (
    input: ListAccountRolesCommandInput
  ): import("@smithy/core/client").CommandImpl<
    ListAccountRolesCommandInput,
    ListAccountRolesCommandOutput,
    SSOClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: ListAccountRolesCommandInput
  ): import("@smithy/core/client").CommandImpl<
    ListAccountRolesCommandInput,
    ListAccountRolesCommandOutput,
    SSOClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): {
    [x: string]: unknown;
  };
};
export declare class ListAccountRolesCommand extends ListAccountRolesCommand_base {
  protected static __types: {
    api: {
      input: ListAccountRolesRequest;
      output: ListAccountRolesResponse;
    };
    sdk: {
      input: ListAccountRolesCommandInput;
      output: ListAccountRolesCommandOutput;
    };
  };
}
