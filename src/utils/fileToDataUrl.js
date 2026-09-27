const MAX_DATA_URL_CHARS = 900000;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
    reader.readAsDataURL(blob);
  });
}

function compressImageToBlob(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذّر تحميل الصورة'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxSize) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width / height) * maxSize;
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('تعذّر ضغط الصورة'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Compress an image and return a data URL stored in Firestore (no Firebase Storage). */
export async function fileToStoredDataUrl(file) {
  if (!file) return '';

  const attempts = [
    { maxSize: 800, quality: 0.7 },
    { maxSize: 480, quality: 0.55 },
    { maxSize: 320, quality: 0.45 },
  ];

  let dataUrl = '';
  for (const { maxSize, quality } of attempts) {
    const blob = await compressImageToBlob(file, maxSize, quality);
    dataUrl = await blobToDataUrl(blob);
    if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
  }

  throw new Error('الصورة كبيرة جدًا. اختر صورة أوضح وأصغر ثم أعد المحاولة.');
}
