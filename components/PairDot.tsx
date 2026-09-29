import { View } from "react-native";
import { useColors } from "@/theme";

// The app's signature mark: the left half is me, the right half is the partner.
// A day both people moved reads as one full two-tone circle.
export function PairDot({ me, partner, size = 12 }: { me: boolean; partner: boolean; size?: number }) {
  const colors = useColors();
  const half = { width: size / 2, height: size };
  return (
    <View
      accessibilityLabel={me && partner ? "둘 다 운동" : me ? "나만 운동" : partner ? "상대만 운동" : "운동 없음"}
      style={{ flexDirection: "row", width: size, height: size }}
    >
      <View
        style={{
          ...half,
          borderTopLeftRadius: size / 2,
          borderBottomLeftRadius: size / 2,
          backgroundColor: me ? colors.me : colors.sunken,
        }}
      />
      <View
        style={{
          ...half,
          borderTopRightRadius: size / 2,
          borderBottomRightRadius: size / 2,
          backgroundColor: partner ? colors.partner : colors.sunken,
        }}
      />
    </View>
  );
}
