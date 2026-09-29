import { createElement } from 'react';
import { View } from 'react-native';

/** Browser preview only: an iframe (deck media isn't available on the web). */
export function AnkiCardView({ html }: { html: string; cardKey: string }) {
  return <View style={{ flex: 1 }}>{createElement('iframe', { srcDoc: html, style: { border: 0, width: '100%', height: '100%' }, title: 'Card' })}</View>;
}
