import { formatCardDate, formatEditorTimestamp } from "@/lib/time";

describe("formatCardDate", () => {
  const now = new Date("2026-07-18T15:00:00");

  it("returns 'today' for the same calendar day", () => {
    expect(formatCardDate("2026-07-18T01:05:00", now)).toBe("today");
  });

  it("returns 'yesterday' for the previous calendar day", () => {
    expect(formatCardDate("2026-07-17T23:59:00", now)).toBe("yesterday");
  });

  it("returns 'Month D' for older dates in the current year", () => {
    expect(formatCardDate("2026-07-16T10:00:00", now)).toBe("July 16");
    expect(formatCardDate("2026-01-03T10:00:00", now)).toBe("January 3");
  });

  it("appends the year for dates outside the current year", () => {
    expect(formatCardDate("2024-12-30T10:00:00", now)).toBe("December 30, 2024");
  });

  it("handles year boundaries: Dec 31 vs Jan 1 is 'yesterday'", () => {
    const jan1 = new Date("2026-01-01T08:00:00");
    expect(formatCardDate("2025-12-31T20:00:00", jan1)).toBe("yesterday");
  });

  it("returns an empty string for invalid dates", () => {
    expect(formatCardDate("not-a-date", now)).toBe("");
  });
});

describe("formatEditorTimestamp", () => {
  it("formats an evening time as 'July 21, 2024 at 8:39pm'", () => {
    expect(formatEditorTimestamp("2024-07-21T20:39:00")).toBe(
      "July 21, 2024 at 8:39pm",
    );
  });

  it("formats morning times with am and a padded minute", () => {
    expect(formatEditorTimestamp("2026-02-03T09:05:00")).toBe(
      "February 3, 2026 at 9:05am",
    );
  });

  it("uses 12 for midnight and noon", () => {
    expect(formatEditorTimestamp("2026-02-03T00:10:00")).toBe(
      "February 3, 2026 at 12:10am",
    );
    expect(formatEditorTimestamp("2026-02-03T12:10:00")).toBe(
      "February 3, 2026 at 12:10pm",
    );
  });

  it("returns an empty string for invalid dates", () => {
    expect(formatEditorTimestamp("nope")).toBe("");
  });
});
