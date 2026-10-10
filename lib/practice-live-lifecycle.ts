/** Browser permission dialogs may resolve after Exit, unmount, or a new connection. */
export async function currentMicrophoneStream<T extends { getTracks(): Array<{ stop(): void }> }>(pending: Promise<T>, isCurrent: () => boolean): Promise<T | null> {
  const stream = await pending;
  if (isCurrent()) return stream;
  stream.getTracks().forEach(track => track.stop());
  return null;
}
