import { render, screen } from "@testing-library/react";

import EmptyState from "@/components/EmptyState";

describe("EmptyState", () => {
  it("renders the boba illustration and the waiting message", () => {
    render(<EmptyState />);

    expect(
      screen.getByRole("img", { name: /happy cup of bubble tea/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/i'm just here waiting for your charming notes/i),
    ).toBeInTheDocument();
  });

  it("is announced politely as a status region", () => {
    render(<EmptyState />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
