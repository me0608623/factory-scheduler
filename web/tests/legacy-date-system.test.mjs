import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readImportXlsx } from '../src/excel.js';

// Use actual Excel date cells, rather than fabricated serials, so both workbook
// date systems must describe the same calendar dates after reopening the file.
async function workbookBytes(date1904, dates = ['2024-10-23', '2024-10-25'], textDates = false) {
  const book = new ExcelJS.Workbook();
  book.properties.date1904 = date1904;
  for (const [factory, headerRow, startRow] of [['1廠', 2, 3], ['2廠', 3, 5]]) {
    const sheet = book.addWorksheet(factory);
    sheet.getCell(`B${headerRow}`).value = factory === '1廠' ? '焊接' : '自動4';
    dates.forEach((date, index) => {
      const row = startRow + index * 2;
      sheet.getCell(`A${row}`).value = textDates ? date : new Date(`${date}T00:00:00Z`);
      sheet.getCell(`B${row}`).value = `${factory} 品號${index}*800\n14H`;
      sheet.getCell(`A${row + 1}`).value = '加班';
      sheet.getCell(`B${row + 1}`).value = `${factory} 加班文字${index}`;
    });
  }
  const bytes = await book.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  for (const [factory, startRow] of [['1廠', 3], ['2廠', 5]]) {
    dates.forEach((date, index) => {
      const actual = reopened.getWorksheet(factory).getCell(`A${startRow + index * 2}`).value;
      assert.equal(textDates ? actual : actual.toISOString(), textDates ? date : `${date}T00:00:00.000Z`);
    });
  }
  return bytes;
}

async function importLegacy(bytes) {
  const imported = await readImportXlsx(bytes, '排程1023.xlsx');
  assert.equal(imported.data, null);
  assert.deepEqual(imported.errors, []);
  assert.ok(imported.legacy);
  return imported.legacy;
}

// ExcelJS writes the numeric boolean spelling. Exercise the other legal OOXML
// spellings by changing only workbookPr, leaving its generated cells untouched.
async function withDateSystemAttribute(bytes, value) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('xl/workbook.xml').async('string');
  assert.match(xml, /<workbookPr\b/);
  zip.file('xl/workbook.xml', xml.replace(/<workbookPr\b[^>]*\/>/, tag => {
    const without = tag.replace(/\sdate1904="[^"]*"/, '');
    return value === undefined ? without : without.replace('/>', ` date1904="${value}"/>`);
  }));
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('legacy imports preserve identical calendar days, factory rows and filename selection in both Excel date systems', async () => {
  const normal = await importLegacy(await workbookBytes(false));
  assert.deepEqual(normal.dates, ['2024-10-23', '2024-10-25']);
  assert.equal(normal.selectedDate, '2024-10-23');
  for (const [index, date] of normal.dates.entries()) {
    for (const [factory, startRow] of [['1廠', 3], ['2廠', 5]]) {
      const row = startRow + index * 2;
      const day = normal.days[date];
      assert.deepEqual(day[factory], [
        { cell: `B${row}`, machine: factory === '1廠' ? '焊接' : '自動4', value: `${factory} 品號${index}*800\n14H` },
        { cell: `B${row + 1}`, machine: factory === '1廠' ? '焊接' : '自動4', value: `${factory} 加班文字${index}` },
      ]);
      assert.equal(day.overtime[factory], true);
      assert.deepEqual(day.notes[factory], [{ cell: `A${row + 1}`, value: '加班' }]);
    }
  }
  assert.deepEqual(await importLegacy(await workbookBytes(true)), normal);
});

test('legacy workbookPr supports OOXML true/false and 1/0, with omitted date1904 defaulting to 1900', async () => {
  const expected = await importLegacy(await workbookBytes(false));
  for (const [date1904, values] of [[true, ['1', 'true', ' 1 ', ' true ']], [false, ['0', 'false', ' 0 ', ' false ', undefined]]]) {
    const bytes = await workbookBytes(date1904);
    for (const value of values) {
      assert.deepEqual(await importLegacy(await withDateSystemAttribute(bytes, value)), expected, `date1904=${value}`);
    }
  }
});

test('legacy date systems retain the existing calendar range and reject fractional date serials', async () => {
  for (const serial of [39999, 40000, 80000, 80001]) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
    for (const date1904 of [false, true]) {
      const parsed = await importLegacy(await workbookBytes(date1904, [date]));
      assert.deepEqual(parsed.dates, serial >= 40000 && serial <= 80000 ? [date] : [], `${date}, date1904=${date1904}`);
    }
  }
  for (const date1904 of [false, true]) {
    const book = new ExcelJS.Workbook();
    book.properties.date1904 = date1904;
    book.addWorksheet('1廠').getCell('A3').value = new Date('2024-10-23T12:00:00Z');
    book.addWorksheet('2廠').getCell('A5').value = new Date('2024-10-23T12:00:00Z');
    assert.deepEqual((await importLegacy(await book.xlsx.writeBuffer())).dates, []);
  }
});

test('legacy ISO text dates are not shifted by the workbook date system', async () => {
  const normal = await importLegacy(await workbookBytes(false, undefined, true));
  assert.deepEqual(normal.dates, ['2024-10-23', '2024-10-25']);
  assert.equal(normal.selectedDate, '2024-10-23');
  assert.deepEqual(await importLegacy(await workbookBytes(true, undefined, true)), normal);
});
