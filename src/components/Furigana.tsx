import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { clusters, parseFurigana, splitCloze, takeLeadingPunctuation, type RubyToken } from '../content/furigana';
import type { Example } from '../content/types';
import { useApp } from '../state/AppProvider';
import { FONTS } from '../theme/colors';

interface Sizing {
  size: number;
}

function RubyUnits({ tokens, showFurigana, size, color, mutedColor }: { tokens: RubyToken[]; showFurigana: boolean; size: number; color: string; mutedColor: string }) {
  const rubySize = Math.round(size * 0.5);
  const unit = (u: RubyToken, key: number) => (
    <View key={key} style={styles.unit}>
      {showFurigana && (
        <Text style={{ fontSize: rubySize, lineHeight: rubySize + 3, color: mutedColor, fontFamily: FONTS.jpBold }} numberOfLines={1}>
          {u.reading ?? ' '}
        </Text>
      )}
      <Text style={{ fontSize: size, lineHeight: size * 1.35, color, fontFamily: FONTS.jpBold }}>{u.text}</Text>
    </View>
  );
  return (
    <>
      {clusters(tokens).map((c, i) =>
        c.length === 1 ? (
          unit(c[0], i)
        ) : (
          <View key={i} style={styles.cluster}>
            {c.map(unit)}
          </View>
        ),
      )}
    </>
  );
}

/** A Japanese sentence with optional furigana above kanji. */
export const FuriganaText = memo(function FuriganaText({ markup, size = 22, showFurigana }: { markup: string; showFurigana?: boolean } & Partial<Sizing>) {
  const { colors, settings } = useApp();
  const show = showFurigana ?? settings.furigana;
  if (!show) {
    return (
      <Text style={{ fontSize: size, lineHeight: size * 1.45, color: colors.text, fontFamily: FONTS.jpBold }}>
        {parseFurigana(markup)
          .map((t) => t.text)
          .join('')}
      </Text>
    );
  }
  return (
    <View style={styles.row}>
      <RubyUnits tokens={parseFurigana(markup)} showFurigana size={size} color={colors.text} mutedColor={colors.textMuted} />
    </View>
  );
});

/**
 * An example sentence with its grammar (the cloze target) picked out in indigo with a soft underline,
 * for lessons and the grammar page. Falls back to the plain sentence when the target can't be found.
 */
export const ExampleSentence = memo(function ExampleSentence({ example, size = 20 }: { example: Example; size?: number }) {
  const { colors, settings } = useApp();
  const tokens = parseFurigana(example.furigana);
  const split = splitCloze(tokens, example.cloze_target, example.cloze_occurrence ?? 1);
  if (!split) return <FuriganaText markup={example.furigana} size={size} />;
  const show = settings.furigana;
  const underline = `${colors.accentInk}66`;
  if (!show) {
    const text = (list: RubyToken[]) => list.map((t) => t.text).join('');
    return (
      <Text style={{ fontSize: size, lineHeight: size * 1.5, color: colors.text, fontFamily: FONTS.jpBold }}>
        {text(split.before)}
        <Text style={{ color: colors.accentInk, textDecorationLine: 'underline', textDecorationColor: underline }}>{text(split.blank)}</Text>
        {text(split.after)}
      </Text>
    );
  }
  const common = { showFurigana: true, size, mutedColor: colors.textMuted };
  const [lead, rest] = takeLeadingPunctuation(split.after);
  return (
    <View style={styles.row}>
      <RubyUnits tokens={split.before} {...common} color={colors.text} />
      <View style={styles.cluster}>
        <View style={[styles.row, { borderBottomWidth: 2, borderBottomColor: underline }]}>
          <RubyUnits tokens={split.blank} {...common} color={colors.accentInk} />
        </View>
        <RubyUnits tokens={lead} {...common} color={colors.text} />
      </View>
      <RubyUnits tokens={rest} {...common} color={colors.text} />
    </View>
  );
});

export type BlankState = 'empty' | 'correct' | 'wrong' | 'revealed';

/**
 * Cloze sentence. The blank shows a placeholder (or `typed`, the answer as it's being
 * typed), or once answered, the target grammar highlighted as correct / wrong.
 */
export function ClozeSentence({ example, state, size = 24, typed }: { example: Example; state: BlankState; size?: number; typed?: string }) {
  const { colors, settings } = useApp();
  const split = splitCloze(parseFurigana(example.furigana), example.cloze_target, example.cloze_occurrence ?? 1);
  if (!split) return <FuriganaText markup={example.furigana} size={size} />;

  const show = settings.furigana;
  const common = { showFurigana: show, size, mutedColor: colors.textMuted };
  let blank: ReactNode;
  if (state === 'empty') {
    const width = Math.max(2, [...example.cloze_target].length) * size * 0.9;
    blank = (
      <View style={styles.unit}>
        {show && <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.5 + 3 }}> </Text>}
        {typed ? (
          <View style={[styles.blank, { minWidth: width, height: size * 1.35, borderBottomColor: colors.accentInk, paddingHorizontal: 2, alignItems: 'center' }]}>
            <Text style={{ fontSize: size, lineHeight: size * 1.35, color: colors.accentInk, fontFamily: FONTS.jpBold }} numberOfLines={1}>
              {typed}
            </Text>
          </View>
        ) : (
          <View style={[styles.blank, { width, height: size * 1.35, borderBottomColor: colors.accentInk }]} />
        )}
      </View>
    );
  } else {
    const line = state === 'correct' ? colors.correct : state === 'wrong' ? colors.wrong : colors.accent;
    const ink = state === 'correct' ? colors.correctText : state === 'wrong' ? colors.wrongText : colors.accentInk;
    blank = (
      <View style={[styles.row, { borderBottomWidth: 3, borderBottomColor: line, paddingHorizontal: 2, marginHorizontal: 2 }]}>
        <RubyUnits tokens={split.blank} {...common} color={ink} />
      </View>
    );
  }

  // Keep punctuation right after the blank on the same line as the blank.
  const [lead, rest] = takeLeadingPunctuation(split.after);
  return (
    <View style={styles.row} accessibilityLabel={example.japanese.replace(example.cloze_target, '（　）')}>
      <RubyUnits tokens={split.before} {...common} color={colors.text} />
      <View style={styles.cluster}>
        {blank}
        <RubyUnits tokens={lead} {...common} color={colors.text} />
      </View>
      <RubyUnits tokens={rest} {...common} color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  unit: { alignItems: 'center' },
  cluster: { flexDirection: 'row', alignItems: 'flex-end' },
  blank: { borderBottomWidth: 3, marginHorizontal: 4 },
});
