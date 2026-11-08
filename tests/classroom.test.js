import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  accounts,
  seedClassroom,
  readClassroom,
  unlockLesson,
  publishLesson,
} from "../src/classroom.js";

test("real CSV classrooms, unique codes, teacher isolation, persistence and republishing", async () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    text: () => readFile(new URL("../public" + url, import.meta.url), "utf8"),
  });
  try {
    await seedClassroom(storage);
    await seedClassroom(storage);
    const { lessons } = readClassroom(storage);
    assert.equal(accounts.length, 8);
    assert.equal(lessons.length, 2);
    assert.notEqual(lessons[0].code, lessons[1].code);
    assert.equal(lessons[0].material.dataset.importedRows, 18249);
    assert.equal(lessons[1].material.dataset.importedRows, 114);
    assert.equal(lessons[1].material.dataset.data[0].value, 15.91304347826087);
    for (const account of accounts.filter((a) => a.role === "user")) {
      const own = lessons.find((l) => l.teacher === account.teacher);
      const other = lessons.find((l) => l.teacher !== account.teacher);
      assert.equal(
        unlockLesson(storage, account, own.code).material.id,
        own.material.id,
      );
      assert.throws(
        () => unlockLesson(storage, account, other.code),
        /does not belong/,
      );
      assert.throws(() => unlockLesson(storage, account, "123"), /six-digit/);
    }
    const next = publishLesson(
      storage,
      "teacher1",
      lessons[0].material,
      "jazz",
    );
    assert.ok(lessons.every((l) => l.code !== next.code));
    assert.equal(unlockLesson(storage, accounts[1], next.code).style, "jazz");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
