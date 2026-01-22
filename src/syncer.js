import Promise from 'bluebird';
import debug from 'debug';
import EventEmitter from 'events';
import moment from 'moment';
import path from 'path';
import streamBuffers from 'stream-buffers';
import ArchieConverter from './archie-converter';
import SpreadsheetConverter from './spreadsheet-converter';
import State from './state';

const log = debug('google-drive-sync:syncer');

const mimeTypes = [
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.document',
];

export default class Syncer {
    constructor(opts) {
        this.client = opts.client;
        this.fs = opts.fs;
        this.ignoreErrors = (opts.ignoreErrors || [429]).map((e) => +e);
        this.outputDirectories = opts.outputDirectory.split(',');
        this.pageSize = +opts.pageSize || 100;

        if (!opts.state) {
            throw new Error(`must specify "state" option`);
        }

        this.state = new State(this.fs, opts.state);
        this.events = new EventEmitter();

        log('ignoring errors', this.ignoreErrors);
    }

    sync() {
        this.events.emit('sync');

        return Promise.join(
            this.state.read(),
            this.client.authorize(), // TODO: re-use JWT tokens but handle expiry
            () => {
                return this.ensurePageTokenInState().then(this.fetchChanges);
            }
        );
    }

    fetchChanges = () => {
        return this.client
            .getChanges(this.state.getPageToken(), this.pageSize)
            .then(this.handleChanges)
            .then(this.fetchSpecialFiles)
            .then(() => log('fetch completed successfully'))
            .catch((err) => this.events.emit('error', err));
    };

    ensurePageTokenInState() {
        if (this.state.getPageToken()) {
            return Promise.resolve();
        } else {
            return this.client
                .getStartPageToken()
                .then((res) =>
                    this.state.save({ pageToken: res.startPageToken - 1 })
                );
        }
    }

    on(...args) {
        this.events.on(...args);
    }

    handleChanges = (list) => {
        log('found changes', list.changes);

        const changes = list.changes.filter(
            (i) => !i.removed && mimeTypes.indexOf(i.file.mimeType) !== -1
        );

        log(`fetching ${changes.length}`);

        return Promise.map(changes, this.processChange, { concurrency: 3 })
            .then(() =>
                this.state.save({
                    pageToken: list.nextPageToken || list.newStartPageToken,
                    lastCheck: moment().format(),
                })
            )
            .then((state) => this.events.emit('synced', state.data));
    };

    fetchSpecialFiles = () => {
        const ids = process.env.GDRIVE_ALWAYS_FETCH
            ? process.env.GDRIVE_ALWAYS_FETCH.split(',').filter(
                  (e) => e.trim().length
              )
            : [];

        return Promise.map(
            ids,
            (id) => this.client.getFile(id).then(this.downloadFile),
            { concurrency: 1 }
        );
    };

    processChange = (change) => {
        return this.client
            .getFile(change.fileId)
            .then((file) =>
                this.downloadFile(file).then(() =>
                    this.state.setFile(change.fileId, { change, file })
                )
            );
    };

    downloadFile = (file) => {
        let promise = null;

        switch (file.mimeType) {
            case 'application/vnd.google-apps.spreadsheet':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                promise = this.convertSpreadsheet(file).then((data) => [
                    {
                        fileName: `${file.id}.json`,
                        data,
                        mimeType: 'application/json',
                    },
                ]);
                break;
            case 'application/vnd.google-apps.document':
                promise = this.convertDocument(file).then((results) => [
                    {
                        fileName: `${file.id}.json`,
                        data: results.plain,
                        mimeType: 'application/json',
                    },
                    {
                        fileName: `${file.id}.styled.json`,
                        data: results.styled,
                        mimeType: 'application/json',
                    },
                    {
                        fileName: `${file.id}.v5.json`,
                        data: results.plainV5,
                        mimeType: 'application/json',
                    },
                    {
                        fileName: `${file.id}.aml`,
                        data: results.aml,
                        mimeType: 'text/plain',
                    },
                    {
                        fileName: `${file.id}.html`,
                        data: results.html,
                        mimeType: 'text/html',
                    },
                ]);

                break;
            default:
                throw new Error(`unknown mime type: ${file.mimeType}`);
        }

        const modification = this.getModification(file);

        return promise
            .then((results) => {
                return Promise.each(results, ({ fileName, data, mimeType }) =>
                    this.save(fileName, {
                        title: file.name,
                        modification,
                        data,
                        mimeType,
                    })
                );
            })
            .catch((err) => {
                console.error(file.webViewLink, err.message);
                this.events.emit('error', err);

                let isIgnored =
                    err.response && this.ignoreErrors.includes(err.response.status);
                isIgnored = isIgnored || !!err.isArchieMLError;

                const preThrow = err.aml
                    ? this.save(`${file.id}.aml`, { data: err.aml })
                    : Promise.resolve();

                if (isIgnored) {
                    log('error ignored');
                    return preThrow;
                } else {
                    return preThrow.then(() => Promise.reject(err));
                }
            });
    };

    convertSpreadsheet(doc) {
        return new Promise((resolve, reject) => {
            this.client
                .getExportFileStream(
                    doc.id,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                .catch(reject)
                .then((stream) => {
                    const writable = new streamBuffers.WritableStreamBuffer();

                    if (!stream) {
                        return reject(new Error('no stream'));
                    }

                    stream
                        .on('end', () => {
                            log('end stream');
                            const buf = writable.getContents();
                            writable.end();
                            resolve(buf);
                        })
                        .on('error', reject)
                        .pipe(writable);
                });
        }).then((buf) => SpreadsheetConverter.convert(buf.toString('binary')));
    }

    convertDocument(doc) {
        return this.client
            .exportFile(doc.id, 'text/html')
            .then((html) =>
                Promise.props({
                    html,
                    plain: ArchieConverter.convert(html),
                    styled: ArchieConverter.convert(html, {
                        preserve_styles: ['bold', 'italic', 'underline'],
                    }),
                    plainV5: ArchieConverter.convert(html, {
                        useNewVersion: true,
                    }),
                })
            )
            .then(({ plain, styled, plainV5, html }) => ({
                plain: plain.result,
                styled: styled.result,
                plainV5: plainV5.result,
                aml: plain.aml,
                html,
            }));
    }

    getModification(doc) {
        const now = moment();
        const modified = moment(doc.modifiedTime);
        const lag = moment.duration(now.diff(modified));

        const user = doc.lastModifyingUser || doc.sharingUser || {};

        const result = {
            user: {
                name: user.displayName,
                email: user.emailAddress,
            },
            date: modified.format(),
            version: doc.version,
            downloadTime: now.format(),
            downloadLag: {
                ms: lag.valueOf(),
                human: lag.humanize(),
            },
        };

        const previous = this.state.getFile(doc.id);

        if (previous && previous.file && previous.file.version) {
            result.lastUpdate = {
                version: previous.file.version,
                changeTime: previous.change
                    ? moment(previous.change.time).format()
                    : null,
            };

            if (+previous.file.version && +doc.version) {
                result.versionDiff = +doc.version - +previous.file.version;
            }
        }

        return result;
    }

    save(fileName, data) {
        if (data === null) {
            // probably an operational error - don't write the file
            return Promise.resolve();
        }

        const body = fileName.endsWith('.json') ? JSON.stringify(data) : data.data;

        return Promise.map(
            this.outputDirectories,
            (dir) => {
                const filePath = path.join(dir, fileName);

                return this.fs
                    .write(filePath, body, { mimeType: data.mimeType })
                    .then(() => this.events.emit('saved', fileName, data));
            },
            { concurrency: 1 }
        );
    }
}
