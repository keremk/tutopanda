import { z } from "zod";

// Timeline component types
export const componentTypes = ["ken_burns", "map_troop_movement"] as const;

// Ken Burns component schema
export const kenBurnsComponentSchema = z.object({
  type: z.literal("ken_burns"),
  id: z.string(),
  name: z.string(),
  duration: z.number(), // in seconds
  startTime: z.number(), // in seconds
  imageUrl: z.string(),
  startScale: z.number().default(1),
  endScale: z.number().default(1.2),
  startX: z.number().default(0),
  startY: z.number().default(0),
  endX: z.number().default(0),
  endY: z.number().default(0),
});

// Map troop movement component schema
export const mapTroopMovementComponentSchema = z.object({
  type: z.literal("map_troop_movement"),
  id: z.string(),
  name: z.string(),
  duration: z.number(), // in seconds
  startTime: z.number(), // in seconds
  mapRegion: z.string(), // "medieval_europe"
  troops: z.array(z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    path: z.array(z.object({
      lat: z.number(),
      lng: z.number(),
      timestamp: z.number(), // relative to component start
    })),
  })),
});

// Union of all component schemas
export const timelineComponentSchema = z.discriminatedUnion("type", [
  kenBurnsComponentSchema,
  mapTroopMovementComponentSchema,
]);

// Timeline schema
export const timelineSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number(), // total duration in seconds
  components: z.array(timelineComponentSchema),
});

// Types
export type TimelineComponent = z.infer<typeof timelineComponentSchema>;
export type KenBurnsComponent = z.infer<typeof kenBurnsComponentSchema>;
export type MapTroopMovementComponent = z.infer<typeof mapTroopMovementComponentSchema>;
export type Timeline = z.infer<typeof timelineSchema>;

// Mock data for demonstration
export const mockTimeline: Timeline = {
  id: "demo-timeline-1",
  name: "Medieval History Demo",
  duration: 15,
  components: [
    {
      type: "ken_burns",
      id: "kb-1",
      name: "Castle Introduction",
      duration: 7,
      startTime: 0,
      imageUrl: "/images/castle.png",
      startScale: 1,
      endScale: 1.3,
      startX: 0,
      startY: 0,
      endX: -50,
      endY: -30,
    },
    {
      type: "map_troop_movement",
      id: "map-1",
      name: "Norman Conquest",
      duration: 8,
      startTime: 7,
      mapRegion: "medieval_europe",
      troops: [
        {
          id: "normans",
          name: "Norman Forces",
          color: "#ff4444",
          path: [
            { lat: 49.2, lng: -0.4, timestamp: 0 }, // Normandy
            { lat: 50.8, lng: 0.1, timestamp: 4 },   // English Channel
            { lat: 51.5, lng: -0.1, timestamp: 8 },  // London
          ],
        },
        {
          id: "saxons",
          name: "Saxon Forces",
          color: "#4444ff",
          path: [
            { lat: 53.8, lng: -1.5, timestamp: 0 }, // York
            { lat: 52.0, lng: -0.8, timestamp: 3 }, // Midlands
            { lat: 50.9, lng: 0.0, timestamp: 6 },  // Hastings
          ],
        },
      ],
    },
  ],
};