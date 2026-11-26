import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { spacing } from '../theme/colors';
import { T } from './ui';

/** Date + time picker (or date only): iOS shows the compact native control; Android opens the date then time dialogs. */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  maximumDate,
}: {
  label: string;
  value: number;
  onChange: (t: number) => void;
  mode?: 'datetime' | 'date';
  maximumDate?: number;
}) {
  const max = maximumDate === undefined ? undefined : new Date(maximumDate);
  const { colors, isDark } = useApp();

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.row}>
        <T variant="body" style={styles.label}>
          {label}
        </T>
        <DateTimePicker
          value={new Date(value)}
          mode={mode}
          maximumDate={max}
          display="compact"
          themeVariant={isDark ? 'dark' : 'light'}
          onChange={(_e, d) => d && onChange(d.getTime())}
        />
      </View>
    );
  }

  const openAndroid = () =>
    DateTimePickerAndroid.open({
      value: new Date(value),
      mode: 'date',
      maximumDate: max,
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        if (mode === 'date') return onChange(date.getTime());
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (e2, time) => {
            if (e2.type === 'set' && time) onChange(time.getTime());
          },
        });
      },
    });

  const d = new Date(value);
  const pick = [styles.pick, { backgroundColor: colors.surfaceAlt }];
  return (
    <View style={styles.row}>
      <T variant="body" style={styles.label}>
        {label}
      </T>
      <Pressable
        onPress={Platform.OS === 'android' ? openAndroid : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${d.toLocaleString([], mode === 'date' ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
        style={({ pressed }) => [styles.picks, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={pick}>
          <T variant="body" style={styles.pickText}>
            {d.toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              ...(mode === 'date' && d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
            })}
          </T>
        </View>
        {mode === 'datetime' && (
          <View style={pick}>
            <T variant="body" style={styles.pickText}>
              {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </T>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54, gap: spacing.md },
  label: { fontWeight: '700' },
  picks: { flexDirection: 'row', gap: 6 },
  pick: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: 10, justifyContent: 'center' },
  pickText: { fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
