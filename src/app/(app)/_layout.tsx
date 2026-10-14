import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { Platform, Text, View } from "react-native";

export default function AppLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;

  // Signed-in app screens are native-only; the only public web page is /share/[token].
  if (Platform.OS === "web") {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-surface px-7">
        <Text className="text-center font-inter-bold text-2xl text-ink">MyTrip is a mobile app</Text>
        <Text className="text-center font-inter text-base text-muted">
          Open MyTrip on your iPhone or Android phone to plan and view your trips.
        </Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
