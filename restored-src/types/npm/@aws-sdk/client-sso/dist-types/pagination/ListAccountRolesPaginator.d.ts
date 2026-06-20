import type { Paginator } from "@smithy/types";
import { ListAccountRolesCommandInput, ListAccountRolesCommandOutput } from "../commands/ListAccountRolesCommand";
import type { SSOPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListAccountRoles: (config: SSOPaginationConfiguration, input: ListAccountRolesCommandInput, ...rest: any[]) => Paginator<ListAccountRolesCommandOutput>;
