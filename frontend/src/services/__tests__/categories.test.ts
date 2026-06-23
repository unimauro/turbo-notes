jest.mock("@/services/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from "@/services/api";
import { createCategory, listCategories } from "@/services/categories";

const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listCategories", () => {
  it("GETs /categories/ and returns the array", async () => {
    mockApi.get.mockResolvedValueOnce({
      data: [{ id: 1, name: "School", color: "yellow", note_count: 0 }],
    });

    const result = await listCategories();

    expect(mockApi.get).toHaveBeenCalledWith("/categories/");
    expect(result).toHaveLength(1);
  });
});

describe("createCategory", () => {
  it("POSTs name + color to /categories/ and returns the created category", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 5, name: "Work", color: "teal" } });

    const result = await createCategory("Work", "teal");

    expect(mockApi.post).toHaveBeenCalledWith("/categories/", {
      name: "Work",
      color: "teal",
    });
    expect(result).toEqual({ id: 5, name: "Work", color: "teal" });
  });
});
