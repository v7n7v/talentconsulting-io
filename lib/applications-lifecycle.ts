export function createApplicationsLifecycleGuard() {
  let mounted = false;
  let generation = 0;
  let ownerId: string | null = null;

  return {
    setup(owner: string | null) {
      mounted = true;
      ownerId = owner;
    },
    cleanup() {
      mounted = false;
      generation += 1;
    },
    begin(owner: string | null) {
      ownerId = owner;
      return ++generation;
    },
    isCurrent(token: number, liveOwner: string | null) {
      return mounted && token === generation && liveOwner === ownerId;
    },
  };
}
