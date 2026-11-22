import type { Item, Project } from './types';

/** An item's emoji and color, falling back to its project's. */
export function itemLook(item: Item | undefined, project: Project | undefined) {
  return {
    emoji: item?.emoji || project?.emoji || '⏱️',
    color: item?.color || project?.color || '#5b6770',
  };
}

export function itemLabel(item: Item | undefined, project: Project | undefined) {
  if (!item) return 'Deleted item';
  return project ? `${project.name} → ${item.name}` : item.name;
}
