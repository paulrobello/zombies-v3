/**
 * Barrel re-export for `src/math/`. Importers can write `import { vec2, clamp,
 * epsilon } from '../math'` rather than the deep path. The deleted
 * `mat2`/`mat3`/`mat4`/`vec3`/`quat` modules (audit QA-005) used to live
 * here too — orthographic projection now goes through twgl.js's `m4` directly.
 */
export * from './constants';
export * from './scalar';
export * from './vec2';
export * from './vec4';
