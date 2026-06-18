import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AuthScreen from "@/components/AuthScreen";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const login = jest.fn();
jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ ready: true, isAuthenticated: false, login }),
}));

// ThemeToggle pulls from a theme context we don't need here.
jest.mock("@/components/ThemeToggle", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/services/auth", () => ({
  register: jest.fn(),
  obtainToken: jest.fn(),
  resetPassword: jest.fn(),
}));

import { resetPassword } from "@/services/auth";

const mockReset = resetPassword as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuthScreen — reset mode", () => {
  it("submits email + new password to resetPassword and shows confirmation", async () => {
    const user = userEvent.setup();
    mockReset.mockResolvedValueOnce(undefined);

    render(<AuthScreen mode="reset" />);
    expect(screen.getByRole("heading", { name: /let's reset that/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/email/i), "ada@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "fresh-horse-7");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(mockReset).toHaveBeenCalledWith("ada@example.com", "fresh-horse-7");
    // Form is swapped for a neutral confirmation with a path to login.
    expect(await screen.findByText(/all set/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to login/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("surfaces an error and stays on the form when the reset call fails", async () => {
    const user = userEvent.setup();
    mockReset.mockRejectedValueOnce(new Error("boom"));

    render(<AuthScreen mode="reset" />);
    await user.type(screen.getByPlaceholderText(/email/i), "ada@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "fresh-horse-7");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/all set/i)).not.toBeInTheDocument();
  });
});

describe("AuthScreen — login mode", () => {
  it("offers a Forgot-password link to /reset", () => {
    render(<AuthScreen mode="login" />);
    expect(
      screen.getByRole("link", { name: /forgot your password/i }),
    ).toHaveAttribute("href", "/reset");
  });
});
