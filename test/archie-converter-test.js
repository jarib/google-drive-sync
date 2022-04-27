import assert from 'assert';
import fetch from 'node-fetch';
import ArchieConverter from '../src/archie-converter';
import fs from 'fs-extra';

const html = fs.readFileSync(
    `${__dirname}/fixtures/1N-jDmviZUVAW_2Y429Wkr7PIoz6o6kQKVu81C-CoA10.html`,
    'utf-8'
);

describe('ArchieConverter', () => {
    describe('.convert', () => {
        it('should convert a document and preserve styles', () => {
            return ArchieConverter.convert(html, {
                preserve_styles: ['bold', 'italic', 'underline'],
            }).then(({ result }) => {
                assert.equal(result.foo, 'normal key');
                assert.equal(
                    result.baz,
                    'formatted <span class="g-doc-italic">italic</span>'
                );

                assert.equal(result.body[0].value, 'line 1 not bold');
                assert.equal(
                    result.body[1].value,
                    '<span class="g-doc-bold">line 2 bold with non-bold space</span>'
                );
                assert.equal(
                    result.body[2].value,
                    'line 3 entire line bold ignored'
                );
                assert.equal(
                    result.body[3].value,
                    'line 4 with <span class="g-doc-underline">partial underline</span>'
                );
            });
        });

        it('should convert a document with no styles', () => {
            return ArchieConverter.convert(html).then(({ result }) => {
                assert.equal(result.foo, 'normal key');
                assert.equal(result.baz, 'formatted italic');

                assert.equal(result.body[0].value, 'line 1 not bold');
                assert.equal(
                    result.body[1].value,
                    'line 2 bold with non-bold space'
                );
                assert.equal(
                    result.body[2].value,
                    'line 3 entire line bold ignored'
                );
                assert.equal(result.body[3].value, 'line 4 with partial underline');
            });
        });
    });
});
