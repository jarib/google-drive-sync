#!/usr/bin/env node

import yargs from 'yargs';
import fs from 'fs';
import ms from 'ms';
import GoogleDriveClient from './google-drive-client';
import FileSystem from './file-system';
import Syncer from './syncer';
import daemon from 'daemon';
import debug from 'debug';
import moment from 'moment';
import path from 'path';
import util from 'util';

const log = debug('google-drive-sync:cli');
const httpLog = debug('google-drive-sync:http');

const argv = yargs
    .usage(
        'Usage: $0 --out-dir [dir] --credentials [file.json] --daemonize [log-path] --interval [timestring] --state [state.json]'
    )
    .option('out-dir', {
        type: 'string',
        describe: 'Ouput directory for JSON files.',
    })
    .option('credentials', {
        type: 'string',
        describe:
            'Path to Google API credentials (as JSON), or the actual credentials as JSON',
    })
    .option('s3', {
        type: 'string',
        describe:
            'S3 URL, e.g. https://access-key-id:secret-access-key@s3.amazonaws.com/google-drive-sync',
    })
    .option('daemonize', {
        type: 'string',
        describe: 'Run as daemon and write output to the given log file.',
    })
    .option('interval', {
        type: 'string',
        describe:
            'Polling interval (e.g. "15s"). If not set, run one check then exit (e.g. for cron).',
    })
    .option('state', {
        type: 'string',
        describe: 'Path to a file where we should save state.',
    })
    .option('plugins', {
        type: 'array',
        describe: 'List of plugins to load.',
    })
    .demand(['out-dir', 'credentials'])
    .help('help').argv;

const isJson = (str) => {
    try {
        JSON.parse(str);
        return true;
    } catch (error) {
        log(error);
        return false;
    }
};

let credentials;

if (fs.existsSync(argv.credentials)) {
    credentials = JSON.parse(fs.readFileSync(argv.credentials, 'utf-8'));
} else if (isJson(argv.credentials)) {
    credentials = JSON.parse(argv.credentials);
} else {
    throw new Error('invalid --credentials, must be JSON or path to JSON file');
}

const syncer = new Syncer({
    client: new GoogleDriveClient({ credentials }),
    fs: new FileSystem({ s3: argv.s3 }),
    outputDirectory: argv.outDir,
    state: argv.state,
});

syncer.on('error', (err) => {
    console.error(`${moment().format()}: ${err}\n${err.stack}`);

    if (err.response) {
        httpLog(err.response.status, err.response.statusText);
        httpLog(err.response.request.responseURL);
        httpLog(err.response.headers);
        httpLog(err.response.body);
    }
});

if (argv.daemonize) {
    const out = fs.openSync(argv.daemonize, 'w');

    daemon({
        cwd: process.cwd(),
        stdout: out,
        stderr: out,
    });
}

if (argv.plugins) {
    const cwd = process.cwd();

    argv.plugins.forEach((pluginPath) => {
        const p = require(path.resolve(cwd, pluginPath));
        p(syncer);
    });
}

const fatalError = (err) => {
    console.error(err);
    process.exit(1);
};

if (argv.interval) {
    const interval = ms(argv.interval);

    if (interval < 5000) {
        throw new Error(`interval is less than 5 seconds`);
    }

    function sync() {
        syncer
            .sync()
            .then(() => setTimeout(sync, interval))
            .catch(fatalError);
    }

    sync();
} else {
    syncer.sync().catch(fatalError);
}
