const { ReadableStream } = require('stream/web');
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = ReadableStream;
}
