/**
 * Perspective WebAssembly Worker Singleton
 *
 * All Perspective tables/views in the app share a single WASM Worker instance
 * to avoid loading the ~3MB WASM binary more than once.
 *
 * Usage:
 *   import { getWorker } from '../utils/perspective-worker';
 *   const worker = await getWorker();
 *   const table = await worker.table(data);
 */
import perspective from '@finos/perspective';

let _worker: any | null = null;

export async function getWorker(): Promise<any> {
    if (!_worker) {
        _worker = await perspective.worker();
    }
    return _worker;
}
