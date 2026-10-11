import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { ankiMediaDir } from '../anki/importer';
import { cardShell, showScript, type CardContent } from '../anki/render';
import { useApp } from '../state/AppProvider';

/**
 * Shows card sides in one WebView that stays loaded for the whole session: the card shell
 * page loads once, then each side is swapped in with JavaScript. (A new WebView per side
 * meant starting a fresh browser for every flip.) The shell lives in the media folder, so
 * relative <img src> / [sound:] / @font-face paths find the deck's media.
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
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      allowingReadAccessToURL={shell.dir}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      style={[styles.web, { backgroundColor: colors.background }]}
      containerStyle={{ backgroundColor: colors.background }}
      setSupportMultipleWindows={false}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1 },
});
