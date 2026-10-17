package net.vexclient.mod.data;

import com.google.gson.reflect.TypeToken;

import java.util.*;

/** Your friends list (player names), saved in config/vex-friends.json. */
public final class Friends {
    private Friends() {}
    private static List<String> names;

    private static List<String> names() {
        if (names == null) {
            List<String> l = Json.read("vex-friends.json", new TypeToken<List<String>>() {}.getType());
            names = new ArrayList<>();
            if (l != null) for (String s : l) if (s != null && valid(s) && !contains(names, s)) names.add(s);
        }
        return names;
    }

    /** Minecraft names: 3-16 letters, digits and underscores. */
    public static boolean valid(String n) { return n != null && n.matches("[A-Za-z0-9_]{3,16}"); }
    private static boolean contains(List<String> l, String n) { for (String s : l) if (s.equalsIgnoreCase(n)) return true; return false; }

    public static List<String> all() { return Collections.unmodifiableList(names()); }
    public static boolean isFriend(String n) { return contains(names(), n); }

    /** Returns an error message, or null when added. */
    public static String add(String n) {
        n = n == null ? "" : n.trim();
        if (!valid(n)) return "Names are 3-16 letters, numbers or _";
        if (isFriend(n)) return n + " is already on your list";
        names().add(n);
        save();
        return null;
    }

    public static void remove(String n) { if (names().removeIf(s -> s.equalsIgnoreCase(n))) save(); }

    public static void save() { Json.write("vex-friends.json", names()); }
}
