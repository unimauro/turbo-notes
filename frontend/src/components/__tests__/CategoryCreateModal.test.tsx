import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";

jest.mock("@/services/categories", () => ({ createCategory: jest.fn() }));

import CategoryCreateModal from "@/components/CategoryCreateModal";
import { createCategory } from "@/services/categories";

const mockCreate = createCategory as jest.Mock;

function renderModal(props: Partial<React.ComponentProps<typeof CategoryCreateModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onClose = props.onClose ?? jest.fn();
  const onCreated = props.onCreated ?? jest.fn();
  render(
    <QueryClientProvider client={qc}>
      <CategoryCreateModal onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onClose, onCreated };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("creates a category with the typed name + chosen color and reports it back", async () => {
  const user = userEvent.setup();
  mockCreate.mockResolvedValueOnce({ id: 9, name: "Work", color: "teal" });
  const { onCreated } = renderModal();

  await user.type(screen.getByPlaceholderText("Enter name"), "Work");
  await user.click(screen.getByRole("radio", { name: "teal" }));
  await user.click(screen.getByRole("button", { name: /create category/i }));

  expect(mockCreate).toHaveBeenCalledWith("Work", "teal");
  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith({ id: 9, name: "Work", color: "teal" }),
  );
});

it("blocks a blank name without calling the API", async () => {
  const user = userEvent.setup();
  renderModal();

  await user.click(screen.getByRole("button", { name: /create category/i }));

  expect(mockCreate).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/blank/i);
});

it("surfaces a backend 400 (e.g. duplicate name)", async () => {
  const user = userEvent.setup();
  mockCreate.mockRejectedValueOnce(
    new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 400,
      statusText: "Bad Request",
      headers: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: {} as any,
      data: { name: ["You already have a category with this name."] },
    }),
  );
  renderModal();

  await user.type(screen.getByPlaceholderText("Enter name"), "Work");
  await user.click(screen.getByRole("button", { name: /create category/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/already have a category/i);
});
