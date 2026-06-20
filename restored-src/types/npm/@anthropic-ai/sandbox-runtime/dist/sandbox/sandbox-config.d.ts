/**
 * Configuration for Sandbox Runtime
 * This is the main configuration interface that consumers pass to SandboxManager.initialize()
 */
import type { FilterRequestCallback } from './request-filter.js';
import { z } from 'zod';
/**
 * Schema for MITM proxy configuration
 * Allows routing specific domains through an upstream MITM proxy via Unix socket
 */
declare const MitmProxyConfigSchema: z.ZodObject<{
    socketPath: z.ZodString;
    domains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
}, "strip", z.ZodTypeAny, {
    socketPath: string;
    domains: string[];
}, {
    socketPath: string;
    domains: string[];
}>;
/**
 * Schema for upstream/parent HTTP proxy configuration.
 * Used when SRT itself runs behind a corporate proxy and cannot make direct
 * outbound connections.
 */
declare const ParentProxyConfigSchema: z.ZodObject<{
    http: z.ZodOptional<z.ZodString>;
    https: z.ZodOptional<z.ZodString>;
    noProxy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    http?: string | undefined;
    https?: string | undefined;
    noProxy?: string | undefined;
}, {
    http?: string | undefined;
    https?: string | undefined;
    noProxy?: string | undefined;
}>;
/**
 * Schema for the access mode of a declared credential source.
 *
 * - `deny` — the sandboxed process cannot read the file / does not see the
 *   environment variable.
 * - `mask` — reserved for credential masking; rejected until masking ships.
 *
 * Additional modes (e.g. a working `mask`) will be added in future releases.
 */
declare const credentialModeSchema: z.ZodEffects<z.ZodEnum<["deny", "mask"]>, "deny", "deny" | "mask">;
/**
 * Schema for a single credential file/directory entry.
 */
export declare const CredentialFileConfigSchema: z.ZodObject<{
    path: z.ZodString;
    mode: z.ZodEffects<z.ZodEnum<["deny", "mask"]>, "deny", "deny" | "mask">;
}, "strip", z.ZodTypeAny, {
    mode: "deny";
    path: string;
}, {
    mode: "deny" | "mask";
    path: string;
}>;
/**
 * Schema for a single credential environment variable entry.
 */
export declare const CredentialEnvVarConfigSchema: z.ZodObject<{
    name: z.ZodString;
    mode: z.ZodEffects<z.ZodEnum<["deny", "mask"]>, "deny", "deny" | "mask">;
}, "strip", z.ZodTypeAny, {
    mode: "deny";
    name: string;
}, {
    mode: "deny" | "mask";
    name: string;
}>;
/**
 * Credentials configuration schema for validation.
 *
 * Declares credential sources (files and environment variables) with a
 * per-source mode:
 * - `deny` blocks the source inside the sandbox (file reads are denied via the
 *   filesystem read-deny mechanism, env vars are unset in the child).
 *
 * Additional modes (e.g. `mask`) will be added in future releases.
 *
 * Only the sources declared here are affected; the section applies no
 * implicit restrictions beyond them.
 */
export declare const CredentialsConfigSchema: z.ZodObject<{
    files: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        mode: z.ZodEffects<z.ZodEnum<["deny", "mask"]>, "deny", "deny" | "mask">;
    }, "strip", z.ZodTypeAny, {
        mode: "deny";
        path: string;
    }, {
        mode: "deny" | "mask";
        path: string;
    }>, "many">>;
    envVars: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        mode: z.ZodEffects<z.ZodEnum<["deny", "mask"]>, "deny", "deny" | "mask">;
    }, "strip", z.ZodTypeAny, {
        mode: "deny";
        name: string;
    }, {
        mode: "deny" | "mask";
        name: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    files?: {
        mode: "deny";
        path: string;
    }[] | undefined;
    envVars?: {
        mode: "deny";
        name: string;
    }[] | undefined;
}, {
    files?: {
        mode: "deny" | "mask";
        path: string;
    }[] | undefined;
    envVars?: {
        mode: "deny" | "mask";
        name: string;
    }[] | undefined;
}>;
/**
 * Network configuration schema for validation
 */
