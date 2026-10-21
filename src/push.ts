import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './backend';

// Register a verified owner's physical device. This does NOT send push messages.
// A trusted server still needs to deliver alerts for verified activity events.
export async function registerOwnerDevice(ownerId: string): Promise<void> {
  if (!supabase) throw new Error('Connect your owner account before enabling push.');
  if (Constants.appOwnership === 'expo') throw new Error('Remote push needs a development build; Expo Go cannot register this device.');
  if (!Device.isDevice) throw new Error('Remote push requires a physical phone.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('owner-activity', {
      name: 'Utah Sands activity', importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Notification permission was not granted.');
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('Set up EAS and its project ID before registering push.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.from('owner_devices').upsert({
    owner_id: ownerId, expo_push_token: token, updated_at: new Date().toISOString(),
  }, { onConflict: 'expo_push_token' });
  if (error) throw error;
}
