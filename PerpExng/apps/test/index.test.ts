// unit tests vs integration tests
// unit test are single component test like orderbook
// integeration test are end to end test of user flow. dont care about the language very generic
import { describe, expect, it } from "bun:test";
import { BACKEND } from "./config";
import axios, { AxiosError } from "axios";
import { password } from "bun";

describe("auth endpoints", () => {
  it("Signup doesn't work if username isn't provided", async () => {
    try {
      const response = await axios.post(`${BACKEND}/api/v1/signup`, {
        password: "123123",
      });

      expect(1).toBe(2);
    } catch (e) {
      if (e instanceof AxiosError) {
        expect(e.response?.status).toBe(411);
      } else {
        expect(1).toBe(2);
      }
    }
  });

  it("Singup does work if username isn't provided", async () => {
    const response = await axios.post(`${BACKEND}/api/v1/signup`, {
      username: "Fahad",
      password: "123123",
    });
    expect(response.data.id).not.toBe(undefined);
  });
});
