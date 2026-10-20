package net.vexclient.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.vexclient.mod.data.Friends;
import net.vexclient.mod.data.Waypoints;
import net.vexclient.mod.module.Setting;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** The built-in HUD elements. Add new ones here and register them in Hud.ELEMENTS. */
public final class Elements {
    private Elements() {}

    public static final class Fps extends HudElement {
        public Fps() { super("fps", "FPS", true, 0.005f, 0.008f); color = 0xFFB46CFF; }
        protected List<String> lines(Minecraft mc) { return List.of(mc.getFps() + " FPS"); }
    }

    public static final class Coords extends HudElement {
        final Setting.Bool decimals = add(new Setting.Bool("decimals", "Decimals", false));
        public Coords() { super("coords", "Coordinates", true, 0.005f, 0.06f); }
        protected List<String> lines(Minecraft mc) {
            if (mc.player == null) return null;
            String f = decimals.get() ? "%.1f" : "%.0f";
            return List.of(String.format(Locale.ROOT, "XYZ " + f + " / " + f + " / " + f, mc.player.getX(), mc.player.getY(), mc.player.getZ()));
        }
        protected List<String> preview() { return List.of("XYZ 120 / 64 / -340"); }
    }

    public static final class Position extends HudElement {
        public Position() { super("position", "Position", false, 0.005f, 0.12f); }
        protected List<String> lines(Minecraft mc) {
            if (mc.player == null || mc.level == null) return null;
            List<String> l = new ArrayList<>();
            l.add("Facing " + cap(mc.player.getDirection().getName()));
            String biome = mc.level.getBiome(mc.player.blockPosition()).unwrapKey().map(Object::toString).orElse("?");
            int i = Math.max(biome.lastIndexOf(':'), biome.lastIndexOf('/'));
            biome = biome.substring(i + 1).replace("]", "").replace('_', ' ').trim();
            l.add("Biome " + cap(biome));
            l.add("Chunk " + (mc.player.getBlockX() >> 4) + ", " + (mc.player.getBlockZ() >> 4));
            return l;
        }
        protected List<String> preview() { return List.of("Facing North", "Biome Plains", "Chunk 7, -22"); }
    }

    public static final class Ping extends HudElement {
        public Ping() { super("ping", "Ping", false, 0.005f, 0.26f); }
        protected List<String> lines(Minecraft mc) {
            if (mc.player == null || mc.getConnection() == null) return null;
            if (mc.hasSingleplayerServer()) return List.of("Ping: singleplayer");
            PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
            return info == null ? null : List.of("Ping " + info.getLatency() + " ms");
        }
        protected List<String> preview() { return List.of("Ping 42 ms"); }
    }

    public static final class Effects extends HudElement {
        public Effects() { super("effects", "Potion effects", true, 0.82f, 0.25f); }
        protected List<String> lines(Minecraft mc) {
            if (mc.player == null) return null;
            List<String> l = new ArrayList<>();
            for (MobEffectInstance e : mc.player.getActiveEffects()) {
                String name = e.getEffect().value().getDisplayName().getString();
                int amp = e.getAmplifier();
                String lvl = amp > 0 ? " " + roman(amp + 1) : "";
                String time = e.isInfiniteDuration() ? "∞" : fmt(e.getDuration() / 20);
                l.add(name + lvl + " " + time);
            }
            return l;
        }
        protected List<String> preview() { return List.of("Speed II 1:30", "Strength 0:45"); }
        private static String fmt(int s) { return (s / 60) + ":" + String.format("%02d", s % 60); }
        private static String roman(int n) { String[] r = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"}; return n <= 10 ? r[n - 1] : String.valueOf(n); }
    }

    /** Armour pieces with durability. */
    public static final class Armor extends HudElement {
        private static final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.MAINHAND};
        public Armor() { super("armor", "Armor", true, 0.005f, 0.6f); combat = true; }
        protected List<String> lines(Minecraft mc) { return null; }
        public int[] draw(GuiGraphics g, Minecraft mc, boolean editing) {
            Player p = mc.player;
            if (p == null) return null;
            int y = 0, w = 0, shown = 0;
            for (EquipmentSlot slot : SLOTS) {
                ItemStack st = p.getItemBySlot(slot);
                if (st.isEmpty()) continue;
                shown++;
                g.renderItem(st, 0, y);
                if (st.isDamageableItem()) {
                    int left = st.getMaxDamage() - st.getDamageValue();
                    float pct = left / (float) st.getMaxDamage();
                    int c = pct > 0.5f ? 0xFF5BFF7A : pct > 0.2f ? 0xFFFFE14F : 0xFFFF5B6E;
                    String s = String.valueOf(left);
                    g.drawString(mc.font, s, 19, y + 4, c, true);
                    w = Math.max(w, 19 + mc.font.width(s));
                } else w = Math.max(w, 16);
                y += 17;
            }
            if (shown == 0) {
                if (!editing) return null;
                g.drawString(mc.font, "Armor", 0, 0, color, true);
                return new int[]{40, 10};
            }
            return new int[]{w, y};
        }
    }

