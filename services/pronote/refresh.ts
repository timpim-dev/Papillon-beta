import {
  AccountKind,
  BusyPageError,
  createSessionHandle,
  loginToken,
  PageUnavailableError,
  RefreshInformation,
  SecurityError,
  SessionHandle,
  TokenAuthenticationParams,
  UnreachableError,
} from "@blockshub/pawnote-lts";

import { runAuthRefresh } from "@/services/auth/coordinator";
import { CredentialsMissingError } from "@/services/auth/errors";
import { AuthTracker } from "@/services/auth/types";
import { SecurityChallengeError } from "@/services/errors/SecurityChallengeError";
import { classifyPronoteError } from "@/services/pronote/errors";
import { Auth } from "@/stores/account/types";
import { customFetcher } from "@/utils/pronote/fetcher";

const MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 2000;

type PronoteRefresh = { auth: Auth, session: SessionHandle };

const isSafeToRetry = (e: unknown): boolean =>
  e instanceof UnreachableError ||
  e instanceof BusyPageError ||
  e instanceof PageUnavailableError;

const buildTokenParams = (
  stored: Auth,
  deviceUUID: string,
  includeNavigatorIdentifier = true
): TokenAuthenticationParams => {
  const url = String(
    stored.additionals?.["url"] || stored.additionals?.["instanceURL"] || ""
  );
  const token = String(stored.additionals?.["token"] || stored.accessToken || "");
  const username = String(stored.additionals?.["username"] || "");

  if (!url || !token || !username) {
    throw new CredentialsMissingError(
      "Stored PRONOTE credentials are incomplete, the account has to be linked again."
    );
  }

  const additionals = { ...(stored.additionals ?? {}) };
  if (!includeNavigatorIdentifier) {
    delete additionals["navigatorIdentifier"];
  }

  return {
    ...additionals,
    url,
    token,
    username,
    kind: (stored.additionals?.["kind"] as AccountKind) || AccountKind.STUDENT,
    deviceUUID,
  } as TokenAuthenticationParams;
};

const toAuth = (refresh: RefreshInformation, deviceUUID: string): Auth => ({
  accessToken: refresh.token,
  refreshToken: refresh.token,
  additionals: {
    ...refresh,
    instanceURL: refresh.url,
    deviceUUID,
  },
});

// PRONOTE tokens are single-use: the coordinator makes every caller share one login.
export function refreshPronoteAccount(
  accountId: string,
  credentials: Auth
): Promise<PronoteRefresh> {
  return runAuthRefresh(
    accountId,
    credentials,
    { rotatesCredential: true, classifyError: classifyPronoteError },
    async tracker => {
      let lastError: unknown;
      let includeNavigatorIdentifier = true;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let authenticationSent = false;
        try {
          return await loginWithStoredToken(
            tracker,
            includeNavigatorIdentifier,
            () => {
              authenticationSent = true;
            }
          );
        } catch (e) {
          lastError = e;
          const retryBeforeTokenConsume =
            !authenticationSent && classifyPronoteError(e) === "service_error";
          if (!isSafeToRetry(e) && !retryBeforeTokenConsume) {
            throw e;
          }
          // If Identification failed with a ServerSideError before Authentification ran,
          // dropping the stale navigatorIdentifier starts a clean handshake on retry.
          if (retryBeforeTokenConsume) {
            includeNavigatorIdentifier = false;
          }
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * 4 ** attempt));
          }
        }
      }

      throw lastError;
    }
  );
}

async function loginWithStoredToken(
  tracker: AuthTracker,
  includeNavigatorIdentifier: boolean,
  onAuthSent: () => void
): Promise<PronoteRefresh> {
  const handle = createSessionHandle(customFetcher);
  const stored = tracker.readCredentials();
  const deviceUUID = String(stored.additionals?.["deviceUUID"] || "");
  const loginParams = buildTokenParams(stored, deviceUUID, includeNavigatorIdentifier);

  try {
    const refresh = await loginToken(handle, loginParams, {
      onCredentialSent: () => tracker.credentialSent(stored),
      onAuthenticationSent: () => {
        onAuthSent();
        tracker.awaitingNewCredential();
      },
      // Saved before ParametresUtilisateur: if that request fails, the next
      // login still has a valid token.
      onTokenIssued: information => {
        if (information.token) {
          tracker.credentialReceived(toAuth(information, deviceUUID));
        }
      },
    });

    const auth = toAuth(refresh, deviceUUID);
    tracker.credentialReceived(auth);
    return { auth, session: handle };
  } catch (e) {
    if (e instanceof SecurityError) {
      throw new SecurityChallengeError(e, handle, deviceUUID);
    }
    throw e;
  }
}
