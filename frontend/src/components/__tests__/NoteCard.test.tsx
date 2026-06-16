import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import NoteCard from "@/components/NoteCard";
import type { Note } from "@/types/note";

const note: Note = {
  id: 1,
  title: "Groceries",
  content: "Milk, eggs, bread and a suspicious amount of coffee.",
  category: { id: 2, name: "Personal", color: "teal" },
  created_at: "2026-01-01T10:00:00Z",
  updated_at: new Date().toISOString(), // today
};

describe("NoteCard", () => {
  it("renders the title and content preview", () => {
    render(<NoteCard note={note} onEdit={jest.fn()} onDelete={jest.fn()} />);

    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(
      screen.getByText(/Milk, eggs, bread and a suspicious amount of coffee\./),
    ).toBeInTheDocument();
  });

  it("renders the meta line: relative date + category name", () => {
    render(<NoteCard note={note} onEdit={jest.fn()} onDelete={jest.fn()} />);

    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("shows 'Untitled' when the autosaved draft has no title", () => {
    render(
      <NoteCard
        note={{ ...note, title: "  " }}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("calls onEdit when the card is clicked", async () => {
    const user = userEvent.setup();
    const onEdit = jest.fn();
    render(<NoteCard note={note} onEdit={onEdit} onDelete={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: /edit note: groceries/i }));

    expect(onEdit).toHaveBeenCalledWith(note);
  });

  it("clamps the title to keep cards uniform", () => {
    render(<NoteCard note={note} onEdit={jest.fn()} onDelete={jest.fn()} />);

    expect(screen.getByText("Groceries")).toHaveClass("line-clamp-3");
  });

  it("shows the 'latest' highlight ring + pill only when isLatest", () => {
    const { rerender } = render(
      <NoteCard note={note} onEdit={jest.fn()} onDelete={jest.fn()} />,
    );

    let card = screen.getByRole("button", { name: /edit note: groceries/i });
    expect(card).not.toHaveClass("ring-amber-400/80");
    expect(screen.queryByText("Latest")).not.toBeInTheDocument();

    rerender(
      <NoteCard note={note} onEdit={jest.fn()} onDelete={jest.fn()} isLatest />,
    );

    card = screen.getByRole("button", { name: /edit note: groceries/i });
    expect(card).toHaveClass("ring-2", "ring-amber-400/80", "ring-offset-2");
    expect(screen.getByText("Latest")).toBeInTheDocument();
  });

  it("calls onDelete (not onEdit) when the delete button is clicked", async () => {
    const user = userEvent.setup();
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    render(<NoteCard note={note} onEdit={onEdit} onDelete={onDelete} />);

    await user.click(
      screen.getByRole("button", { name: /delete note: groceries/i }),
    );

    expect(onDelete).toHaveBeenCalledWith(note);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
