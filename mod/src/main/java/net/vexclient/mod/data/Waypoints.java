package net.vexclient.mod.data;

import com.google.gson.reflect.TypeToken;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;

import java.util.*;

/** Waypoints, saved per server / singleplayer world and dimension in config/vex-waypoints.json. */
public final class Waypoints {
    private Waypoints() {}

    public static final class Waypoint {
        public String name;
        public int x, y, z;
        public Waypoint() {}
        public Waypoint(String name, int x, int y, int z) { this.name = name; this.x = x; this.y = y; this.z = z; }
    }

    private static Map<String, List<Waypoint>> data;

    private static Map<String, List<Waypoint>> data() {
        if (data == null) {
            Map<String, List<Waypoint>> d = Json.read("vex-waypoints.json", new TypeToken<Map<String, List<Waypoint>>>() {}.getType());
            data = d != null ? new LinkedHashMap<>(d) : new LinkedHashMap<>();
            data.values().removeIf(Objects::isNull);
            for (List<Waypoint> l : data.values()) l.removeIf(w -> w == null || w.name == null || w.name.isBlank());
        }
        return data;
    }

    /** "server:play.example.net|minecraft:overworld" or "world:My World|minecraft:the_nether"; null outside a world. */
    public static String worldKey(Minecraft mc) {
        if (mc.level == null) return null;
        String where;
        if (mc.hasSingleplayerServer() && mc.getSingleplayerServer() != null) where = "world:" + mc.getSingleplayerServer().getWorldData().getLevelName();
        else {
            ServerData s = mc.getCurrentServer();
            where = "server:" + (s != null ? s.ip.toLowerCase(Locale.ROOT) : "unknown");
        }
        String dim = mc.level.dimension().toString();
        int i = dim.lastIndexOf(' ');
        dim = (i >= 0 ? dim.substring(i + 1) : dim).replace("]", "");
        return where + "|" + dim;
    }

    public static List<Waypoint> here(Minecraft mc) {
        String k = worldKey(mc);
        return k == null ? List.of() : Collections.unmodifiableList(data().getOrDefault(k, List.of()));
    }

    public static Waypoint add(Minecraft mc, String name) {
        String k = worldKey(mc);
        if (k == null || mc.player == null) return null;
        name = name == null ? "" : name.trim();
        if (name.isEmpty()) name = "Waypoint " + (here(mc).size() + 1);
        if (name.length() > 24) name = name.substring(0, 24);
        Waypoint w = new Waypoint(name, mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ());
        data().computeIfAbsent(k, x -> new ArrayList<>()).add(w);
        save();
        return w;
    }

    public static void remove(Minecraft mc, Waypoint w) {
        String k = worldKey(mc);
        if (k == null) return;
        List<Waypoint> l = data().get(k);
        if (l != null && l.remove(w)) { if (l.isEmpty()) data().remove(k); save(); }
    }

    public static List<Waypoint> nearest(Minecraft mc, int max) {
        if (mc.player == null) return List.of();
        List<Waypoint> l = new ArrayList<>(here(mc));
        double px = mc.player.getX(), pz = mc.player.getZ();
        l.sort(Comparator.comparingDouble(w -> (w.x - px) * (w.x - px) + (w.z - pz) * (w.z - pz)));
        return l.subList(0, Math.min(max, l.size()));
    }

    public static void save() { Json.write("vex-waypoints.json", data()); }
}
