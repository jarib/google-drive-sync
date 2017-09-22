#!/usr/bin/env node

import yargs from 'yargs';
import ArchieConverter from './archie-converter';
import SpreadsheetConverter from './spreadsheet-converter';
import fs from 'fs-extra';

const argv = yargs
    .usage('$0 [options] <file>')
    .option('type', {
        alias: 't',
        describe: 'The type of the given document',
        choices: ['xlsx', 'html', 'archieml'],
        required: true
    })
    .demand(1)
    .help('help').argv;

const [file] = argv._;

const inputPath = file === '-' ? '/dev/stdin' : file;

switch (argv.type) {
    case 'xlsx':
        fs
            .readFile(inputPath, 'binary')
            .then(data => SpreadsheetConverter.convert(data))
            .then(r => printJson(r));
        break;
    case 'html':
        fs
            .readFile(inputPath, 'utf-8')
            .then(data => ArchieConverter.convert(data))
            .then(r => printJson(r.result));
        break;
    case 'archieml':
        fs
            .readFile(inputPath, 'utf-8')
            .then(data => ArchieConverter.convertText(data))
            .then(r => printJson(r.result));
        break;
    default:
        throw new Error('unknown type: ' + JSON.stringify(argv.type));
}

function printJson(data) {
    console.log(JSON.stringify(data, null, 2));
}
