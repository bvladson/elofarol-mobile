import { router } from "expo-router";
import { Pressable } from "react-native";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

/** Atalho para "Minha conta" no topo das abas. */
export function AccountButton() {
  const { me } = useAuth();
  const label = initials((me?.user.email ?? "?").split("@")[0]!.replace(/[._-]+/g, " "));
  return (
    <Pressable onPress={() => router.push("/conta")} accessibilityRole="button" accessibilityLabel="Minha conta" hitSlop={8}>
      <Avatar label={label} size={36} />
    </Pressable>
  );
}
