/**
 * Unit tests for useAiAssist in isolation — the point of extracting it from
 * NoteEditor. The assist service is mocked; we assert the availability probe,
 * the latestRef + scheduleSave write path, and the error handling.
 */
import { act, renderHook, waitFor } from "@testing-library/react";

jest.mock("@/services/assist", () => ({
  getAssistEnabled: jest.fn(),
  assist: jest.fn(),
}));

import { useAiAssist } from "@/hooks/useAiAssist";
import { assist, getAssistEnabled } from "@/services/assist";
import type { CategoryRef } from "@/types/note";

const getAssistEnabledMock = getAssistEnabled as jest.Mock;
const assistMock = assist as jest.Mock;

const category: CategoryRef = { id: 1, name: "Random Thoughts", color: "coral" };

function setup(content = "some body text") {
  const latestRef = { current: { title: "", content, category } };
  const scheduleSave = jest.fn();
  const setTitle = jest.fn();
  const setContent = jest.fn();
  // Mirror NoteEditor's noteText exactly (note the trailing .trim(), which is
  // what makes a whitespace-only body read as empty to the assist guards).
  const noteText = jest.fn(() =>
    [latestRef.current.title, content].filter(Boolean).join("\n").trim(),
  );

  const utils = renderHook(() =>
    useAiAssist({ content, noteText, latestRef, scheduleSave, setTitle, setContent }),
  );
  return { ...utils, latestRef, scheduleSave, setTitle, setContent, noteText };
}

beforeEach(() => {
  jest.clearAllMocks();
  getAssistEnabledMock.mockResolvedValue(false);
});

describe("useAiAssist availability", () => {
  it("flips enabled to true when the backend reports a key", async () => {
    getAssistEnabledMock.mockResolvedValue(true);
    const { result } = setup();
    expect(result.current.enabled).toBe(false); // before the probe resolves
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it("stays disabled when the probe rejects", async () => {
    getAssistEnabledMock.mockRejectedValue(new Error("offline"));
    const { result } = setup();
    await waitFor(() => expect(getAssistEnabledMock).toHaveBeenCalled());
    expect(result.current.enabled).toBe(false);
  });

  it("reports hasText from the content", () => {
    expect(setup("  ").result.current.hasText).toBe(false);
    expect(setup("real").result.current.hasText).toBe(true);
  });
});

describe("useAiAssist suggestTitle", () => {
  it("sets the title and autosaves via latestRef + scheduleSave", async () => {
    assistMock.mockResolvedValue("A Crisp Title");
    const { result, setTitle, scheduleSave } = setup();

    await act(async () => {
      result.current.suggestTitle();
    });

    expect(assistMock).toHaveBeenCalledWith(expect.any(String), "title");
    expect(setTitle).toHaveBeenCalledWith("A Crisp Title");
    expect(scheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "A Crisp Title", category }),
    );
  });

  it("surfaces an error when assist rejects", async () => {
    assistMock.mockRejectedValue(new Error("boom"));
    const { result } = setup();

    await act(async () => {
      result.current.suggestTitle();
    });

    await waitFor(() => expect(result.current.error).toMatch(/couldn't suggest/i));
  });

  it("does nothing when there is no text", async () => {
    const { result, setTitle } = setup("   ");
    await act(async () => {
      result.current.suggestTitle();
    });
    expect(assistMock).not.toHaveBeenCalled();
    expect(setTitle).not.toHaveBeenCalled();
  });
});

describe("useAiAssist summarize + insert", () => {
  it("stores the summary, then insertSummary prepends it and clears it", async () => {
    assistMock.mockResolvedValue("the gist");
    const { result, setContent, scheduleSave, latestRef } = setup("body to summarize");

    await act(async () => {
      result.current.summarize();
    });
    await waitFor(() => expect(result.current.summary).toBe("the gist"));

    act(() => {
      result.current.insertSummary();
    });

    expect(setContent).toHaveBeenCalledWith(
      `Summary: the gist\n\n${latestRef.current.content}`,
    );
    expect(scheduleSave).toHaveBeenCalled();
    expect(result.current.summary).toBeNull();
  });

  it("dismissSummary clears the summary without touching content", async () => {
    assistMock.mockResolvedValue("the gist");
    const { result, setContent } = setup();

    await act(async () => {
      result.current.summarize();
    });
    await waitFor(() => expect(result.current.summary).toBe("the gist"));

    act(() => {
      result.current.dismissSummary();
    });
    expect(result.current.summary).toBeNull();
    expect(setContent).not.toHaveBeenCalled();
  });
});
