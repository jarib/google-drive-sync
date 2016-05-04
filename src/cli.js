#!/usr/bin/env node

import yargs from 'yargs';
import 'babel-polyfill';
import 'timestring';
import fs from 'fs';
import GoogleDriveClient from './google-drive-client';
import Syncer from './syncer';
import url from 'url';
import daemon from 'daemon';
import debug from 'debug';
import moment from 'moment';
import path from 'path';

const log = debug('google-drive-sync:cli');
const httpLog = debug('google-drive-sync:http');

const argv = yargs
    .usage('Usage: $0 --out-dir [dir] --credentials [file.json] --daemonize [log-path] --interval [timestring] --state [state.json]')
    .option('out-dir', {
      type: 'string',
      describe: 'Ouput directory for JSON files.'
    })
    .option('credentials', {
      type: 'string',
      describe: 'Path to Google API credentials (as JSON)'
    })
    .option('daemonize', {
      type: 'string',
      describe: 'Run as daemon and write output to the given log file.'
    })
    .option('interval', {
      type: 'string',
      describe: 'Polling interval. If not set, run one check then exit (e.g. for cron).'
    })
    .option('state', {
      type: 'string',
      describe: 'Path to a file where we should save state.'
    })
    .option('plugins', {
      type: 'array',
      describe: 'List of plugins to load.'
    })
    .demand(['out-dir', 'credentials'])
    .help('help')
    .argv;

const credentials = JSON.parse(fs.readFileSync(argv.credentials, 'utf-8'))

const syncer = new Syncer({
    client: new GoogleDriveClient({credentials}),
    outputDirectory: argv.outDir,
    state: argv.state
});

syncer.on('error', err => {
    console.error(`${moment().format()}: ${err}\n${err.stack}`)

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
        stdout: out,
        stderr: out
    });
}

if (argv.plugins) {
  const cwd = process.cwd();

  argv.plugins.forEach(pluginPath => {
    const p = require(path.resolve(cwd, pluginPath));
    p(syncer);
  })
}

if (argv.interval) {
    const interval = argv.interval.toString().parseTime();

    if (interval < 5) {
        throw new Error(`interval is less than 5 seconds`);
    }

    function sync() {
        syncer.sync().then(() => setTimeout(sync, interval * 1000))
    };

    sync();
} else {
    syncer.sync();
}
