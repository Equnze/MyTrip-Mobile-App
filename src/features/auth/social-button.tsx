import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

type Props = {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function SocialButton({ label, icon, onPress, disabled, loading }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className="h-[61px] flex-row items-center justify-center rounded-[14px] border border-stroke bg-white active:bg-surface disabled:opacity-60"
      style={{ boxShadow: "0px 2px 10px rgba(16, 24, 40, 0.04)" }}
    >
      <View className="absolute left-5 items-center justify-center">
        {loading ? <ActivityIndicator color="#0B0C26" /> : icon}
      </View>
      <Text className="pl-3 font-inter-semibold text-[16.5px] tracking-[-0.25px] text-ink">{label}</Text>
    </Pressable>
  );
}
