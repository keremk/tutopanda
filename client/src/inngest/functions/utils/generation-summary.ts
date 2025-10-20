export type GenerationSummary = {
  generated: number;
  needsPromptUpdate: number;
  failed: number;
  total: number;
};

export function summarizeAssets<T extends { status?: string | null | undefined }>(
  assets: T[]
): GenerationSummary {
  let generated = 0;
  let needsPromptUpdate = 0;
  let failed = 0;

  for (const asset of assets) {
    const status = asset.status ?? "generated";
    if (status === "needs_prompt_update") {
      needsPromptUpdate += 1;
    } else if (status === "failed") {
      failed += 1;
    } else {
      generated += 1;
    }
  }

  return {
    generated,
    needsPromptUpdate,
    failed,
    total: assets.length,
  };
}

export function formatSummaryMessage(summary: GenerationSummary, noun: string): string {
  const parts: string[] = [];
  parts.push(`${summary.generated} ${noun}${summary.generated === 1 ? "" : "s"} generated`);

  if (summary.needsPromptUpdate > 0) {
    parts.push(
      `${summary.needsPromptUpdate} ${noun}${summary.needsPromptUpdate === 1 ? "" : "s"} needs prompt update`
    );
  }

  if (summary.failed > 0) {
    parts.push(`${summary.failed} ${noun}${summary.failed === 1 ? "" : "s"} failed`);
  }

  return parts.join(", ");
}
