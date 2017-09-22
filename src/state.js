import fs from 'fs-extra';
import moment from 'moment';

const maxItemsInState = 100;

export default class State {
    constructor(filePath) {
        this.filePath = filePath;
        this.data = {
            pageToken: null,
            docs: {}
        };
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
        this.data = {...this.data, ...stateUpdate};
        const { docs } = this.data;

        const ids = Object.keys(docs);

        if (ids.length > maxItemsInState) {
            ids.filter(id => docs[id].file && docs[id].file.modifiedDate)
                .sort((a, b) => moment(docs[b].file.modifiedDate).valueOf() - moment(docs[a].file.modifiedDate).valueOf())
                .slice(maxItemsInState)
                .forEach(id => delete docs[id])
        }

        return fs.outputJson(this.filePath, this.data).then(() => this);
    }

    read() {
        return fs.readFile(this.filePath, 'utf-8')
            .catch(err => null)
            .then(JSON.parse)
            .then(data => this.data = data || this.data)
            .then(() => this.data);
    }
}