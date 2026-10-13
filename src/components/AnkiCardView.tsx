import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { ankiMediaDir } from '../anki/importer';
import { cardShell, showScript, type CardContent } from '../anki/render';
import { useApp } from '../state/AppProvider';

/**
 * Shows card sides in one WebView that stays loaded for the whole session: the card shell
 * page loads once, then each side is swapped in with JavaScript. (A new WebView per side
 * meant starting a fresh browser for every flip.) The shell lives in the media folder, so
 * relative <img src> / [sound:] / @font-face paths find the deck's media.
 *
 * Imported decks can carry scripts, so the page gets no more file access than it needs:
 * no universal access, and on Android (where file access can't be limited to the media
 * folder) no file-to-file reads either, so a deck can't read the app's database.
 */
export function AnkiCardView({ content }: { content: CardContent }) {
  const { colors } = useApp();
  const web = useRef<WebView>(null);
  const loaded = useRef(false);
  const latest = useRef(content);
  const [shell] = useState(() => {
    const dir = ankiMediaDir();
    const file = new File(dir, '__kaeru-card.html');
    if (file.exists) file.delete();
    file.create();
    file.write(cardShell());
    return { file, uri: file.uri, dir: dir.uri };
  });

  useEffect(() => {
    latest.current = content;
    if (loaded.current) web.current?.injectJavaScript(showScript(content));
  }, [content]);

  useEffect(
    () => () => {
      if (shell.file.exists) shell.file.delete();
    },
    [shell],
  );

  return (
    <WebView
      ref={web}
      source={{ uri: shell.uri }}
      onLoadEnd={() => {
        loaded.current = true;
        web.current?.injectJavaScript(showScript(latest.current));
      }}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={allowLoad}
      allowFileAccess
      allowFileAccessFromFileURLs={Platform.OS === 'ios'}
      allowUniversalAccessFromFileURLs={false}
      allowingReadAccessToURL={shell.dir}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      style={[styles.web, { backgroundColor: colors.background }]}
      containerStyle={{ backgroundColor: colors.background }}
      setSupportMultipleWindows={false}
    />
  );
}

/**
 * Keep the card page in place: web links open in the browser instead of replacing the card.
 * Local pages are allowed (file reads are already limited above), so the shell itself always loads.
 */
function allowLoad(req: ShouldStartLoadRequest): boolean {
  if (!req.isTopFrame) return true; // iframes inside a card (iOS asks about these too)
  if (/^(file|about):/i.test(req.url)) return true;
  if (/^(https?|mailto):/i.test(req.url)) Linking.openURL(req.url).catch(() => undefined);
  return false;
}

const styles = StyleSheet.create({
  web: { flex: 1 },
});
