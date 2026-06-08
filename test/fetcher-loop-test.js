import assert from 'assert';
import createFetcherLoop from '../src/fetcher-loop';

describe('createFetcherLoop', () => {
    it('starts the next sync without sleeping after two productive iterations', () => {
        const syncResults = [1, 1, 0];
        const delays = [];
        let delayedSync;

        const syncer = {
            sync: jest.fn(() => Promise.resolve(syncResults.shift())),
        };

        const sync = createFetcherLoop(syncer, 5000, {
            delay: (fn, interval) => {
                delays.push(interval);
                delayedSync = fn;
            },
            immediate: (fn) => {
                delays.push(0);
                return fn();
            },
        });

        return sync()
            .then(() => {
                assert.deepEqual(delays, [5000]);
                return delayedSync();
            })
            .then(() => {
                assert.deepEqual(delays, [5000, 0, 5000]);
                assert.equal(syncer.sync.mock.calls.length, 3);
            });
    });

    it('sleeps again after an empty iteration', () => {
        const syncResults = [1, 1, 0, 1];
        const delays = [];
        let delayedSync;

        const syncer = {
            sync: jest.fn(() => Promise.resolve(syncResults.shift())),
        };

        const sync = createFetcherLoop(syncer, 5000, {
            delay: (fn, interval) => {
                delays.push(interval);
                delayedSync = fn;
            },
            immediate: (fn) => {
                delays.push(0);
                return fn();
            },
        });

        return sync()
            .then(() => delayedSync())
            .then(() => {
                assert.deepEqual(delays, [5000, 0, 5000]);
                return delayedSync();
            })
            .then(() => {
                assert.deepEqual(delays, [5000, 0, 5000, 5000]);
                assert.equal(syncer.sync.mock.calls.length, 4);
            });
    });
});
