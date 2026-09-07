import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const reviewInsightSchema = z
  .object({
    periodStart: isoDate.nullable(),
    periodEnd: isoDate.nullable(),
    reviewCount: z.number().int().positive(),
    themes: z
      .array(
        z
          .object({
            summary: nonEmptyText,
            mentionCount: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .min(1),
    limitations: nonEmptyText.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.periodStart !== null &&
      value.periodEnd !== null &&
      value.periodStart > value.periodEnd
    ) {
      context.addIssue({
        code: "custom",
        message: "후기 검토 시작일은 종료일보다 늦을 수 없습니다.",
        path: ["periodStart"],
      });
    }

    for (const [index, theme] of value.themes.entries()) {
      if (
        theme.mentionCount !== undefined &&
        theme.mentionCount > value.reviewCount
      ) {
        context.addIssue({
          code: "custom",
          message: "주제 언급 수는 검토한 후기 수보다 클 수 없습니다.",
          path: ["themes", index, "mentionCount"],
        });
      }
    }
  });

export type ReviewInsightValue = z.infer<typeof reviewInsightSchema>;

export function parseReviewInsightValue(value: unknown): ReviewInsightValue {
  return reviewInsightSchema.parse(value);
}
