import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from './api';

const light = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  surface2: '#f1f3f6',
  border: '#e2e6eb',
  text: '#17202a',
  text2: '#55606e',
  primary: '#0f766e',
  primaryInk: '#ffffff',
  primarySoft: '#e6f4f2',
  danger: '#b42318',
  dangerSoft: '#fdecea',
  warn: '#9a6700',
  warnSoft: '#fff4d6',
  ok: '#18794e',
  okSoft: '#e7f6ee',
};
const dark: typeof light = {
  bg: '#0f1419',
  surface: '#161c23',
  surface2: '#1d252e',
  border: '#2a3440',
  text: '#e8edf2',
  text2: '#a3afbd',
  primary: '#2dd4bf',
  primaryInk: '#04201d',
  primarySoft: '#0f2f2c',
  danger: '#ff8a80',
  dangerSoft: '#3a1a18',
  warn: '#f5c451',
  warnSoft: '#3a2f10',
  ok: '#5fd39a',
  okSoft: '#12301f',
};
export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

export function Screen({ children, scroll = true, title, right }: { children: ReactNode; scroll?: boolean; title?: string; right?: ReactNode }) {
  const c = useTheme();
  const body = (
    <View style={{ padding: 16, gap: 12 }}>
      {title && (
        <View style={styles.row}>
          <Text style={[styles.h1, { color: c.text, flex: 1 }]} accessibilityRole="header">{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  return <View style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 }, style]}>{children}</View>;
}

export function T({ children, muted, bold, size = 15, color, style }: { children: ReactNode; muted?: boolean; bold?: boolean; size?: number; color?: string; style?: object }) {
  const c = useTheme();
  return <Text style={[{ color: color ?? (muted ? c.text2 : c.text), fontSize: size, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }} accessibilityRole="header">{children}</Text>;
}

export function Button({ title, onPress, kind = 'default', disabled, small }: { title: string; onPress: () => void; kind?: 'default' | 'primary' | 'danger'; disabled?: boolean; small?: boolean }) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.primary : c.surface;
  const fg = kind === 'primary' ? c.primaryInk : kind === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { backgroundColor: bg, borderColor: kind === 'danger' ? c.danger : kind === 'primary' ? c.primary : c.border, borderWidth: 1, borderRadius: 12, minHeight: small ? 36 : 46, paddingHorizontal: small ? 12 : 16, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Input({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.text, fontWeight: '600' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.text2}
        {...props}
        style={[{ borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: props.multiline ? 96 : 46, color: c.text, backgroundColor: c.surface, textAlignVertical: props.multiline ? 'top' : 'center' }, props.style]}
      />
      {hint && <Text style={{ color: c.text2, fontSize: 13 }}>{hint}</Text>}
    </View>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'info' }) {
  const c = useTheme();
  const map = { ok: [c.okSoft, c.ok], warn: [c.warnSoft, c.warn], danger: [c.dangerSoft, c.danger], info: [c.primarySoft, c.primary] } as const;
  const [bg, fg] = tone ? map[tone] : [c.surface2, c.text2];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function ListItem({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={({ pressed }) => ({ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.text2, fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 24, gap: 4 }}>
      <T bold>{title}</T>
      {hint && <T muted size={13}>{hint}</T>}
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return <ActivityIndicator style={{ marginVertical: 24 }} color={c.primary} accessibilityLabel="Yükleniyor" />;
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const c = useTheme();
  return (
    <View style={{ backgroundColor: c.dangerSoft, borderRadius: 12, padding: 12, gap: 8 }} accessibilityRole="alert">
      <Text style={{ color: c.danger }}>{errorMessage(error)}</Text>
      {onRetry && <Button small title="Tekrar dene" onPress={onRetry} />}
    </View>
  );
}

export function Alert({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' | 'ok' }) {
  const c = useTheme();
  const map = { info: [c.primarySoft, c.text], warn: [c.warnSoft, c.warn], danger: [c.dangerSoft, c.danger], ok: [c.okSoft, c.ok] } as const;
  return (
    <View style={{ backgroundColor: map[tone][0], borderRadius: 12, padding: 12 }}>
      <Text style={{ color: map[tone][1] }}>{children}</Text>
    </View>
  );
}

/** Sorgu durumları: yükleniyor / hata / boş. */
export function Q<D>({ q, empty, children }: { q: { isLoading: boolean; error: unknown; data: D | undefined; refetch: () => unknown }; empty?: (d: D) => string | false; children: (d: D) => ReactNode }) {
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  const e = empty?.(q.data);
  if (e) return <Empty title={e} />;
  return <>{children(q.data)}</>;
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { id: V; label: string }[]; onChange: (v: V) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderRadius: 12, padding: 3 }} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: value === o.id }} onPress={() => onChange(o.id)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: value === o.id ? c.surface : 'transparent' }}>
          <Text style={{ color: value === o.id ? c.primary : c.text2, fontWeight: '700' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  h1: { fontSize: 24, fontWeight: '800' },
});
