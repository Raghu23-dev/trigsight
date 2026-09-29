/**
 * Typed access to Velite's build output.
 *
 * Everything reads content through here so a schema change surfaces as one type
 * error rather than several runtime surprises. Drafts are filtered at this
 * boundary, meaning no page or derivation can accidentally publish one.
 */
import {
  footer as allFooter,
  nav as allNav,
  notes as allNotes,
  pages as allPages,
  projects as allProjects,
  skills as allSkillGroups,
  work as allWork,
} from "../../.velite/index";

export type Work = (typeof allWork)[number];
export type Project = (typeof allProjects)[number];
export type Note = (typeof allNotes)[number];
export type Page = (typeof allPages)[number];
export type SkillGroup = (typeof allSkillGroups)[number];

export const work: Work[] = allWork
  .filter((w) => !w.draft)
  .sort((a, b) => a.order - b.order);

export const notes: Note[] = allNotes
  .filter((n) => !n.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

export const projects: Project[] = allProjects
  .filter((p) => !p.draft)
  .sort((a, b) => a.order - b.order);

export const pages: Page[] = allPages.filter((p) => !p.draft);

export const skills: SkillGroup[] = allSkillGroups
  .filter((s) => !s.draft)
  .sort((a, b) => a.order - b.order);

// Singletons: exactly one document per collection, unwrapped for ergonomic access.
// `allNav`/`allFooter` are arrays because every Velite collection is, but there is
// never more than one nav.mdx or footer.mdx.
export const nav = allNav[0]!;
export const footer = allFooter[0]!;

export function workBySlug(slug: string): Work | undefined {
  return work.find((w) => w.id === `work/${slug}`);
}

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.id === `projects/${slug}`);
}

export function pageBySlug(slug: string): Page | undefined {
  return pages.find((p) => p.id === slug);
}

export interface ChatDocument {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly raw: string;
}

/**
 * Every collection whose documents are chat-indexable: array-shaped, with
 * `{ id, title, path, raw }`. Built from the already-filtered exports above —
 * drafts are excluded once, at the point each export is defined, rather than
 * re-filtered here. `nav`/`footer` are singletons with a different shape
 * entirely and are never part of this map — there is nothing to exclude, they
 * were never eligible. A new prose collection becomes chat-indexed the moment
 * it is added here; nothing in `route.ts` needs to change.
 */
const CHAT_COLLECTIONS = { work, projects, notes, pages, skills };

export function allChatDocuments(): ChatDocument[] {
  return Object.values(CHAT_COLLECTIONS).flatMap((docs) =>
    // Safe as long as every CHAT_COLLECTIONS entry is an array of objects
    // shaped like { id, title, path, raw } — true today for all five; a
    // future addition with a different shape would need this cast revisited.
    (docs as ReadonlyArray<{ id: string; title: string; path: string; raw: string }>).map(
      (d) => ({ id: d.id, title: d.title, path: d.path, raw: d.raw }),
    ),
  );
}
