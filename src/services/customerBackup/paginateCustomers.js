import { encodeCustomerRecord } from './codec';
import { backupError } from './backupModel';

function appendDocuments(documents, docs, pagesRead) {
  let index = 0;
  while (index < docs.length) {
    const row = docs[index];
    index += 1;
    if (!row || !row.id) {
      throw backupError('backup-incomplete', 'مستند عميل بلا معرّف. أُلغيت النسخة.', {
        pagesRead,
        documentsRead: documents.length,
      });
    }
    documents.push(encodeCustomerRecord(row.id, row.data));
  }
}

/**
 * صفحات متتالية حتى تفرغ المجموعة. أي فشل يُجهض النسخة كاملة.
 * تقدير التكلفة: قراءة لكل مستند ناتج، وقراءة واحدة كحد أدنى للاستعلام الفارغ.
 */
export async function paginateCustomerDocuments({ readPage, pageSize, onProgress }) {
  if (typeof readPage !== 'function') {
    throw backupError('backup-incomplete', 'قارئ الصفحات غير متاح. أُلغيت النسخة.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw backupError('backup-incomplete', 'حجم الصفحة غير صالح. أُلغيت النسخة.');
  }

  const documents = [];
  let cursor = null;
  let pagesRead = 0;
  let estimatedFirestoreReads = 0;
  let previousLastId = null;

  for (;;) {
    let page;
    try {
      page = await readPage({ pageSize, cursor });
    } catch (cause) {
      throw backupError(
        'backup-incomplete',
        `توقفت النسخة لأن الصفحة ${pagesRead + 1} لم تُحمَّل. لم يُنشأ ملف.`,
        { cause, pagesRead, documentsRead: documents.length }
      );
    }

    pagesRead += 1;
    const docs = Array.isArray(page?.docs) ? page.docs : null;
    if (!docs) {
      throw backupError('backup-incomplete', 'استجابة الصفحة غير صالحة. أُلغيت النسخة.', {
        pagesRead,
        documentsRead: documents.length,
      });
    }

    estimatedFirestoreReads += docs.length === 0 ? 1 : docs.length;
    appendDocuments(documents, docs, pagesRead);

    const lastId = page.lastId || (docs.length ? docs[docs.length - 1].id : null);
    if (lastId && lastId === previousLastId) {
      throw backupError('backup-incomplete', 'تعذر التقدم بين الصفحات. أُلغيت النسخة حتى لا تُحفظ بيانات ناقصة.', {
        pagesRead,
        documentsRead: documents.length,
      });
    }
    previousLastId = lastId || previousLastId;

    if (onProgress) onProgress({ pagesRead, documentsRead: documents.length });

    if (docs.length < pageSize) break;
    if (!page.cursor) {
      throw backupError('backup-incomplete', 'الصفحة ممتلئة بلا مؤشر للمتابعة. أُلغيت النسخة.', {
        pagesRead,
        documentsRead: documents.length,
      });
    }
    cursor = page.cursor;
  }

  return { documents, pagesRead, estimatedFirestoreReads };
}
