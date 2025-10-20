import { describe, it, expect } from "vitest";
import { summarizeAssets, formatSummaryMessage } from "./generation-summary";

describe("generation-summary utils", () => {
  it("counts statuses correctly", () => {
    const assets = [
      { status: "generated" },
      { status: "needs_prompt_update" },
      { status: "failed" },
      {},
    ];

    const summary = summarizeAssets(assets);

    expect(summary).toEqual({
      generated: 2,
      needsPromptUpdate: 1,
      failed: 1,
      total: 4,
    });
  });

  it("formats summary message", () => {
    const summary = {
      generated: 2,
      needsPromptUpdate: 1,
      failed: 1,
      total: 4,
    };

    expect(formatSummaryMessage(summary, "image")).toBe(
      "2 images generated, 1 image needs prompt update, 1 image failed"
    );
  });
});
