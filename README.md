# google-drive-sync

Share a Google document with this daemon, and it will be converted to JSON, saved to disk and watched for changes.

* Google Sheets are converted using the XLSX export.
* Google Docs are converted using [ArchieML](http://archieml.org)

Inspired by [DriveShaft](http://newsdev.github.io/driveshaft/) and [gudocs](https://github.com/guardian/gudocs).

## Usage

```
$ google-drive-sync \
  --out-path /usr/share/nginx/html/gdrive \
  --credentials ~/.google-credentials.json \
  --daemonize /var/log/gdrive-sync.log \
  --state /var/lib/misc/gdrive-sync.json
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