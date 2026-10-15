const base64Url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const randomVerifier = (size = 64) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
};

export const codeChallenge = async (verifier) =>
  base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));

export const redirectUri = () => `${location.origin}${location.pathname}`;

export const beginPkce = async ({ authorizeUrl, clientId, scopes, storageKey, extra = {} }) => {
  if (!clientId) throw new Error("Client ID non configuré");
  const verifier = randomVerifier();
  const state = randomVerifier(24);
  sessionStorage.setItem(`${storageKey}:verifier`, verifier);
  sessionStorage.setItem(`${storageKey}:state`, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: await codeChallenge(verifier),
    state,
    ...extra
  });

  location.assign(`${authorizeUrl}?${params.toString()}`);
};

export const consumePkceCallback = async ({ tokenUrl, clientId, storageKey, extra = {} }) => {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) throw new Error(url.searchParams.get("error_description") ?? error);
  if (!code) return null;

  const verifier = sessionStorage.getItem(`${storageKey}:verifier`);
  const expectedState = sessionStorage.getItem(`${storageKey}:state`);
  if (!verifier || !expectedState || returnedState !== expectedState) throw new Error("État OAuth invalide");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    ...extra
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description ?? data.error ?? "Échec OAuth");

  sessionStorage.removeItem(`${storageKey}:verifier`);
  sessionStorage.removeItem(`${storageKey}:state`);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("session_state");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return data;
};
