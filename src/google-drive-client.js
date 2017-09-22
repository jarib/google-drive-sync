import google from 'googleapis';
import debug from 'debug';

const log = debug('google-drive-sync:client');

export default class GoogleDriveClient {
    constructor(opts) {
        const { credentials } = opts;

        this.jwt = new google.auth
            .JWT(credentials.client_email, null, credentials.private_key, [
            'https://www.googleapis.com/auth/drive'
        ]);
    }

    isAuthorized() {
        return !!this.drive;
    }

    authorize() {
        log('authorizing');

        return new Promise((resolve, reject) => {
            this.jwt.authorize((err, tokens) => {
                if (err) {
                    reject(err);
                } else {
                    this.drive = google.drive({
                        version: 'v3',
                        auth: this.jwt
                    });

                    resolve(this);
                }
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
                    fields: fields.length ? fields.join(',') : '*'
                },
                (err, doc) => {
                    err ? reject(err) : resolve(doc);
                }
            );
        });
    }

    exportFile(key, mimeType) {
        log(`exporting ${key} as ${mimeType}`);

        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.drive.files.export({ fileId: key, mimeType }, (err, doc) => {
                err ? reject(err) : resolve(doc);
            });
        });
    }

    getExportFileStream(key, mimeType) {
        log(`exporting stream ${key} as ${mimeType}`);

        this._assertAuthorized();
        return this.drive.files.export({ fileId: key, mimeType });
    }

    getUrl(uri) {
        log(`fetching url: ${uri}`);

        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.jwt.request({ method: 'GET', uri }, (err, body, response) => {
                err ? reject(err) : resolve(response);
            });
        });
    }

    getStartPageToken() {
        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.drive.changes.getStartPageToken({}, (err, res) => {
                err ? reject(err) : resolve(res);
            });
        });
    }

    getChanges(pageToken) {
        log(`fetching changes for page token = ${pageToken}`);

        return new Promise((resolve, reject) => {
            this._assertAuthorized();

            this.drive.changes.list({ pageToken }, (err, changes) => {
                err ? reject(err) : resolve(changes);
            });
        });
    }

    _assertAuthorized() {
        if (!this.drive) {
            throw new Error(`must authorize() first`);
        }
    }
}
