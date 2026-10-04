import { describe, expect, it, vi } from "vitest";
import { loadAllRelationOptions } from "@/src/modules/admin/read-model/all-relation-options";

describe("article institution picker pagination", () => {
  it("includes institutions after the first 50 without increasing the query limit", async () => {
    const items = Array.from({ length: 103 }, (_, i) => ({
      id: String(i),
      slug: `school-${i}`,
      label: i === 102 ? "화랑초등학교" : `학교 ${i}`,
    }));
    const load = vi.fn(
      async ({ page, pageSize }: { page: number; pageSize: number }) => ({
        items: items.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
          page,
          pageSize,
          total: items.length,
          hasNext: page * pageSize < items.length,
        },
      }),
    );
    expect(await loadAllRelationOptions(load)).toEqual(items);
    expect(load.mock.calls.map(([input]) => input)).toEqual([
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
      { page: 3, pageSize: 50 },
    ]);
  });

  it("handles an empty catalog with one request", async () => {
    const load = vi.fn(async () => ({
      items: [],
      pagination: { page: 1, pageSize: 50, total: 0, hasNext: false },
    }));
    expect(await loadAllRelationOptions(load)).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not silently present a partial selection when another page fails", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        pagination: { page: 1, pageSize: 50, total: 51, hasNext: true },
      })
      .mockRejectedValueOnce(new Error("unavailable"));
    await expect(loadAllRelationOptions(load)).rejects.toThrow("unavailable");
  });

  it("deduplicates a row repeated between pages", async () => {
    const item = { id: "same", slug: "same", label: "학교" };
    const load = vi.fn(
      async ({ page, pageSize }: { page: number; pageSize: number }) => ({
        items: [item],
        pagination: { page, pageSize, total: 51, hasNext: page === 1 },
      }),
    );
    expect(await loadAllRelationOptions(load)).toEqual([item]);
  });
});
