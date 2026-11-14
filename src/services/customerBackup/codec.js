/** تحويل بلا فقد لأنواع Firestore. الحقول الغائبة تبقى غائبة ولا تُستبدل بصفر. */

function isTimestamp(value) {
  return Boolean(
    value
    && typeof value.toDate === 'function'
    && typeof value.seconds === 'number'
    && typeof value.nanoseconds === 'number'
  );
}

function isGeoPoint(value) {
  return Boolean(
    value
    && typeof value.latitude === 'number'
    && typeof value.longitude === 'number'
    && typeof value.isEqual === 'function'
  );
}

function isDocumentReference(value) {
  return Boolean(
    value
    && typeof value.path === 'string'
    && typeof value.id === 'string'
    && value.firestore
    && typeof value.withConverter === 'function'
  );
}

function isBytes(value) {
  return Boolean(
    value
    && typeof value.toBase64 === 'function'
    && typeof value.toUint8Array === 'function'
  );
}

export function encodeFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (isTimestamp(value)) {
    return {
      __firestoreType: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (isGeoPoint(value)) {
    return {
      __firestoreType: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }
  if (isDocumentReference(value)) {
    return { __firestoreType: 'reference', path: value.path };
  }
  if (isBytes(value)) {
    return { __firestoreType: 'bytes', base64: value.toBase64() };
  }
  if (Array.isArray(value)) return value.map((item) => encodeFirestoreValue(item));
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      const encoded = encodeFirestoreValue(value[key]);
      if (encoded !== undefined) out[key] = encoded;
    });
    return out;
  }
  return null;
}

export function encodeCustomerRecord(id, data) {
  return {
    id: String(id),
    data: encodeFirestoreValue(data || {}),
  };
}

/** للمعاينة والمقارنة فقط. لا يُستخدم للكتابة على الإنتاج. */
export function decodeFirestoreValue(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => decodeFirestoreValue(item));
  if (value.__firestoreType === 'timestamp') {
    return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value.__firestoreType === 'geopoint') {
    return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value.__firestoreType === 'reference') {
    return { __firestoreType: 'reference', path: value.path };
  }
  if (value.__firestoreType === 'bytes') {
    return { __firestoreType: 'bytes', base64: value.base64 };
  }
  const out = {};
  Object.keys(value).forEach((key) => {
    out[key] = decodeFirestoreValue(value[key]);
  });
  return out;
}
