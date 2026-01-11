import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = 'https://zszyczdpcjjlhnptytsi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzenljemRwY2pqbGhucHR5dHNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Mzk2OTIsImV4cCI6MjA4MTQxNTY5Mn0.Wm2L92Je7MNH4trkhS7STI2_38uJDnVS-7NAZgmvjGs';

// Create a custom storage adapter that checks for window
const customStorage = {
  getItem: (key: string) => {
    // Skip AsyncStorage during server-side rendering
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return Promise.resolve(null);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    // Skip AsyncStorage during server-side rendering
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    // Skip AsyncStorage during server-side rendering
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
