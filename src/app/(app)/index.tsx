import { useClerk, useUser } from "@clerk/expo";
import { Pressable, Text, View } from "react-native";

// TODO(Phase 4): replace with the real Home screen (trip list) inside native tabs.
export default function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface px-7">
      <Text className="font-inter-bold text-2xl text-ink">
        Hi {user?.firstName ?? "traveler"}
      </Text>
      <Text className="font-inter text-base text-muted">
        {user?.primaryEmailAddress?.emailAddress}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => signOut()}
        className="rounded-full border border-stroke bg-white px-6 py-3 active:bg-surface"
      >
        <Text className="font-inter-semibold text-base text-ink">Sign out</Text>
      </Pressable>
    </View>
  );
}
