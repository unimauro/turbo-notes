import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CategorySidebar from "@/components/CategorySidebar";
import type { Category } from "@/types/note";

const categories: Category[] = [
  { id: 1, name: "Random Thoughts", color: "coral", note_count: 3 },
  { id: 2, name: "School", color: "yellow", note_count: 1 },
  { id: 3, name: "Personal", color: "teal", note_count: 0 },
];

describe("CategorySidebar", () => {
  it("renders every category name with its note count (hidden when zero)", () => {
    render(
      <CategorySidebar categories={categories} selectedId={null} onSelect={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: /random thoughts 3/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /school 1/i })).toBeInTheDocument();
    // Personal has no notes — name shown, count omitted (matches the prototype).
    expect(screen.getByRole("button", { name: /^personal$/i })).toBeInTheDocument();
  });

  it("selects a category on click and clears it via 'All Categories'", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <CategorySidebar categories={categories} selectedId={null} onSelect={onSelect} />,
    );

    await user.click(screen.getByRole("button", { name: /school 1/i }));
    expect(onSelect).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByRole("button", { name: /all categories/i }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("toggles the active category off when clicked again", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <CategorySidebar categories={categories} selectedId={2} onSelect={onSelect} />,
    );

    const school = screen.getByRole("button", { name: /school 1/i });
    expect(school).toHaveAttribute("aria-pressed", "true");

    await user.click(school);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
