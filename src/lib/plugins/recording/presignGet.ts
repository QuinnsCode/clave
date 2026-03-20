import { AwsClient } from "aws4fetch";

export async function presignGet(
  env: { R2_ACCOUNT_ID: string; R2_ACCESS_KEY_ID: string; R2_SECRET_ACCESS_KEY: string },
  r2Key: string
): Promise<string> {
  const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = env;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("[presignGet] Missing R2 credentials");
  }

  const client   = new AwsClient({ accessKeyId, secretAccessKey });
  const endpoint = new URL(`https://${accountId}.r2.cloudflarestorage.com/qlave-recordings/${r2Key}`);

  const signed = await client.sign(endpoint, {
    method: "GET",
    aws:    { signQuery: true },
  });

  return signed.url;
}