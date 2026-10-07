import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDocument } from "./document-io";
import { SessionStore } from "./session-store";

const EXAMPLE = join(process.cwd(), "resources", "examples", "dominus-dixit.mocquereau");

describe("bundled example project", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mocq-example-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("opens as a current-schema package with two sources and all images present", async () => {
    const store = await SessionStore.create(dir);
    const doc = await openDocument(EXAMPLE, store);
    expect(doc.format).toBe("package");
    expect(doc.missingImages).toBe(0);
    expect(doc.project.meta.title).toBe("Dominus dixit ad me");
    expect(doc.project.sources.map((s) => s.metadata.siglum)).toEqual(["SG 339", "E 121"]);
    const total = doc.project.text.words.reduce((n, w) => n + w.syllables.length, 0);
    for (const s of doc.project.sources) {
      expect(s.lines).toHaveLength(1);
      expect(s.lines[0].syllableRange).toEqual({ start: 0, end: total - 1 });
      expect(s.lines[0].image.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    }
  });
});