export declare const NetworkConfigSchema: z.ZodObject<{
    allowedDomains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    deniedDomains: z.ZodArray<z.ZodUnion<[z.ZodLiteral<"*">, z.ZodEffects<z.ZodString, string, string>]>, "many">;
    strictAllowlist: z.ZodOptional<z.ZodBoolean>;
    allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
    allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
    allowMachLookup: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    httpProxyPort: z.ZodOptional<z.ZodNumber>;
    socksProxyPort: z.ZodOptional<z.ZodNumber>;
    mitmProxy: z.ZodOptional<z.ZodObject<{
        socketPath: z.ZodString;
        domains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    }, "strip", z.ZodTypeAny, {
        socketPath: string;
        domains: string[];
    }, {
        socketPath: string;
        domains: string[];
    }>>;
    filterRequest: z.ZodOptional<z.ZodType<FilterRequestCallback, z.ZodTypeDef, FilterRequestCallback>>;
    tlsTerminate: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        caCertPath: z.ZodOptional<z.ZodString>;
        caKeyPath: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
    }, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
    }>, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
    }, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
    }>>;
    parentProxy: z.ZodOptional<z.ZodObject<{
        http: z.ZodOptional<z.ZodString>;
        https: z.ZodOptional<z.ZodString>;
        noProxy: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    }, {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    allowedDomains: string[];
    deniedDomains: string[];
    strictAllowlist?: boolean | undefined;
    allowUnixSockets?: string[] | undefined;
    allowAllUnixSockets?: boolean | undefined;
    allowLocalBinding?: boolean | undefined;
    allowMachLookup?: string[] | undefined;
    httpProxyPort?: number | undefined;
    socksProxyPort?: number | undefined;
    mitmProxy?: {
        socketPath: string;
        domains: string[];
    } | undefined;
    filterRequest?: FilterRequestCallback | undefined;
    tlsTerminate?: {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
    } | undefined;
    parentProxy?: {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    } | undefined;
}, {
    allowedDomains: string[];
    deniedDomains: string[];
    strictAllowlist?: boolean | undefined;
    allowUnixSockets?: string[] | undefined;
    allowAllUnixSockets?: boolean | undefined;
    allowLocalBinding?: boolean | undefined;
    allowMachLookup?: string[] | undefined;
    httpProxyPort?: number | undefined;
    socksProxyPort?: number | undefined;
    mitmProxy?: {
        socketPath: string;
        domains: string[];
    } | undefined;
    filterRequest?: FilterRequestCallback | undefined;
    tlsTerminate?: {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
    } | undefined;
    parentProxy?: {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    } | undefined;
}>;
/**
 * Filesystem configuration schema for validation
 */
export declare const FilesystemConfigSchema: z.ZodObject<{
    denyRead: z.ZodArray<z.ZodString, "many">;
    allowRead: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowWrite: z.ZodArray<z.ZodString, "many">;
    denyWrite: z.ZodArray<z.ZodString, "many">;
    allowGitConfig: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
    allowRead?: string[] | undefined;
    allowGitConfig?: boolean | undefined;
}, {
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
    allowRead?: string[] | undefined;
    allowGitConfig?: boolean | undefined;
}>;
/**
 * Configuration schema for ignoring specific sandbox violations
 * Maps command patterns to filesystem paths to ignore violations for.
 */
export declare const IgnoreViolationsConfigSchema: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>;
/**
 * Ripgrep configuration schema
 */
export declare const RipgrepConfigSchema: z.ZodObject<{
    command: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    argv0: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    command: string;
    args?: string[] | undefined;
    argv0?: string | undefined;
}, {
    command: string;
    args?: string[] | undefined;
    argv0?: string | undefined;
}>;
/**
 * Windows-specific configuration schema. See
 * `windows-sandbox-utils.ts` for the install flow these settings
 * must agree with.
 */
