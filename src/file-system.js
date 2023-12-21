import { S3 } from '@aws-sdk/client-s3';
import url from 'url';
import fs from 'fs-extra';
import debug from 'debug';

const log = debug('google-drive-sync:file-system');

export default class FileSystem {
    constructor(opts) {
        if (opts.s3) {
            const s3 = url.parse(opts.s3, true);
            const [accessKeyId, secretAccessKey] = s3.auth.split(':', 2);

            this.bucket = s3.pathname.replace(/^\//, '');

            const s3Opts = {
                endpoint: `${s3.protocol}//${s3.hostname}`,
                bucket: this.bucket,
                httpOptions: {
                    proxy: s3.query['http.proxy'],
                    connectTimeout: s3.query['http.connectTimeout']
                        ? +s3.query['http.connectTimeout']
                        : undefined,
                    timeout: s3.query['http.timeout']
                        ? +s3.query['http.timeout']
                        : undefined,
                },
                apiVersion: s3.query.apiVersion,
                signatureVersion: s3.query.signatureVersion,
            };

            log(s3Opts);

            const logger =
                s3.query.log && s3.query.log !== 'false' ? { log } : undefined;

            this.s3 = new S3({
                ...s3Opts,

                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },

                logger,
            });
        }
    }

    read(filePath, encoding = 'utf8') {
        if (this.s3) {
            return this.s3
                .getObject({ Bucket: this.bucket, Key: filePath })
                .promise();
        } else {
            return fs.readFile(filePath, encoding);
        }
    }

    write(filePath, data, { mimeType = null } = {}) {
        if (this.s3) {
            return this.s3
                .upload(
                    {
                        Bucket: this.bucket,
                        Key: filePath,
                        Body: data,
                        ContentType: mimeType,
                    },
                    { queueSize: 1 }
                )
                .promise();
        } else {
            return fs.outputFile(filePath, data);
        }
    }
}