    /** Distance and direction to your waypoints in this world. */
    public static final class WaypointList extends HudElement {
        final Setting.Num max = add(new Setting.Num("max", "Show", 3, 1, 8, 1, ""));
        public WaypointList() { super("waypoints", "Waypoints", true, 0.40f, 0.008f); color = 0xFFFF8A1F; }
        protected List<String> lines(Minecraft mc) {
            if (mc.player == null) return null;
            List<String> l = new ArrayList<>();
            for (Waypoints.Waypoint w : Waypoints.nearest(mc, (int) Math.round(max.get()))) {
                double dx = w.x + 0.5 - mc.player.getX(), dz = w.z + 0.5 - mc.player.getZ();
                int dist = (int) Math.sqrt(dx * dx + dz * dz + Math.pow(w.y - mc.player.getY(), 2));
                double angle = Math.toDegrees(Math.atan2(-dx, dz)) - mc.player.getYRot();
                angle = ((angle % 360) + 540) % 360 - 180;
                String arrow = Math.abs(angle) < 22.5 ? "↑" : Math.abs(angle) > 157.5 ? "↓" : angle > 0 ? (angle < 67.5 ? "↗" : angle < 112.5 ? "→" : "↘") : (angle > -67.5 ? "↖" : angle > -112.5 ? "←" : "↙");
                l.add(arrow + " " + w.name + " " + dist + "m");
            }
            return l;
        }
        protected List<String> preview() { return List.of("↑ Base 120m", "→ Farm 45m"); }
    }

    /** Friends who are near you right now. */
    public static final class FriendsNearby extends HudElement {
        public FriendsNearby() { super("friends", "Friends nearby", false, 0.82f, 0.008f); color = 0xFF5BFF7A; }
        protected List<String> lines(Minecraft mc) {
            if (mc.level == null || mc.player == null) return null;
            List<String> l = new ArrayList<>();
            for (Player p : mc.level.players()) {
                if (p == mc.player) continue;
                String n = p.getName().getString();
                if (Friends.isFriend(n)) l.add(n + " " + (int) p.distanceTo(mc.player) + "m");
            }
            if (!l.isEmpty()) l.add(0, "Friends");
            return l;
        }
        protected List<String> preview() { return List.of("Friends", "RaxMc 12m"); }
    }

    /** VEX CLIENT watermark with the grey V. */
    public static final class Watermark extends HudElement {
        final Setting.Bool version = add(new Setting.Bool("version", "Show version", false));
        public Watermark() { super("watermark", "VEX CLIENT logo", true, 0.86f, 0.008f); background = false; }
        protected List<String> lines(Minecraft mc) { return null; }
        public int[] draw(GuiGraphics g, Minecraft mc, boolean editing) {
            String v = version.get() ? " " + net.fabricmc.loader.api.FabricLoader.getInstance().getModContainer("vexclient").map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("") : "";
            int w = 11 + mc.font.width("VEX CLIENT" + v);
            if (background) g.fill(-3, -3, w + 3, 11, 0x8C120A24);
            net.vexclient.mod.gui.Ui.logo(g, 0, 0, 8, net.vexclient.mod.gui.Ui.LOGO);
            g.drawString(mc.font, "VEX", 11, 0, color == 0xFFFFFFFF ? net.vexclient.mod.gui.Ui.ORANGE : color, true);
            g.drawString(mc.font, " CLIENT" + v, 11 + mc.font.width("VEX"), 0, 0xFFFFFFFF, true);
            return new int[]{w + 6, 14};
        }
    }

    /** Clicks per second (left | right). */
    public static final class Cps extends HudElement {
        final Setting.Bool showRight = add(new Setting.Bool("right", "Right clicks too", true));
        public Cps() { super("cps", "CPS", false, 0.005f, 0.32f); combat = true; }
        protected List<String> lines(Minecraft mc) {
            return List.of(showRight.get() ? CombatStats.leftCps() + " | " + CombatStats.rightCps() + " CPS" : CombatStats.leftCps() + " CPS");
        }
        protected List<String> preview() { return List.of("9 | 2 CPS"); }
    }

    /** Distance of your last hit. */
    public static final class Reach extends HudElement {
        public Reach() { super("reach", "Reach display", false, 0.005f, 0.38f); combat = true; }
        protected List<String> lines(Minecraft mc) {
            if (CombatStats.lastReach < 0 || System.currentTimeMillis() - CombatStats.lastHitAt > 5000) return List.of("Reach -");
            return List.of(String.format(Locale.ROOT, "Reach %.2f m", CombatStats.lastReach));
        }
        protected List<String> preview() { return List.of("Reach 2.87 m"); }
    }

    /** Hits in a row without being hit back. */
    public static final class Combo extends HudElement {
        public Combo() { super("combo", "Combo counter", false, 0.005f, 0.44f); combat = true; }
        protected List<String> lines(Minecraft mc) { return List.of(CombatStats.combo > 0 ? CombatStats.combo + " Combo" : "No combo"); }
        protected List<String> preview() { return List.of("4 Combo"); }
    }

    static String cap(String s) { return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1); }
}
