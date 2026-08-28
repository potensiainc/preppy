import { z } from "zod";

const MEBIBYTE = 1024 * 1024;

const httpCollectorPolicySchema = z
  .object({
    maxDepth: z.number().int().min(0).max(2).default(2),
    maxPagesPerInstitution: z.number().int().min(1).max(30).default(30),
    maxLinksPerPage: z.number().int().min(1).max(250).default(250),
    maxResponseBytesPerPage: z
      .number()
      .int()
      .min(1)
      .max(2 * MEBIBYTE)
      .default(2 * MEBIBYTE),
    maxTotalBytesPerRun: z
      .number()
      .int()
      .min(1)
      .max(20 * MEBIBYTE)
      .default(20 * MEBIBYTE),
    requestTimeoutMs: z.number().int().min(1).max(30_000).default(10_000),
    connectTimeoutMs: z.number().int().min(1).max(30_000).default(5_000),
    maxRedirects: z.number().int().min(0).max(5).default(5),
    perHostConcurrency: z.number().int().min(1).max(1).default(1),
    globalConcurrency: z.number().int().min(1).max(4).default(4),
    minimumHostDelayMs: z.number().int().min(0).max(5_000).default(500),
    robotsMaxResponseBytes: z
      .number()
      .int()
      .min(1)
      .max(512 * 1024)
      .default(512 * 1024),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.connectTimeoutMs > value.requestTimeoutMs) {
      context.addIssue({
        code: "custom",
        message: "connectTimeoutMs cannot exceed requestTimeoutMs",
        path: ["connectTimeoutMs"],
      });
    }
    if (value.maxResponseBytesPerPage > value.maxTotalBytesPerRun) {
      context.addIssue({
        code: "custom",
        message: "page byte budget cannot exceed total byte budget",
        path: ["maxResponseBytesPerPage"],
      });
    }
    if (value.perHostConcurrency > value.globalConcurrency) {
      context.addIssue({
        code: "custom",
        message: "per-host concurrency cannot exceed global concurrency",
        path: ["perHostConcurrency"],
      });
    }
  });

export type HttpCollectorPolicy = Readonly<
  z.infer<typeof httpCollectorPolicySchema>
>;

export function parseHttpCollectorPolicy(
  input: unknown = {},
): HttpCollectorPolicy {
  return Object.freeze(httpCollectorPolicySchema.parse(input));
}

export const DEFAULT_HTTP_COLLECTOR_POLICY = parseHttpCollectorPolicy();
