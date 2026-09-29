import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { radius, spacing, TAP } from '../theme/colors';
import { T } from './ui';

/** Date + time picker: iOS shows the compact native control; Android opens the date then time dialogs. */
export function DateTimeField({ label, value, onChange }: { label: string; value: number; onChange: (t: number) => void }) {
  const { colors, isDark } = useApp();

  if (Platform.OS === 'ios') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP }}>
        <T variant="body">{label}</T>
        <DateTimePicker
          value={new Date(value)}
          mode="datetime"
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
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (e2, time) => {
            if (e2.type === 'set' && time) onChange(time.getTime());
          },
        });
      },
    });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP }}>
      <T variant="body">{label}</T>
      <Pressable
        onPress={Platform.OS === 'android' ? openAndroid : undefined}
        accessibilityRole="button"
        style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
      >
        <T variant="body">{new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</T>
      </Pressable>
    </View>
  );
}
