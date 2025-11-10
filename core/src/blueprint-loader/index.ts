/**
 * Blueprint loader module for flattening blueprints with sub-blueprint support.
 */

export { flattenBlueprint, refKey } from './flattener.js';
export type { FlattenedBlueprint } from './flattener.js';

export {
  parseNodeRefString,
  prefixNodeRef,
  resolveEdgeRef,
  resolveEdges,
} from './resolver.js';
export type { ParsedNodeRef } from './resolver.js';
