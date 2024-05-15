import { google } from 'googleapis';
import debug from 'debug';

const log = debug('google-drive-sync:client');

export default class GoogleDriveClient {
    constructor(opts) {
        this.credentials = opts.credentials;
    }

    isAuthorized() {
        return !!this.drive;
    }

    authorize() {
        log('authorizing');

        return google.auth
            .getClient({
                credentials: this.credentials,
                scopes: ['https://www.googleapis.com/auth/drive'],
            })
            .then((client) => {
                this.drive = google.drive({
                    version: 'v3',
                    auth: client,
                });
            });
    }

    getFile(fileId, fields = []) {
        log(`fetching ${fileId}`);

        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.drive.files.get(
                {
                    fileId,
                    fields: fields.length ? fields.join(',') : '*',
                },
                (err, doc) => {
                    err ? reject(err) : resolve(doc.data);
                }
            );
        });
    }

    exportFile(key, mimeType) {
        log(`exporting ${key} as ${mimeType}`);

        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.drive.files.export({ fileId: key, mimeType }, (err, doc) => {
                err ? reject(err) : resolve(doc.data);
            });
        });
    }

    getExportFileStream(key, mimeType) {
        log(`exporting stream ${key} as ${mimeType}`);

        this._assertAuthorized();
        return this.drive.files
            .export(
                { fileId: key, mimeType },
                {
                    responseType: 'stream',
                }
            )
            .then((res) => res.data);
    }

    getUrl(uri) {
        log(`fetching url: ${uri}`);

        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.client.request({ method: 'GET', uri }, (err, body, response) => {
                err ? reject(err) : resolve(response.data);
            });
        });
    }

    getStartPageToken() {
        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.drive.changes.getStartPageToken({}, (err, res) => {
                err ? reject(err) : resolve(res.data);
            });
        });
    }

    getChanges(pageToken, pageSize = 100) {
        log(
            `fetching changes for page token = ${pageToken}, pageSize = ${pageSize}`
        );

        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.drive.changes.list({ pageToken, pageSize }, (err, changes) => {
                err ? reject(err) : resolve(changes.data);
            });
        });
    }

    _assertAuthorized() {
        if (!this.drive) {
            throw new Error(`must authorize() first`);
        }
    }
}
