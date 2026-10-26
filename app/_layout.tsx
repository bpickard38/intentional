import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* These screens render their own back button. */}
        <Stack.Screen name="study/plans/index" options={{ headerShown: false }} />
        <Stack.Screen name="study/plans/create" options={{ headerShown: false }} />
        <Stack.Screen name="study/plans/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="study/plans/[id]/day/[dayId]" options={{ headerShown: false }} />
        <Stack.Screen name="study/journal-detail" options={{ headerShown: false }} />
        <Stack.Screen name="study/theme" options={{ headerShown: false }} />
        <Stack.Screen name="study/journal" options={{ title: 'Journal' }} />
        <Stack.Screen name="habits/[id]" options={{ title: 'Habit' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
