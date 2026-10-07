// Type-level contract between the renderer model and the shared SessionProject.
// The assertions are checked by `npx tsc --noEmit -p tsconfig.json`; at runtime
// vitest only records that the file loads.
import { describe, it, expectTypeOf } from "vitest";
import type { ManuscriptLine, MocquereauProject, StoredImage } from "./models";
import type { InlineImage, LineOf, SessionProject } from "@shared/project-schema";

describe("renderer model <-> SessionProject", () => {
  it("are mutually assignable", () => {
    expectTypeOf<MocquereauProject>().toExtend<SessionProject>();
    expectTypeOf<SessionProject>().toExtend<MocquereauProject>();
    expectTypeOf<StoredImage>().toEqualTypeOf<InlineImage>();
    expectTypeOf<ManuscriptLine>().toExtend<LineOf<InlineImage>>();
  });
});
