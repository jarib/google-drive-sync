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
        describe: 'Path to Google API credentials (as JSON)',
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
    // .check(argv => {
    //     if (!argv.outDir && !argv.s3) {
    //         throw new Error('Must provide either --out-dir or --s3-url');
    //     }

    //     return true;
    // })
    .help('help').argv;

const credentials = JSON.parse(fs.readFileSync(argv.credentials, 'utf-8'));

const syncer = new Syncer({
    client: new GoogleDriveClient({ credentials }),
    fs: new FileSystem({ s3: argv.s3 }),
    outputDirectory: argv.outDir,
    state: argv.state,
});

syncer.on('error', err => {
    console.error(`${moment().format()}: ${err}\n${err.stack}`);

    if (err.httpResponse) {
        httpLog(err.httpResponse.statusCode, err.httpResponse.statusMessage);
        httpLog(err.httpResponse.request.href);
        httpLog(err.httpResponse.headers);
        httpLog(err.httpResponse.body);
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

    argv.plugins.forEach(pluginPath => {
        const p = require(path.resolve(cwd, pluginPath));
        p(syncer);
    });
}

if (argv.interval) {
    const interval = ms(argv.interval);

    if (interval < 5000) {
        throw new Error(`interval is less than 5 seconds`);
    }

    function sync() {
        syncer.sync().then(() => setTimeout(sync, interval));
    }

    sync();
} else {
    syncer.sync();
}
