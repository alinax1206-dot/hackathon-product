/**
 * Future Audio Guidance integration. This adapter is deliberately inert.
 * @typedef {'modeEntered'|'materialOpened'|'overviewRequested'|'pointSelected'|'playbackChanged'|'errorOccurred'|'contextExited'} GuidanceEvent
 * @typedef {{mode: 'creator'|'user'|null, materialId: string|null, revision: number|null, selectedPointId: string|null, playbackState: string}} GuidanceContext
 */
export function createGuidanceAdapter({ cancelPlayback }) {
  return Object.freeze({
    implemented: false,
    /** @param {GuidanceEvent} event @param {GuidanceContext} context */
    emit(event, context) {
      void event;
      void context;
    },
    cancel() {},
    // Future guidance must call this before speaking and cancel on context exit.
    stopPlayback: cancelPlayback,
  });
}
