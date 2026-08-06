/**
 * The announcement service. Everything a component needs is here.
 *
 * Components import `useAnnouncer` and call it. They do not import the region
 * nodes, and they do not create live regions of their own.
 * See docs/accessibility-contract.md section 2.3.
 */

export { AnnouncerProvider } from './AnnouncerProvider';
export { useAnnouncer } from './announcerContext';
export { announcer, createAnnouncer } from './announcer';
export type { Announcement, Announcer, AssertiveReason, Politeness } from './announcer';
