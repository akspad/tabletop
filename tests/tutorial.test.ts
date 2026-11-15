import React from "react";
import { describe, expect, it, vi } from "vitest";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

vi.mock("react-native", async () => {
  const web = await vi.importActual<Record<string, unknown>>("react-native-web");
  return {
    ...web,
    Modal: ({ children }: React.PropsWithChildren) => React.createElement("section", null, children),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: React.PropsWithChildren) => React.createElement("main", null, children),
}));

import GameTutorial from "../src/GameTutorial";

describe("standalone game tutorials", () => {
  it("renders nothing when hidden or no game is selected", () => {
    expect(renderToStaticMarkup(React.createElement(GameTutorial, { gameType: "hanabi", visible: false, onClose: vi.fn() }))).toBe("");
    expect(renderToStaticMarkup(React.createElement(GameTutorial, { gameType: null, visible: true, onClose: vi.fn() }))).toBe("");
  });

  it("starts Hanabi with a visible-hand task, locked progress, and collapsed reference", () => {
    const html = renderToStaticMarkup(React.createElement(GameTutorial, { gameType: "hanabi", visible: true, onClose: vi.fn() }));
    expect(html).toContain("Tap your teammate’s face-up card.");
    expect(html).toContain("Your card · hidden");
    expect(html).toContain("Teammate · visible");
    expect(html).not.toContain("Hanabi is cooperative for 2–5 players");
    expect(html).toContain("More rules");
    expect(html).toContain("Practice only · your table is unchanged");
    expect(html).toContain("Step 1 of 5");
    expect(html).toContain("aria-disabled=\"true\"");
    expect(html).toContain("Close");
  });

  it("starts Property Rush with a six-step property placement task instead of paragraphs", () => {
    const html = renderToStaticMarkup(React.createElement(GameTutorial, { gameType: "property", visible: true, onClose: vi.fn() }));
    expect(html).toContain("Place Sky to complete three different-color sets.");
    expect(html).toContain("Sky × 1");
    expect(html).toContain("Place Sky from your hand");
    expect(html).not.toContain("Everyone starts with 5 cards");
    expect(html).toContain("Step 1 of 6");
    expect(html).toContain("aria-disabled=\"true\"");
  });
});
