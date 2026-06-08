export default function createFetcherLoop(syncer, interval, opts = {}) {
    const delay = opts.delay || setTimeout;
    const immediate = opts.immediate || ((fn) => fn());
    const onError = opts.onError || ((err) => Promise.reject(err));
    let iterationsWithDocuments = 0;

    function sync() {
        return syncer
            .sync()
            .then((documentsFetched) => {
                if (documentsFetched > 0) {
                    iterationsWithDocuments += 1;
                } else {
                    iterationsWithDocuments = 0;
                }

                if (iterationsWithDocuments >= 2) {
                    return immediate(sync);
                }

                return delay(sync, interval);
            })
            .catch(onError);
    }

    return sync;
}
