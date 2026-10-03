import { resolveArchiveFolder } from "./folder";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { get, put } from "@vercel/blob";
import { allowedEmail, ArchiveError, configured, seal, unseal } from "./security";

export const scopes = ["https://graph.microsoft.com/User.Read", "https://graph.microsoft.com/Files.ReadWrite", "offline_access"];
const connectionPath = "archive-system/onedrive-connection.enc";
export const mailScopes = ["https://graph.microsoft.com/Mail.Send"];
interface Connection { accountId: string; email: string; cache: string; mailEnabled?: boolean }
export function msal() {
  if (!configured()) throw new ArchiveError("OneDrive bağlantı ayarları eksik.", 503);
  return new ConfidentialClientApplication({ auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    authority: "https://login.microsoftonline.com/consumers",
  }, system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } } });
}
export async function readConnection(): Promise<Connection | null> {
  const blob = await get(connectionPath, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200) return null;
  return unseal<Connection>(await new Response(blob.stream).text(), "connection");
}
async function saveConnection(connection: Connection) {
  await put(connectionPath, seal(connection, "connection"), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "text/plain", cacheControlMaxAge: 0 });
}
export async function finishConnection(code: string, verifier: string, mail = false) {
  const app = msal();
  const result = await app.acquireTokenByCode({ code, codeVerifier: verifier, redirectUri: process.env.ONEDRIVE_REDIRECT_URI!, scopes: mail ? [...scopes,...mailScopes] : scopes });
  if (!result?.account) throw new ArchiveError("Microsoft hesabı doğrulanamadı.", 403);
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", { headers: { Authorization: `Bearer ${result.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new ArchiveError("Microsoft hesabı doğrulanamadı.", 403);
  const profile = await response.json() as { id: string; mail?: string; userPrincipalName?: string };
  const emails = [result.account.username, profile.mail, profile.userPrincipalName].filter((value): value is string => typeof value === "string").map(value => value.toLowerCase());
  const email = allowedEmail();
  if (!email || !emails.includes(email)) throw new ArchiveError("Bu Microsoft hesabının evrak arşivine erişim izni yok.", 403);
  const accountId = result.account.homeAccountId;
  const existing = await readConnection();
  if (existing && existing.accountId !== accountId) throw new ArchiveError("Arşiv başka bir Microsoft hesabına bağlı. Bağlantı otomatik değiştirilemez.", 409);
  await resolveArchiveFolder(result.accessToken);
  await saveConnection({ accountId, email, cache: app.getTokenCache().serialize(), mailEnabled: mail || existing?.mailEnabled || false });
  return { accountId, email };
}
export async function accessToken(accountId: string, requestedScopes = scopes) {
  const connection = await readConnection();
  if (!connection || connection.accountId !== accountId || connection.email !== allowedEmail()) throw new ArchiveError("OneDrive bağlantısını yeniden kurun.", 401);
  const app = msal();
  app.getTokenCache().deserialize(connection.cache);
  const account = await app.getTokenCache().getAccountByHomeId(accountId);
  if (!account) throw new ArchiveError("OneDrive bağlantısını yeniden kurun.", 401);
  const result = await app.acquireTokenSilent({ account, scopes: requestedScopes });
  if (app.getTokenCache().hasChanged()) await saveConnection({ ...connection, cache: app.getTokenCache().serialize() });
  return result.accessToken;
}
