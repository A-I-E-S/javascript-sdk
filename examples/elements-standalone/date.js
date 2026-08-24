export function tomorrowLocal(reference = new Date()) {
  const noonTomorrow = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1, 12);
  const year = noonTomorrow.getFullYear();
  const month = String(noonTomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(noonTomorrow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
