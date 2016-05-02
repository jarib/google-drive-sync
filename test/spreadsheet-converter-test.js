import assert from 'assert';
import SpreadsheetConverter from '../src/spreadsheet-converter';
import fs from 'fs-promise';

const xlsx = fs.readFileSync(`${__dirname}/fixtures/17463e-OJc9ojiPp97eZ9YPzYJUj82eYHrjGKceXapeE.xlsx`, 'binary');

describe('SpreadsheetConverter', () => {
    describe('.convert', () => {
        it('should convert a xlsx spreadsheet', () => {
            return SpreadsheetConverter.convert(xlsx)
                .then(result => {
                    assert.deepEqual(Object.keys(result), ['Sheet1']);
                    assert.equal(result.Sheet1.length, 1);

                    const row = result.Sheet1[0];

                    assert.equal(row.col1, '1');
                    assert.equal(row.col2, '2');
                    assert.equal(row.col3, '3');
                })
        });
    });
});
