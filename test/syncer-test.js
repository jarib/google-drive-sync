import assert from 'assert';
import Syncer from '../src/syncer';

describe('Syncer', () => {
    describe('.fetchChanges', () => {
        it('resolves with the number of documents fetched', () => {
            const client = {
                getChanges: jest.fn(() =>
                    Promise.resolve({
                        changes: [
                            {
                                fileId: 'doc',
                                file: {
                                    mimeType: 'application/vnd.google-apps.document',
                                },
                            },
                            {
                                fileId: 'spreadsheet',
                                file: {
                                    mimeType:
                                        'application/vnd.google-apps.spreadsheet',
                                },
                            },
                            {
                                fileId: 'ignored',
                                file: {
                                    mimeType: 'application/pdf',
                                },
                            },
                        ],
                        newStartPageToken: 'next',
                    })
                ),
            };
            const fs = {
                write: jest.fn(() => Promise.resolve()),
            };
            const syncer = new Syncer({
                client,
                fs,
                ignoreErrors: [],
                outputDirectory: '/tmp',
                pageSize: 100,
                state: '/tmp/state.json',
            });

            syncer.state.setPageToken('previous');
            syncer.processChange = jest.fn(() => Promise.resolve());
            syncer.fetchSpecialFiles = jest.fn(() => Promise.resolve());

            return syncer.fetchChanges().then((documentsFetched) => {
                assert.equal(documentsFetched, 2);
                assert.equal(syncer.processChange.mock.calls.length, 2);
                assert.equal(syncer.fetchSpecialFiles.mock.calls.length, 1);
            });
        });
    });
});
