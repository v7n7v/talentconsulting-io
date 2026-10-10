import type { ResumeVersion } from './database-suite';

export interface ResumeVersionGroup {
  /** Stable representative, including for a lineage cycle. */
  id: string;
  versions: ResumeVersion[];
}

/** Preserve lineage identity while showing only revisions that match the active library view. */
export function filterResumeVersionGroups(
  groups: readonly ResumeVersionGroup[],
  predicate: (version: ResumeVersion) => boolean,
): ResumeVersionGroup[] {
  return groups.flatMap(group => {
    const matched = group.versions.filter(predicate);
    return matched.length ? [{ id: group.id, versions: matched }] : [];
  });
}

/** Group only by recorded parentVersionId edges. Missing parents remain visible as orphan roots. */
export function groupResumeVersions(versions: readonly ResumeVersion[]): ResumeVersionGroup[] {
  const byId = new Map(versions.map(version => [version.id, version]));
  const parent = new Map(versions.map(version => [version.id, version.id]));
  const size = new Map(versions.map(version => [version.id, 1]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    let current = id;
    while (parent.get(current) && parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) return;
    if ((size.get(rootA) || 1) < (size.get(rootB) || 1)) [rootA, rootB] = [rootB, rootA];
    parent.set(rootB, rootA);
    size.set(rootA, (size.get(rootA) || 1) + (size.get(rootB) || 1));
  };

  for (const version of versions) {
    const parentId = version.metadata?.workspace?.parentVersionId;
    if (typeof parentId === 'string' && byId.has(parentId)) union(version.id, parentId);
  }

  const groups = new Map<string, ResumeVersion[]>();
  for (const version of versions) {
    const id = find(version.id);
    const group = groups.get(id) || [];
    group.push(version);
    groups.set(id, group);
  }
  const timestamp = (version: ResumeVersion) => Date.parse(version.updated_at || version.created_at) || 0;
  return [...groups.values()].map(group => {
    group.sort((a, b) => timestamp(b) - timestamp(a) || a.id.localeCompare(b.id));
    return { id: group[0].id, versions: group };
  }).sort((a, b) => timestamp(b.versions[0]) - timestamp(a.versions[0]) || a.id.localeCompare(b.id));
}
