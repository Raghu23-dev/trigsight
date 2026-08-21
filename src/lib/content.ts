/**
 * Typed access to Velite's build output.
 *
 * Everything reads content through here so a schema change surfaces as one type
 * error rather than several runtime surprises. Drafts are filtered at this
 * boundary, meaning no page or derivation can accidentally publish one.
 */
import {
  notes as allNotes,
  projects as allProjects,
  work as allWork,
} from "../../.velite/index";

export type Work = (typeof allWork)[number];
export type Project = (typeof allProjects)[number];
export type Note = (typeof allNotes)[number];

export const work: Work[] = allWork
  .filter((w) => !w.draft)
  .sort((a, b) => a.order - b.order);

export const notes: Note[] = allNotes
  .filter((n) => !n.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

export const projects: Project[] = allProjects
  .filter((p) => !p.draft)
  .sort((a, b) => a.order - b.order);

export function workBySlug(slug: string): Work | undefined {
  return work.find((w) => w.id === `work/${slug}`);
}

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.id === `projects/${slug}`);
}
