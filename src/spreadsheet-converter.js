import XLSX from 'xlsx';

export default class SpreadsheetConverter {
    static convert(xlsxBinaryString) {
        const result = {};
        const workbook = XLSX.read(xlsxBinaryString, {type: 'binary'});

        workbook.SheetNames.forEach(sn => {
            result[sn] = this._parseSheet(workbook.Sheets[sn]);
        });

        return Promise.resolve(result);
    }

    static _parseSheet(sheet) {
        if (sheet["!ref"] == null) {
            return [];
        } else {
            const range = XLSX.utils.decode_range(sheet["!ref"]);
            const cols = [];
            const rows = [];

            for (let rowIndex = range.s.r; rowIndex <= range.e.r; ++rowIndex) {
                const rowName = XLSX.utils.encode_row(rowIndex);

                for (let colIndex = range.s.c; colIndex <= range.e.c; ++colIndex) {
                    const colName = XLSX.utils.encode_col(colIndex);

                    const val = sheet[colName + rowName];

                    let formattedValue = val ? XLSX.utils.format_cell(val) : null;

                    if (formattedValue && !formattedValue.toString().trim().length) {
                        formattedValue = null;
                    }

                    if (rowIndex === 0) {
                        cols.push(formattedValue);
                    } else {
                        const row = rows[rowIndex - 1] = rows[rowIndex - 1] || []
                        row.push(formattedValue);
                    }
                }
            }

            const rowObjects = [];

            rows.forEach(row => {
                if (row.every(d => !d)) {
                    return;
                }

                const obj = {};

                cols.forEach((col, i) => {
                    if (col) {
                        obj[col] = row[i];
                    }
                });

                rowObjects.push(obj);
            });

            return rowObjects;
        }
    }
}