import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppleIcon } from "@/components/icons/apple-icon";
import { GoogleIcon } from "@/components/icons/google-icon";
import { MyTripLogo } from "@/components/icons/mytrip-logo";
import { SocialButton } from "@/features/auth/social-button";
import { useSocialSignIn } from "@/features/auth/use-social-sign-in";

const hero = require("@/assets/images/auth-hero.png");

// The hero artwork is 851×770 and its white arc peaks at y≈629.
const HERO_ASPECT = 770 / 851;
const LOGO_TOP_RATIO = 670 / 851;

export default function SignInScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { signIn, pending, error } = useSocialSignIn();

  return (
    <View className="flex-1 bg-surface">
      <StatusBar style="dark" />
      <Image
        source={hero}
        contentFit="cover"
        style={{ position: "absolute", top: 0, left: 0, width, height: width * HERO_ASPECT }}
      />

      <View
        className="flex-1 px-7"
        style={{ paddingTop: width * LOGO_TOP_RATIO, paddingBottom: insets.bottom + 16 }}
      >
        <View className="items-center">
          <MyTripLogo size={56} />
          <Text className="mt-1.5 font-inter-bold text-[32px] leading-[40px] tracking-[-1.7px] text-ink">
            MyTrip
          </Text>

          <Text className="mt-[18px] font-inter-bold text-[32px] leading-[40px] tracking-[-2.3px] text-ink">
            Welcome
          </Text>
          <Text className="text-center font-inter text-[16.6px] leading-[22px] tracking-[-0.55px] text-muted">
            Sign in to continue{"\n"}your journey
          </Text>
        </View>

        <View className="mt-[23px] gap-2.5">
          <SocialButton
            label="Continue with Google"
            icon={<GoogleIcon size={30} />}
            onPress={() => signIn("google")}
            loading={pending === "google"}
            disabled={pending !== null}
          />
          <SocialButton
            label="Continue with Apple"
            icon={<AppleIcon size={32} />}
            onPress={() => signIn("apple")}
            loading={pending === "apple"}
            disabled={pending !== null}
          />
        </View>

        {error && (
          <Text accessibilityRole="alert" className="mt-4 text-center font-inter text-sm text-danger">
            {error}
          </Text>
        )}

        <Text className="mt-auto text-center font-inter text-sm leading-5 tracking-[-0.15px] text-muted">
          By continuing, you agree to our{"\n"}
          <Text className="text-link">Terms of Service</Text> and{" "}
          <Text className="text-link">Privacy Policy</Text>.
        </Text>
      </View>
    </View>
  );
}
