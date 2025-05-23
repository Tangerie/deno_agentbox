type ResolveOrReject = (...args : unknown[]) => void;
type AsyncQueueItem<T = unknown> = [() => T | Promise<T>, ResolveOrReject, ResolveOrReject];

export class AsyncQueue {
    private maxConcurrent : number;
    private numRunning = 0;
    private queue : AsyncQueueItem[] = [];

    constructor(maxConcurrent : number) {
        this.maxConcurrent = maxConcurrent;
    }

    private async tryNext() {
        if(this.queue.length === 0) return;
        if(this.numRunning >= this.maxConcurrent) return;
        const [func, resolve, reject] = this.queue.shift()!;
        this.numRunning++;
        try {
            const res = await func();
            resolve(res);
        } catch(err) {
            reject(err);
        } finally {
            this.numRunning--;
            await this.tryNext();
        }
    }
}