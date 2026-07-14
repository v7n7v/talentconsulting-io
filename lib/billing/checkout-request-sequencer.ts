export function createCheckoutRequestSequencer() {
  let generation = 0;
  return {
    start() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(requestId: number) {
      return requestId === generation;
    },
  };
}
