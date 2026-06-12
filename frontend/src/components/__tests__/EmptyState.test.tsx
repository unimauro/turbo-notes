import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EmptyState from "@/components/EmptyState";

describe("EmptyState", () => {
  it("renders the no-notes variant with a create action", async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();
    render(<EmptyState variant="no-notes" onCreate={onCreate} />);

    expect(screen.getByText("No notes yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create your first note to get started."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new note/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("renders the no-results variant with the search term and no create button", () => {
    render(<EmptyState variant="no-results" searchTerm="quantum" />);

    expect(screen.getByText("No results found")).toBeInTheDocument();
    expect(screen.getByText(/no notes match “quantum”/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
