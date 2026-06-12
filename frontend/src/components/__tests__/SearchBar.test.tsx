import { act, fireEvent, render, screen } from "@testing-library/react";

import SearchBar from "@/components/SearchBar";

describe("SearchBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not call onSearch while typing, only once after the debounce delay", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    const input = screen.getByRole("searchbox", { name: /search notes/i });

    // Simulate fast typing: three keystrokes within the debounce window.
    fireEvent.change(input, { target: { value: "h" } });
    fireEvent.change(input, { target: { value: "he" } });
    fireEvent.change(input, { target: { value: "hello" } });

    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("hello");
  });

  it("does not fire on mount for the initial empty value", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("shows a clear button that resets the input and notifies the parent", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    const input = screen.getByRole("searchbox", { name: /search notes/i });

    fireEvent.change(input, { target: { value: "hello" } });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(input).toHaveValue("");
    expect(onSearch).toHaveBeenLastCalledWith("");
  });
});
