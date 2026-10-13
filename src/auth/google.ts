import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Google OAuth client IDs (Google Cloud Console → Credentials). Not secret: they ship in the app.
 * The iOS one's reversed form is also the `iosUrlScheme` of the google-signin plugin in app.json.
 * The web one is the client Supabase's Google provider uses; asking for it makes the ID token's
 * audience something Supabase accepts.
 */
const IOS_CLIENT_ID = '547797680841-ulnhb3c7oqafesb9ugutftb34alu3vcq.apps.googleusercontent.com';
const WEB_CLIENT_ID = '547797680841-5ds3v4thrlp7jl1c80jdmmhqrse2r6pu.apps.googleusercontent.com';

/**
 * iOS builds use the native Google sheet; other platforms (and Expo Go, which lacks the
 * native module) keep the web flow through Supabase.
 */
export const nativeGoogleSignIn = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let configured = false;

// Loaded on first use so merely importing this file never touches the native module.
async function load() {
  const lib = await import('@react-native-google-signin/google-signin');
  if (!configured) {
    lib.GoogleSignin.configure({ iosClientId: IOS_CLIENT_ID, webClientId: WEB_CLIENT_ID });
    configured = true;
  }
  return lib;
}

/** Shows Google's account picker. Returns its ID token, or null if the user cancelled. */
export async function getGoogleIdToken(): Promise<string | null> {
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = await load();
  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null; // cancelled
    if (!response.data.idToken) throw new Error('Google did not return an ID token.');
    return response.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return null;
    throw e;
  }
}

/** Forget the Google account on this phone so the next sign-in shows the picker again. */
export async function signOutOfGoogle(): Promise<void> {
  if (!nativeGoogleSignIn) return;
  const { GoogleSignin } = await load();
  await GoogleSignin.signOut().catch(() => undefined);
}
