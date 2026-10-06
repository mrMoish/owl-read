/** Какие слова показывать по-испански при данном проценте.
 *  order — id кандидатов по убыванию полезности; процент считается от числа подходящих слов. */
export function pickShown(order = [], translations = {}, percent = 0) {
  const n = Math.ceil((order.length * percent) / 100);
  const shown = new Set();
  for (let i = 0; i < n; i++) if (translations[order[i]]) shown.add(order[i]);
  return shown;
}
