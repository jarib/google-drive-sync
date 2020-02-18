import AWS from 'aws-sdk';
import url from 'url';
import fs from 'fs-extra';

export default class FileSystem {
    constructor(opts) {
        if (opts.s3) {
            const s3 = url.parse(opts.s3, true);
            const [accessKeyId, secretAccessKey] = s3.auth.split(':', 2);

            this.bucket = s3.pathname.replace(/^\//, '');

            this.s3 = new AWS.S3({
                endpoint: `${s3.protocol}//${s3.hostname}`,
                bucket: this.bucket,
                accessKeyId,
                secretAccessKey,
                log: s3.query.log,
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
                .upload({
                    Bucket: this.bucket,
                    Key: filePath,
                    Body: data,
                    ContentType: mimeType,
                })
                .promise();
        } else {
            return fs.outputFile(filePath, data);
        }
    }
}