export declare const WindowsConfigSchema: z.ZodObject<{
    groupName: z.ZodDefault<z.ZodString>;
    groupSid: z.ZodOptional<z.ZodString>;
    wfpSublayerGuid: z.ZodOptional<z.ZodString>;
    proxyPortRange: z.ZodOptional<z.ZodEffects<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, [number, number], [number, number]>>;
}, "strip", z.ZodTypeAny, {
    groupName: string;
    groupSid?: string | undefined;
    wfpSublayerGuid?: string | undefined;
    proxyPortRange?: [number, number] | undefined;
}, {
    groupName?: string | undefined;
    groupSid?: string | undefined;
    wfpSublayerGuid?: string | undefined;
    proxyPortRange?: [number, number] | undefined;
}>;
/**
 * Seccomp configuration schema (Linux only)
 */
export declare const SeccompConfigSchema: z.ZodObject<{
    applyPath: z.ZodOptional<z.ZodString>;
    argv0: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    argv0?: string | undefined;
    applyPath?: string | undefined;
}, {
    argv0?: string | undefined;
    applyPath?: string | undefined;
}>;
/**
 * Main configuration schema for Sandbox Runtime validation
 */
export declare const SandboxRuntimeConfigSchema: z.ZodObject<{
    network: z.ZodObject<{
        allowedDomains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
        deniedDomains: z.ZodArray<z.ZodUnion<[z.ZodLiteral<"*">, z.ZodEffects<z.ZodString, string, string>]>, "many">;
        strictAllowlist: z.ZodOptional<z.ZodBoolean>;
        allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
        allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
        allowMachLookup: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
        httpProxyPort: z.ZodOptional<z.ZodNumber>;
        socksProxyPort: z.ZodOptional<z.ZodNumber>;
        mitmProxy: z.ZodOptional<z.ZodObject<{
            socketPath: z.ZodString;
            domains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
        }, "strip", z.ZodTypeAny, {
            socketPath: string;
            domains: string[];
        }, {
            socketPath: string;
            domains: string[];
        }>>;
        filterRequest: z.ZodOptional<z.ZodType<FilterRequestCallback, z.ZodTypeDef, FilterRequestCallback>>;
        tlsTerminate: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            caCertPath: z.ZodOptional<z.ZodString>;
            caKeyPath: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        }, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        }>, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        }, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        }>>;
        parentProxy: z.ZodOptional<z.ZodObject<{
            http: z.ZodOptional<z.ZodString>;
            https: z.ZodOptional<z.ZodString>;
            noProxy: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        }, {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        allowedDomains: string[];
        deniedDomains: string[];
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    }, {
        allowedDomains: string[];
        deniedDomains: string[];
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    }>;
    filesystem: z.ZodObject<{
        denyRead: z.ZodArray<z.ZodString, "many">;
        allowRead: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowWrite: z.ZodArray<z.ZodString, "many">;
        denyWrite: z.ZodArray<z.ZodString, "many">;
        allowGitConfig: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    }, {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    }>;
    credentials: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            mode: z.ZodEffects<z.ZodEnum<["deny", "mask"]>, "deny", "deny" | "mask">;
        }, "strip", z.ZodTypeAny, {
            mode: "deny";
            path: string;
        }, {
            mode: "deny" | "mask";
            path: string;
        }>, "many">>;
        envVars: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            mode: z.ZodEffects<z.ZodEnum<["deny", "mask"]>, "deny", "deny" | "mask">;
        }, "strip", z.ZodTypeAny, {
            mode: "deny";
            name: string;
        }, {
            mode: "deny" | "mask";
            name: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        files?: {
            mode: "deny";
            path: string;
        }[] | undefined;
        envVars?: {
            mode: "deny";
            name: string;
        }[] | undefined;
    }, {
        files?: {
            mode: "deny" | "mask";
            path: string;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
        }[] | undefined;
    }>>;
    ignoreViolations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
    enableWeakerNestedSandbox: z.ZodOptional<z.ZodBoolean>;
    enableWeakerNetworkIsolation: z.ZodOptional<z.ZodBoolean>;
    allowAppleEvents: z.ZodOptional<z.ZodBoolean>;
    ripgrep: z.ZodOptional<z.ZodObject<{
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        argv0: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    }, {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    }>>;
    mandatoryDenySearchDepth: z.ZodOptional<z.ZodNumber>;
    allowPty: z.ZodOptional<z.ZodBoolean>;
    seccomp: z.ZodOptional<z.ZodObject<{
        applyPath: z.ZodOptional<z.ZodString>;
        argv0: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    }, {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    }>>;
    bwrapPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    socatPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    windows: z.ZodOptional<z.ZodObject<{
        groupName: z.ZodDefault<z.ZodString>;
        groupSid: z.ZodOptional<z.ZodString>;
        wfpSublayerGuid: z.ZodOptional<z.ZodString>;
        proxyPortRange: z.ZodOptional<z.ZodEffects<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, [number, number], [number, number]>>;
    }, "strip", z.ZodTypeAny, {
        groupName: string;
        groupSid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
    }, {
        groupName?: string | undefined;
        groupSid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    network: {
        allowedDomains: string[];
        deniedDomains: string[];
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    };
    filesystem: {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    };
    credentials?: {
        files?: {
            mode: "deny";
            path: string;
        }[] | undefined;
        envVars?: {
            mode: "deny";
            name: string;
        }[] | undefined;
    } | undefined;
    ignoreViolations?: Record<string, string[]> | undefined;
    enableWeakerNestedSandbox?: boolean | undefined;
    enableWeakerNetworkIsolation?: boolean | undefined;
    allowAppleEvents?: boolean | undefined;
    ripgrep?: {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    } | undefined;
    mandatoryDenySearchDepth?: number | undefined;
    allowPty?: boolean | undefined;
    seccomp?: {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    } | undefined;
    bwrapPath?: string | undefined;
    socatPath?: string | undefined;
    windows?: {
        groupName: string;
        groupSid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
    } | undefined;
}, {
    network: {
        allowedDomains: string[];
        deniedDomains: string[];
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    };
    filesystem: {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    };
    credentials?: {
        files?: {
            mode: "deny" | "mask";
            path: string;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
        }[] | undefined;
    } | undefined;
    ignoreViolations?: Record<string, string[]> | undefined;
    enableWeakerNestedSandbox?: boolean | undefined;
    enableWeakerNetworkIsolation?: boolean | undefined;
    allowAppleEvents?: boolean | undefined;
    ripgrep?: {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    } | undefined;
    mandatoryDenySearchDepth?: number | undefined;
    allowPty?: boolean | undefined;
    seccomp?: {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    } | undefined;
    bwrapPath?: string | undefined;
    socatPath?: string | undefined;
    windows?: {
        groupName?: string | undefined;
        groupSid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
    } | undefined;
}>;
export type MitmProxyConfig = z.infer<typeof MitmProxyConfigSchema>;
export type ParentProxyConfig = z.infer<typeof ParentProxyConfigSchema>;
export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type FilesystemConfig = z.infer<typeof FilesystemConfigSchema>;
export type CredentialMode = z.infer<typeof credentialModeSchema>;
export type CredentialFileConfig = z.infer<typeof CredentialFileConfigSchema>;
export type CredentialEnvVarConfig = z.infer<typeof CredentialEnvVarConfigSchema>;
export type CredentialsConfig = z.infer<typeof CredentialsConfigSchema>;
export type IgnoreViolationsConfig = z.infer<typeof IgnoreViolationsConfigSchema>;
export type RipgrepConfig = z.infer<typeof RipgrepConfigSchema>;
export type SeccompConfig = z.infer<typeof SeccompConfigSchema>;
export type WindowsConfig = z.infer<typeof WindowsConfigSchema>;
export type SandboxRuntimeConfig = z.infer<typeof SandboxRuntimeConfigSchema>;
export {};
//# sourceMappingURL=sandbox-config.d.ts.map