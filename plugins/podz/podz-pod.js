/**
 * Podz pod operations — re-exports from shared pod-ops.
 * Wraps fetchContainer with AuthManager integration for podz's side-based auth.
 */

import {
  fetchContainer as _fetchContainer,
  copyFile as _copyFile,
  copyFolder as _copyFolder,
  deleteFolder as _deleteFolder,
  withTimeout,
  contentTypeFor,
} from 'sol-components/core/pod-ops.js';

export class PodManager {
  constructor(authManager) {
    this.authManager = authManager;
  }

  isLocalhost(url) {
    return this.authManager.isNoAuth(url);
  }

  // Return a fetch that routes via solFetch when available. solFetch turns
  // a 401/403 into a `sol-auth-needed` round-trip (the per-pod <sol-login>
  // chip handles it) and retries once, so unauthenticated requests to a
  // public-writable target succeed without a pre-flight login, and writes
  // to a private target prompt at the moment the server actually says so.
  _solFetchFor(side) {
    const sf = typeof window !== 'undefined' && window.SolidWebComponents?.solFetch;
    if (sf) return (url, init) => sf(url, { ...init, authTag: side });
    return (url, init) => this.authManager.fetchFor(url, side)(url, init);
  }

  async fetchContainer(url, side) {
    try {
      const fetchFn = this.authManager.fetchFor(url, side);
      return await _fetchContainer(url, fetchFn);
    } catch (error) {
      if (!this.isLocalhost(url)) {
        const status = error?.response?.status || error?.statusCode
          || (error.message.match(/^(\d+)/) ? parseInt(error.message) : null);
        if (status === 401 || status === 403) {
          const authError = new Error(`Authentication required for ${url}`);
          authError.needsAuth = true;
          authError.authUrl = url;
          throw authError;
        }
      }
      throw error;
    }
  }

  async copyFile(sourceUrl, targetContainerUrl, fileName, sourceSide, targetSide) {
    try {
      const sourceFetch = withTimeout(this._solFetchFor(sourceSide), 60000);
      const targetFetch = withTimeout(this._solFetchFor(targetSide), 60000);
      return await _copyFile(sourceUrl, targetContainerUrl, fileName, sourceFetch, targetFetch);
    } catch (error) {
      console.error('[POD] copyFile error:', error);
      return { success: false, needsAuth: false };
    }
  }

  async copyFolder(sourceContainerUrl, targetContainerUrl, folderName, onProgress, sourceSide, targetSide) {
    const targetFetch = this._solFetchFor(targetSide);
    const sourceFetch = this._solFetchFor(sourceSide);
    // pod-ops calls fetchFnForUrl(url) to get a fetch for that specific url
    // — pick source vs target by URL prefix so the right side's session
    // (and auth-needed routing) is used for reads vs writes.
    const fetchFnForUrl = (url) => (url.startsWith(sourceContainerUrl) ? sourceFetch : targetFetch);
    return await _copyFolder(sourceContainerUrl, targetContainerUrl, folderName, fetchFnForUrl, onProgress);
  }

  async deleteResource(url, isContainer, side) {
    try {
      if (isContainer) {
        const fetchFnForUrl = (u) => this.authManager.fetchFor(u, side);
        await _deleteFolder(url, fetchFnForUrl);
      } else {
        const fetchFn = this.authManager.fetchFor(url, side);
        const res = await fetchFn(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 404 && res.status !== 205) {
          throw new Error(`DELETE ${url} → ${res.status}`);
        }
      }
      return { success: true };
    } catch (error) {
      console.error('[POD] deleteResource error:', error);
      return { success: false };
    }
  }
}
