import { describe, it, expect, vi, afterEach } from "vitest";

const { sendMock } = vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = "test-account-id";
  process.env.R2_ACCESS_KEY_ID = "test-access-key-id";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-access-key";
  process.env.R2_BUCKET_NAME = "test-bucket";
  return { sendMock: vi.fn() };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { uploadImage } from "@/lib/storage/r2";

afterEach(() => {
  vi.clearAllMocks();
});

describe("uploadImage", () => {
  it("sends a PutObjectCommand with the given key, buffer, and content type", async () => {
    sendMock.mockResolvedValue({});
    const buffer = Buffer.from("fake-image-data");

    await uploadImage("abc123-sm.webp", buffer, "image/webp");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Key: "abc123-sm.webp",
      Body: buffer,
      ContentType: "image/webp",
    });
  });

  it("sends the configured bucket name", async () => {
    sendMock.mockResolvedValue({});
    const buffer = Buffer.from("fake-image-data");

    await uploadImage("abc123-sm.webp", buffer, "image/webp");

    const command = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: "test-bucket",
    });
  });
});
