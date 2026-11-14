/** سجل جلسة المتصفح فقط. ليس تخزيناً دائماً ولا نسخة سحابية. */

const MAX_REMEMBERED = 8;
const entries = [];

export function resetSessionBackupHistoryForTests() {
  entries.length = 0;
}

export function rememberSessionBackup(entry) {
  entries.unshift({
    ...entry,
    source: 'local-download',
    cloudVerified: false,
  });
  while (entries.length > MAX_REMEMBERED) entries.pop();
  return listSessionBackups();
}

export function listSessionBackups() {
  return entries.map((entry) => ({ ...entry }));
}
