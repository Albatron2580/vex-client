package net.vexclient.mod.module;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.vexclient.mod.VexClientMod;
import net.vexclient.mod.module.impl.*;
import org.lwjgl.glfw.GLFW;

import java.io.Reader;
import java.io.Writer;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/** All modules, their saved state (config/vex-modules.json) and their keybinds. */
public final class Modules {
    private Modules() {}

    private static final List<Module> ALL = new ArrayList<>();
    private static final Map<String, Module> BY_ID = new LinkedHashMap<>();
    private static final Set<Integer> held = new HashSet<>();
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public static ZoomModule zoom;
    public static FullbrightModule fullbright;
    public static SprintModule sprint;
    public static LowHealthModule lowHealth;

    public static void init() {
        register(zoom = new ZoomModule());
        register(sprint = new SprintModule());
        register(fullbright = new FullbrightModule());
        register(lowHealth = new LowHealthModule());
        load();
    }

    private static void register(Module m) { ALL.add(m); BY_ID.put(m.id, m); }

    public static List<Module> all() { return Collections.unmodifiableList(ALL); }
    public static List<Module> in(Module.Category c) { return ALL.stream().filter(m -> m.category == c).toList(); }
    public static Module get(String id) { return BY_ID.get(id); }

    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("vex-modules.json"); }

    @SuppressWarnings("unchecked")
    public static void load() {
        try {
            if (!Files.exists(file())) {
                // first run: carry over the old settings from vex-client.json
                net.vexclient.mod.VexConfig c = net.vexclient.mod.VexConfig.get();
                ((Module) zoom).loadEnabled(c.zoom);
                zoom.level.set((double) c.zoomLevel);
                zoom.smooth.set(c.smoothZoom);
                ((Module) sprint).loadEnabled(c.alwaysSprint);
                save();
                return;
            }
            Type t = new TypeToken<Map<String, Map<String, Object>>>() {}.getType();
            Map<String, Map<String, Object>> data;
            try (Reader r = Files.newBufferedReader(file())) { data = GSON.fromJson(r, t); }
            if (data == null) return;
            for (Module m : ALL) {
                Map<String, Object> d = data.get(m.id);
                if (d == null) continue;
                if (d.get("enabled") instanceof Boolean b) m.loadEnabled(b);
                if (d.get("key") instanceof Number n) m.key = n.intValue();
                if (d.get("settings") instanceof Map<?, ?> s) {
                    for (Setting<?> st : m.settings) if (s.containsKey(st.id)) st.fromJson(((Map<String, Object>) s).get(st.id));
                }
            }
        } catch (Exception e) {
            VexClientMod.LOG.warn("Could not read vex-modules.json; using defaults", e);
        }
    }

    public static void save() {
        Map<String, Object> data = new LinkedHashMap<>();
        for (Module m : ALL) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("enabled", m.isEnabled());
            d.put("key", m.key);
            Map<String, Object> s = new LinkedHashMap<>();
            for (Setting<?> st : m.settings) s.put(st.id, st.toJson());
            d.put("settings", s);
            data.put(m.id, d);
        }
        try {
            Files.createDirectories(file().getParent());
            Path tmp = file().resolveSibling("vex-modules.json.tmp");
            try (Writer w = Files.newBufferedWriter(tmp)) { GSON.toJson(data, w); }
            Files.move(tmp, file(), java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception e) {
            VexClientMod.LOG.warn("Could not save vex-modules.json", e);
        }
    }

    /** True while the given key is physically held down (polled straight from GLFW). */
    public static boolean keyDown(int key) {
        if (key < 0) return false;
        long win = GLFW.glfwGetCurrentContext();
        return win != 0 && GLFW.glfwGetKey(win, key) == GLFW.GLFW_PRESS;
    }

    public static void tick(Minecraft mc) {
        // toggle keybinds, only while playing (not while typing in chat or a menu)
        if (mc.screen == null) {
            for (Module m : ALL) {
                if (m.key < 0 || m instanceof ZoomModule) continue;
                boolean down = keyDown(m.key);
                if (down && !held.contains(m.key)) {
                    m.toggle();
                    save();
                    if (net.vexclient.mod.VexConfig.get().notificationSound)
                        mc.getSoundManager().play(net.minecraft.client.resources.sounds.SimpleSoundInstance.forUI(net.minecraft.sounds.SoundEvents.UI_BUTTON_CLICK, m.isEnabled() ? 1.4F : 0.9F));
                    if (mc.player != null) {
                        String state = m.isEnabled() ? "§aON" : "§cOFF";
                        mc.player.displayClientMessage(net.minecraft.network.chat.Component.literal("§7§lV §r§f" + m.name + ": " + state), true);
                    }
                }
                if (down) held.add(m.key); else held.remove(m.key);
            }
        }
        for (Module m : ALL) if (m.isEnabled()) m.tick(mc);
    }

    /** Human-readable key name for the menu. */
    public static String keyName(int key) {
        if (key < 0) return "none";
        String n = GLFW.glfwGetKeyName(key, 0);
        if (n != null) return n.toUpperCase(Locale.ROOT);
        return switch (key) {
            case GLFW.GLFW_KEY_LEFT_SHIFT -> "L-SHIFT"; case GLFW.GLFW_KEY_RIGHT_SHIFT -> "R-SHIFT";
            case GLFW.GLFW_KEY_LEFT_CONTROL -> "L-CTRL"; case GLFW.GLFW_KEY_RIGHT_CONTROL -> "R-CTRL";
            case GLFW.GLFW_KEY_LEFT_ALT -> "L-ALT"; case GLFW.GLFW_KEY_RIGHT_ALT -> "R-ALT";
            case GLFW.GLFW_KEY_TAB -> "TAB"; case GLFW.GLFW_KEY_CAPS_LOCK -> "CAPS";
            case GLFW.GLFW_KEY_SPACE -> "SPACE"; case GLFW.GLFW_KEY_ENTER -> "ENTER";
            case GLFW.GLFW_KEY_UP -> "UP"; case GLFW.GLFW_KEY_DOWN -> "DOWN"; case GLFW.GLFW_KEY_LEFT -> "LEFT"; case GLFW.GLFW_KEY_RIGHT -> "RIGHT";
            default -> key >= GLFW.GLFW_KEY_F1 && key <= GLFW.GLFW_KEY_F25 ? "F" + (key - GLFW.GLFW_KEY_F1 + 1) : "KEY " + key;
        };
    }

    /** Polls the keyboard for a newly pressed key (used by the "press a key" binding button). */
    public static int pollPressedKey() {
        for (int k = GLFW.GLFW_KEY_SPACE; k <= GLFW.GLFW_KEY_LAST; k++) {
            if (k == GLFW.GLFW_KEY_ESCAPE) continue;
            if (keyDown(k)) return k;
        }
        return -1;
    }
}
