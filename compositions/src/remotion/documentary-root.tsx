import { Composition } from "remotion";
import { DocumentaryComposition } from "../compositions/documentary/VideoComposition.js";
import type { DocumentaryCompositionProps } from "../compositions/documentary/VideoComposition.js";

export const DOCUMENTARY_COMPOSITION_ID = "DocumentaryComposition" as const;

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;

export type DocumentaryCompositionInputProps = DocumentaryCompositionProps & {
  width?: number;
  height?: number;
  fps?: number;
};

const defaultProps: Required<DocumentaryCompositionInputProps> = {
  timeline: {
    id: "placeholder",
    duration: 1,
    tracks: [],
  },
  assets: {},
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  fps: DEFAULT_FPS,
};

const DocumentaryComponent = (props: Record<string, unknown>) => {
  const input = props as unknown as DocumentaryCompositionInputProps;
  return <DocumentaryComposition {...input} />;
};

export const DocumentaryRoot = () => (
  <Composition
    id={DOCUMENTARY_COMPOSITION_ID}
    component={DocumentaryComponent}
    width={defaultProps.width}
    height={defaultProps.height}
    fps={defaultProps.fps}
    durationInFrames={Math.max(1, Math.round(defaultProps.timeline.duration * defaultProps.fps))}
    defaultProps={defaultProps as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const input = props as unknown as DocumentaryCompositionInputProps;
      const width = input.width ?? DEFAULT_WIDTH;
      const height = input.height ?? DEFAULT_HEIGHT;
      const fps = input.fps ?? DEFAULT_FPS;
      const timelineDuration = input.timeline?.duration ?? 1;
      const durationInFrames = Math.max(1, Math.round(timelineDuration * fps));

      return {
        width,
        height,
        fps,
        durationInFrames,
        props,
      };
    }}
  />
);
