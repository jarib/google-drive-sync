import moment from 'moment';

const maxItemsInState = 100;

const emptyState = () => ({
    pageToken: null,
    docs: {},
});

export default class State {
    constructor(fs, filePath) {
        this.fs = fs;
        this.filePath = filePath;
        this.data = emptyState();
    }

    getPageToken() {
        return this.data.pageToken;
    }

    setPageToken(token) {
        this.data.pageToken = token;
    }

    setFile(fileId, data) {
        this.data.docs[fileId] = data;
    }

    getFile(fileId) {
        return this.data.docs[fileId];
    }

    save(stateUpdate) {
        this.data = { ...this.data, ...stateUpdate };
        const { docs } = this.data;

        const ids = Object.keys(docs);

        if (ids.length > maxItemsInState) {
            ids.filter((id) => docs[id].file && docs[id].file.modifiedDate)
                .sort(
                    (a, b) =>
                        moment(docs[b].file.modifiedDate).valueOf() -
                        moment(docs[a].file.modifiedDate).valueOf()
                )
                .slice(maxItemsInState)
                .forEach((id) => delete docs[id]);
        }

        return this.fs
            .write(this.filePath, JSON.stringify(this.data))
            .then(() => this);
    }

    read() {
        return this.fs
            .read(this.filePath, 'utf-8')
            .then(JSON.parse)
            .catch((err) => null)
            .then((data) => (this.data = data || this.data))
            .then(() => this.data);
    }
}
