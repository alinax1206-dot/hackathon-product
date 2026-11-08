import { parseCSV, prepareTable } from "./import-data.js";
import { mapColumns, selectRange } from "./mapping.js";
import { createMaterial } from "./materials.js";

export const CLASSROOM_KEY = "chartaloud.classroom.v1";
export const accounts = [1, 2].flatMap((n) => [
  {
    id: `teacher${n}`,
    name: `Teacher ${n}`,
    role: "creator",
    teacher: `teacher${n}`,
  },
  ...[1, 2, 3].map((s) => ({
    id: `student${n}${s}`,
    name: `Student ${n}.${s}`,
    role: "user",
    teacher: `teacher${n}`,
  })),
]);
export function readClassroom(storage) {
  const raw = storage.getItem(CLASSROOM_KEY);
  return raw ? JSON.parse(raw) : { lessons: [] };
}
export function publishLesson(storage, teacher, material, style) {
  const db = readClassroom(storage);
  const used = new Set(db.lessons.map((l) => l.code));
  let code;
  do {
    code = String(
      100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
    );
  } while (used.has(code));
  const lesson = { teacher, material, style, code };
  db.lessons.push(lesson);
  storage.setItem(CLASSROOM_KEY, JSON.stringify(db));
  return lesson;
}
export function unlockLesson(storage, account, code) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter a six-digit class code.");
  const lesson = readClassroom(storage).lessons.find(
    (l) =>
      l.code === code && (!account?.teacher || l.teacher === account.teacher),
  );
  if (!lesson)
    throw new Error(
      "This code does not belong to your teacher or could not be found. Check the code and try again.",
    );
  return lesson;
}
export async function seedClassroom(storage) {
  for (const n of [1, 2]) {
    if (readClassroom(storage).lessons.some((l) => l.teacher === `teacher${n}`))
      continue;
    const response = await fetch(`/demo/${n === 1 ? "avocado" : "delhi"}.csv`);
    if (!response.ok)
      throw new Error("Could not load the demo CSV. Please retry.");
    const { rows } = prepareTable(parseCSV(await response.text()));
    const avocado = n === 1;
    const title = avocado
      ? "Avocado average price by date"
      : "Delhi daily mean temperature";
    const mapped = mapColumns(rows, {
      x: avocado ? "Date" : "date",
      y: avocado ? "AveragePrice" : "meantemp",
      aggregation: avocado ? "mean" : "none",
      unit: avocado ? "USD" : "°C",
      title,
      sheet: avocado ? "avocado(testing).csv" : "DailyDelhiClimateTest.csv",
    });
    const dataset = selectRange(mapped, 1, Math.min(100, mapped.data.length));
    const material = createMaterial(dataset, {
      title,
      description: `${rows.length.toLocaleString("en-US")} source rows. ${avocado ? "Average price across all records for each date, in source order." : "Daily mean temperature, in source order."} Showing points 1–${dataset.data.length} of ${mapped.data.length}.`,
      learningGoal: avocado
        ? "Compare avocado prices over time and listen for price changes."
        : "Explore temperature changes in Delhi through sound.",
    });
    publishLesson(
      storage,
      `teacher${n}`,
      material,
      avocado ? "acoustic" : "rainy",
    );
  }
}
