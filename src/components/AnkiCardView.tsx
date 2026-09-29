import { File } from 'expo-file-system';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { ankiMediaDir } from '../anki/importer';
import { useApp } from '../state/AppProvider';

/**
 * Renders a card document. The HTML is written into the media folder and loaded from
 * there, so relative <img src> / [sound:] / @font-face paths find the deck's media.
 */
export function AnkiCardView({ html, cardKey }: { html: string; cardKey: string }) {
  const { colors } = useApp();
  const { uri, dir, file } = useMemo(() => {
    const d = ankiMediaDir();
    const f = new File(d, `__card-${cardKey.replace(/[^a-z0-9-]/gi, '_')}.html`);
    if (f.exists) f.delete();
    f.create();
    f.write(html);
    return { uri: f.uri, dir: d.uri, file: f };
  }, [html, cardKey]);

  useEffect(
    () => () => {
      if (file.exists) file.delete();
    },
    [file],
  );

  return (
    <WebView
      key={uri + html.length}
      source={{ uri }}
      originWhitelist={['*']}
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      allowingReadAccessToURL={dir}
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
