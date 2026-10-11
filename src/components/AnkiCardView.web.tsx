import { createElement } from 'react';
import { View } from 'react-native';
import { cardDocument, type CardContent } from '../anki/render';

/** Browser preview only: an iframe (deck media isn't available on the web). */
export function AnkiCardView({ content }: { content: CardContent }) {
  return <View style={{ flex: 1 }}>{createElement('iframe', { srcDoc: cardDocument(content), style: { border: 0, width: '100%', height: '100%' }, title: 'Card' })}</View>;
}
