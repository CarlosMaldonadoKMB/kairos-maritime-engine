import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // 1. Inspeccionar la bodega de credenciales
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await AsyncStorage.getItem('kairos_token');
        setIsAuthenticated(!!token);
      } catch (e) {
        setIsAuthenticated(false);
      } finally {
        setIsReady(true);
      }
    }
    checkAuth();
  }, []);

// 2. Ejecutar la redirección automática
useEffect(() => {
  if (!isReady) return;

  const inAuthGroup = segments[0] === '(tabs)';

  if (isAuthenticated && !inAuthGroup) {
    // Usamos "as any" para calmar a TypeScript mientras compila las rutas
    router.replace('/(tabs)' as any);
  } else if (!isAuthenticated && (segments[0] as string) !== 'login') {
    router.replace('/login' as any);
  }
}, [isAuthenticated, isReady, segments]);

  // Pantalla de carga del centinela
  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  // 3. Estructura visual manteniendo tu Theme y Modal original
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Declaramos el login como pantalla permitida sin cabecera */}
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}