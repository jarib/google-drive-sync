import XLSX from 'xlsx';

export default class SpreadsheetConverter {
    static convert(xlsxBinaryString) {
        const result = {};
        const workbook = XLSX.read(xlsxBinaryString, {type: 'binary'});

        workbook.SheetNames.forEach(sn => {
            const sheet = workbook.Sheets[sn];
            const rows = XLSX.utils.sheet_to_json(sheet);

            // clean up
            rows.forEach(r => {
                delete r.undefined;
            });

            const cols = Object.keys(rows[0]);
            result[sn] = rows.filter(r => Object.keys(r).length == cols.length);
        });

        return Promise.resolve(result);
    }
}