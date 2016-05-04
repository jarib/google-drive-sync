import debug from 'debug';
import path from 'path';
import fs from 'fs-promise';
import Promise from 'bluebird';
import ArchieConverter from './archie-converter';
import SpreadsheetConverter from './spreadsheet-converter';
import moment from 'moment';
import EventEmitter from 'events';
import zip from 'lodash.zip';
import streamBuffers from 'stream-buffers';

const log = debug('google-drive-sync:syncer');

const mimeTypes = [
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.document'
];

const maxItemsInState = 100;
const IGNORED_ERRORS = [429];

export default class Syncer {
    constructor(opts) {
        this.client = opts.client;
        this.outputDirectories = opts.outputDirectory.split(',');

        if (!opts.state) {
            throw new Error(`must specify "state" option`)
        }

        this.stateFile = opts.state;
        this.events = new EventEmitter();
    }

    sync() {
        this.events.emit('sync');
        const fetchState = fs.readFile(this.stateFile, 'utf-8').catch(err => null).then(JSON.parse)

        return Promise.join(
            fetchState,
            this.client.authorize(), // TODO: re-use JWT tokens but handle expiry
            (state) => {
                return this.ensurePageTokenIn(state || {pageToken: null, docs: {}})
                    .then(state => this.fetchChanges(state))
        });
    }

    fetchChanges(state) {
        return this.client
            .getChanges(state.pageToken)
            .then(list => this.handleChanges(state, list))
            .then(::this.fetchSpecialFiles)
            .catch(err => this.events.emit('error', err));

    }

    ensurePageTokenIn(state) {
        if (state.pageToken) {
            return Promise.resolve(state);
        } else {
            return this.client
                .getStartPageToken()
                .then(res => this.updateState({...state, pageToken: res.startPageToken}))
        }
    }

    on(...args) {
        this.events.on(...args);
    }

    handleChanges(state, list) {
        const ids = new Set();

        list.changes
            .filter(i => {
                return !i.removed && mimeTypes.indexOf(i.file.mimeType) !== -1
            })
            .forEach(i => {
                state.docs[i.fileId] = i.file;
                ids.add(i.fileId);
            });

        return Promise.map(
            Array.from(ids),
            id => this.client.getFile(id).then(::this.downloadFile),
            {concurrency: 3}
        )
        .then(() => this.updateState({
            ...state,
            pageToken: list.nextPageToken || list.newStartPageToken,
            lastCheck: moment().format()
        }))
        .then(state => this.events.emit('synced', state))
        .then(() => ids);
    }

    fetchSpecialFiles() {
        const ids = process.env.GDRIVE_ALWAYS_FETCH ? process.env.GDRIVE_ALWAYS_FETCH.split(',') : []

        return Promise.map(
            ids,
            id => this.client.getFile(id).then(::this.downloadFile),
            {concurrency: 1}
        )
    }

    updateState(state) {
        const ids = Object.keys(state.docs);

        if (ids.length > maxItemsInState) {
            ids
                .sort((a, b) => moment(state.docs[b].modifiedDate).valueOf() - moment(state.docs[a].modifiedDate).valueOf())
                .slice(maxItemsInState)
                .forEach(id => delete state.docs[id])
        }

        return fs.writeFile(this.stateFile, JSON.stringify(state)).then(() => state);
    }

    downloadFile(file) {
        let promise = null;

        switch (file.mimeType) {
            case 'application/vnd.google-apps.spreadsheet':
                promise = this.convertSpreadsheet(file).then(data => ([{fileName: file.id, data}]));
                break;
            case 'application/vnd.google-apps.document':
                promise = this.convertDocument(file).then(results => ([
                    {fileName: file.id, data: results.plain},
                    {fileName: `${file.id}.styled`, data: results.styled},
                ]))

                break;
            default:
                throw new Error(`unknown mime type: ${file.mimeType}`)

        };

        const modification = this.getModification(file);

        return promise
            .then(results => {
                return Promise.each(
                    results,
                    ({fileName, data}) => this.save(fileName, { modification, data })
                )
            })
            .catch(err => {
                console.error(file.webViewLink, err.message);
                this.events.emit('error', err);

                let isIgnored = err.httpResponse && IGNORED_ERRORS.includes(err.httpResponse.statusCode);
                isIgnored = isIgnored || !!err.isArchieMLError;

                if (isIgnored) {
                    log('error ignored');
                    return null;
                } else {
                    throw err;
                }
            });
    }

    convertSpreadsheet(doc) {
        return new Promise((resolve, reject) => {
            const stream = this.client.getExportFileStream(doc.id, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            const writable = new streamBuffers.WritableStreamBuffer();

            stream
                .on('end', () => {
                    log('end stream');
                    const buf = writable.getContents();
                    writable.end();
                    resolve(buf);
                })
                .on('error', reject)
                .pipe(writable);
        }).then(buf => SpreadsheetConverter.convert(buf.toString('binary')))
    }

    convertDocument(doc) {
        return this.client.exportFile(doc.id, 'text/html')
            .then(html => Promise.props({
                plain: ArchieConverter.convert(html),
                styled: ArchieConverter.convert(html, {preserve_styles: ['bold', 'italic', 'underline']})
            }));
    }

    getModification(doc) {
        return {
            user: {
                name: doc.lastModifyingUser.displayName,
                email: doc.lastModifyingUser.emailAddress
            },
            date: doc.modifiedTime,
            version: doc.version
        };
    }

    save(name, data) {
        const fileName = `${name}.json`;

        if (data === null) {
            // probably an operational error - don't write the file
            return Promise.resolve();
        }

        return Promise.map(this.outputDirectories, dir => {
            const filePath = path.join(dir, fileName);

            return fs
                .writeFile(filePath, JSON.stringify(data))
                .then(() => this.events.emit('saved', fileName, data));
        });
    }

    log(obj) {
        log(JSON.stringify(obj, null, 2));
    }
}