/**
 * Timestamp display for the transcript.
 *
 * Separate from the component so it can be shared and tested without a render,
 * and so the component file exports only a component.
 */

/** `mm:ss`, or `h:mm:ss` once a source runs past an hour. */
export function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
