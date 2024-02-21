# google-drive-sync

Share a Google document with this daemon, and it will be converted to JSON, saved to disk and watched for changes.

* Google Sheets are converted using the XLSX export.
* Google Docs are converted using [ArchieML](http://archieml.org)

Inspired by [DriveShaft](http://newsdev.github.io/driveshaft/) and [gudocs](https://github.com/guardian/gudocs).

## Installation

```
$ npm install -g google-drive-sync
```

## Usage

With local file system:

```
$ google-drive-sync \
  --out-dir /usr/share/nginx/html/gdrive \
  --credentials ~/.google-credentials.json \
  --daemonize /var/log/gdrive-sync.log \
  --state /var/lib/misc/gdrive-sync.json
```

With S3:

```
$ google-drive-sync \
  --out-dir data/ \
  --credentials ~/.google-credentials.json \
  --daemonize /var/log/gdrive-sync.log \
  --state state.json
  --s3 https://access-key-id:secret-key@s3.amazonaws.com/google-drive-sync?log=true&http.timeout=20000
```

## Ignoring errors from Google Drive

Sometimes Google Drive returns errors that are not fatal, e.g. 429 (rate limit) and 403 (forbidden). You can ignore these errors by passing the `--ignore-errors` option. By default, only 429 errors are ignored

```
$ google-drive-sync --ignore-errors 429 --ignore-errors 403
```

## Plugins

Can e.g. be used to purge HTTP caches.

```
$ cat my-plugin.js

module.exports = function (googleDriveSync) {
  googleDriveSync.on('error', err => console.log('my plugin', err));
  googleDriveSync.on('saved', fileName => console.log('document was saved', fileName));
}

$ google-drive-sync --plugins ./my-plugin.js [...]
```

## Debug logging

```

$ DEBUG=google-drive-sync:* google-drive-sync [...]
```