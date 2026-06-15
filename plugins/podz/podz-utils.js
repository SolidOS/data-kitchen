/**
 * Podz utilities — re-exports shared functions from pod-ops,
 * keeps podz-specific helpers (initializeElements).
 */

export {
  MIME_TYPES,
  extOf,
  contentTypeFor,
  withTimeout,
} from 'sol-components/core/pod-ops.js';

export function initializeElements() {
  return {
    leftPod:  document.getElementById('left-pod'),
    rightPod: document.getElementById('right-pod'),
  };
}
