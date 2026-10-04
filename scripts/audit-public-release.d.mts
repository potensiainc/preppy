import type { CheerioAPI } from "cheerio";

export function inspectHtml(html: string): {
  markers: string[];
  emptyLinks: string[];
  $: CheerioAPI;
};

export function auditSource(): Promise<{
  filesScanned: number;
  findings: Array<{
    file: string;
    excerpt: string;
    line?: number;
    key?: string;
  }>;
}>;
