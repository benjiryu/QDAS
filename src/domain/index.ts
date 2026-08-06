/**
 * The domain layer. Pure functions over research objects.
 *
 * Nothing here imports React, touches the DOM, reads configuration flags, or
 * knows about focus and announcements. Flag-governed choices are parameters, so
 * the flags stay in src/config/flags.ts and these functions stay testable.
 */

export * from './types';
export * from './source';
export * from './navigation';
export * from './excerpt';
