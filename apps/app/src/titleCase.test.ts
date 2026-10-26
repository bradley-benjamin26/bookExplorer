import { describe, expect, it } from "vitest";
import { titleCase } from "./titleCase";

describe("titleCase", () => {
  it("capitalizes lowercase terms", () => {
    expect(titleCase("science fiction")).toBe("Science Fiction");
  });

  it("normalizes all-caps terms", () => {
    expect(titleCase("SCIENCE FICTION")).toBe("Science Fiction");
  });

  it("keeps small words lowercase except first and last", () => {
    expect(titleCase("history of the united states")).toBe("History of the United States");
    expect(titleCase("the lord of")).toBe("The Lord Of");
  });

  it("capitalizes after hyphens, slashes and LCSH double dashes", () => {
    expect(titleCase("coming-of-age stories")).toBe("Coming-of-Age Stories");
    expect(titleCase("fairy tales--adaptations")).toBe("Fairy Tales--Adaptations");
    expect(titleCase("science fiction/fantasy")).toBe("Science Fiction/Fantasy");
  });

  it("keeps common Spanish and French small words lowercase too", () => {
    expect(titleCase("descubrimiento de oro")).toBe("Descubrimiento de Oro");
    expect(titleCase("critica e interpretación")).toBe("Critica e Interpretación");
  });

  it("does not capitalize after an apostrophe", () => {
    expect(titleCase("children's stories")).toBe("Children's Stories");
  });

  it("leaves words with their own mixed case alone", () => {
    expect(titleCase("World War II and iPhone")).toBe("World War II and iPhone");
  });
});
