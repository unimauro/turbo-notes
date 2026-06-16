import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ProfileMenu from "@/components/ProfileMenu";

// Mock the data hook so the component renders without a QueryClient/auth stack.
jest.mock("@/hooks/useMe", () => ({
  useMe: () => ({ data: { id: 7, email: "ada@example.com" } }),
}));

describe("ProfileMenu", () => {
  it("shows the user's initial on the avatar button", () => {
    render(<ProfileMenu onLogout={jest.fn()} />);
    const avatar = screen.getByRole("button", { name: /account menu/i });
    expect(avatar).toHaveTextContent("A");
    expect(avatar).toHaveAttribute("aria-haspopup", "menu");
    expect(avatar).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the dropdown with the email and a Log out item on click", async () => {
    const user = userEvent.setup();
    render(<ProfileMenu onLogout={jest.fn()} />);

    expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /log out/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /account menu/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onLogout and closes the menu when Log out is clicked", async () => {
    const user = userEvent.setup();
    const onLogout = jest.fn();
    render(<ProfileMenu onLogout={onLogout} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /log out/i }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("menuitem", { name: /log out/i }),
    ).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ProfileMenu onLogout={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument();
  });
});
