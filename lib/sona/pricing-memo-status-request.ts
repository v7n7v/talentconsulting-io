export interface PricingMemoStatusRequestCounter {
  current: number;
}

export function beginPricingMemoStatusRequest(counter: PricingMemoStatusRequestCounter) {
  counter.current += 1;
  return counter.current;
}

export function invalidatePricingMemoStatusRequests(counter: PricingMemoStatusRequestCounter) {
  counter.current += 1;
  return counter.current;
}

export function isLatestPricingMemoStatusRequest(counter: PricingMemoStatusRequestCounter, requestId: number) {
  return requestId === counter.current;
}

export function retainPricingMemoStatusForFingerprint<T extends { evidenceFingerprint: string }>(
  status: T | null,
  evidenceFingerprint: string,
) {
  return status?.evidenceFingerprint === evidenceFingerprint ? status : null;
}
