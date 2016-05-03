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
                    assert.equal(result.Sheet1.length, 3);

                    const row1 = result.Sheet1[0];
                    const row2 = result.Sheet1[1];

                    assert.equal(row1.col1, '1');
                    assert.equal(row1.col2, '2');
                    assert.equal(row1.col3, '3');

                    assert.equal(row2.col1, null);
                    assert.equal(row2.col2, null);
                    assert.equal(row2.col3, null);
                    assert.equal(row2.col4, '5');
                })
        });
    });
});
