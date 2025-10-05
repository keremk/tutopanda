// Ken Burns effect selection tests
// Note: Vitest is not yet configured. These tests will run once Vitest is set up.

import { describe, it, expect } from "vitest";
import {
  analyzeImageContent,
  selectKenBurnsEffect,
  kenBurnsEffects,
} from "./ken-burns";

describe("analyzeImageContent", () => {
  it("detects portrait content", () => {
    const result = analyzeImageContent("A portrait of a person smiling");
    expect(result.type).toBe("portrait");
    expect(result.mood).toBe("calm");
  });

  it("detects landscape content", () => {
    const result = analyzeImageContent("A beautiful mountain landscape");
    expect(result.type).toBe("landscape");
    expect(result.mood).toBe("calm");
  });

  it("detects architecture content", () => {
    const result = analyzeImageContent("Modern building architecture");
    expect(result.type).toBe("architecture");
    expect(result.mood).toBe("dramatic");
  });

  it("detects action content", () => {
    const result = analyzeImageContent("Person running fast");
    expect(result.type).toBe("action");
    expect(result.mood).toBe("energetic");
  });

  it("detects technical content", () => {
    const result = analyzeImageContent("Technical diagram showing flow");
    expect(result.type).toBe("technical");
    expect(result.mood).toBe("calm");
  });

  it("defaults to general for unknown content", () => {
    const result = analyzeImageContent("Random abstract art");
    expect(result.type).toBe("general");
    expect(result.mood).toBe("calm");
  });
});

describe("selectKenBurnsEffect", () => {
  it("selects portrait effects for portrait content", () => {
    const effect = selectKenBurnsEffect("A portrait of a student");
    expect(["portraitZoomIn", "portraitZoomOut"]).toContain(effect.name);
  });

  it("selects landscape effects for landscape content", () => {
    const effect = selectKenBurnsEffect("Beautiful ocean scenery");
    expect([
      "landscapePanLeft",
      "landscapePanRight",
      "zoomInPanLeft",
      "zoomInPanRight",
    ]).toContain(effect.name);
  });

  it("selects architecture effects for building content", () => {
    const effect = selectKenBurnsEffect("Tall building structure");
    expect([
      "architectureRise",
      "architectureDescend",
      "zoomInPanUp",
      "zoomInPanDown",
    ]).toContain(effect.name);
  });

  it("selects dramatic effects for action content", () => {
    const effect = selectKenBurnsEffect("Person jumping dynamically");
    expect([
      "dramaticZoomIn",
      "dramaticZoomOut",
      "energeticReveal",
      "diagonalZoomInUpRight",
      "diagonalZoomInDownLeft",
    ]).toContain(effect.name);
  });

  it("selects subtle effects for technical content", () => {
    const effect = selectKenBurnsEffect("Technical chart illustration");
    expect(["technicalSubtleZoom", "technicalPanRight"]).toContain(
      effect.name
    );
  });

  it("avoids using the same effect consecutively", () => {
    const firstEffect = selectKenBurnsEffect(
      "Portrait of teacher",
      undefined
    );
    const secondEffect = selectKenBurnsEffect(
      "Portrait of student",
      firstEffect.name
    );

    // For portrait, there are only 2 effects, so they should differ
    expect(secondEffect.name).not.toBe(firstEffect.name);
  });

  it("returns a valid effect structure", () => {
    const effect = selectKenBurnsEffect("Any image prompt");
    expect(effect).toHaveProperty("name");
    expect(effect).toHaveProperty("startScale");
    expect(effect).toHaveProperty("endScale");
    expect(effect).toHaveProperty("startX");
    expect(effect).toHaveProperty("startY");
    expect(effect).toHaveProperty("endX");
    expect(effect).toHaveProperty("endY");
    expect(typeof effect.startScale).toBe("number");
    expect(typeof effect.endScale).toBe("number");
  });

  it("handles empty prompt gracefully", () => {
    const effect = selectKenBurnsEffect("");
    expect(effect).toBeDefined();
    expect(effect.name).toBeDefined();
  });
});

describe("kenBurnsEffects presets", () => {
  it("contains all expected effect presets", () => {
    const expectedEffects = [
      "portraitZoomIn",
      "portraitZoomOut",
      "landscapePanLeft",
      "landscapePanRight",
      "architectureRise",
      "architectureDescend",
      "dramaticZoomIn",
      "dramaticZoomOut",
      "zoomInPanLeft",
      "zoomInPanRight",
      "zoomInPanUp",
      "zoomInPanDown",
      "diagonalZoomInUpRight",
      "diagonalZoomInDownLeft",
      "technicalSubtleZoom",
      "technicalPanRight",
      "energeticReveal",
    ];

    expectedEffects.forEach((effectName) => {
      expect(kenBurnsEffects[effectName]).toBeDefined();
    });
  });

  it("ensures all effects have valid scale values", () => {
    Object.values(kenBurnsEffects).forEach((effect) => {
      expect(effect.startScale).toBeGreaterThan(0);
      expect(effect.endScale).toBeGreaterThan(0);
    });
  });
});
