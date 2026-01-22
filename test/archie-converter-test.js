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

        it('should convert a document using ArchieML 0.5.0 when useNewVersion is true', () => {
            return ArchieConverter.convert(html, { useNewVersion: true }).then(({ result }) => {
                assert.equal(result.foo, 'normal key');
                assert.equal(result.baz, 'formatted italic');
                assert.ok(Array.isArray(result.body), 'body should be an array');
                assert.equal(result.body[0].value, 'line 1 not bold');
            });
        });

        it('should fix missing newlines before ArchieML directives for version 0.5.0', () => {
            // Simulate HTML that produces concatenated directives without newlines
            // This tests the regex fix: aml.replace(/([^\n])(\[[\w\.\+\-]+\]|:\w+)/g, '$1\n$2')
            const htmlWithConcatenatedDirectives = `<html><head></head><body>
                <p>key: value[items]</p>
                <p>name: first</p>
                <p>[]</p>
            </body></html>`;

            return ArchieConverter.convert(htmlWithConcatenatedDirectives, { useNewVersion: true })
                .then(({ result, aml }) => {
                    // The regex fix should have inserted a newline before [items]
                    assert.ok(aml.includes('\n[items]'), 'should have newline before [items]');
                    // With the fix, items should be parsed as an array
                    assert.ok(Array.isArray(result.items), 'items should be an array');
                });
        });

        it('should NOT apply newline fix for version 0.4.2 (legacy behavior)', () => {
            const htmlWithConcatenatedDirectives = `<html><head></head><body>
                <p>key: value[items]</p>
                <p>name: first</p>
                <p>[]</p>
            </body></html>`;

            return ArchieConverter.convert(htmlWithConcatenatedDirectives, { useNewVersion: false })
                .then(({ aml }) => {
                    // Without the fix, the AML should NOT have a newline inserted before [items]
                    assert.ok(!aml.includes('\n[items]'), 'should NOT have newline before [items] in legacy mode');
                });
        });

        it('should fix missing newlines before ArchieML commands like :skip', () => {
            const htmlWithSkipCommand = `<html><head></head><body>
                <p>title: Hello:skip</p>
                <p>This should be skipped</p>
                <p>:endskip</p>
                <p>visible: yes</p>
            </body></html>`;

            return ArchieConverter.convert(htmlWithSkipCommand, { useNewVersion: true })
                .then(({ aml }) => {
                    // The regex fix should have inserted a newline before :skip
                    assert.ok(aml.includes('\n:skip'), 'should have newline before :skip');
                });
        });
    });

    describe('.convertText', () => {
        it('should convert plain ArchieML text using legacy version by default', () => {
            const aml = 'key: value\n[items]\nname: first\n[]';
            return ArchieConverter.convertText(aml).then(({ result }) => {
                assert.equal(result.key, 'value');
                assert.ok(Array.isArray(result.items), 'items should be an array');
            });
        });

        it('should convert plain ArchieML text using version 0.5.0 when useNewVersion is true', () => {
            const aml = 'key: value\n[items]\nname: first\n[]';
            return ArchieConverter.convertText(aml, { useNewVersion: true }).then(({ result }) => {
                assert.equal(result.key, 'value');
                assert.ok(Array.isArray(result.items), 'items should be an array');
            });
        });
    });
});
