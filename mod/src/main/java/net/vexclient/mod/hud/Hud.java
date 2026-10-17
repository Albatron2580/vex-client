package net.vexclient.mod.hud;

import com.google.gson.reflect.TypeToken;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.vexclient.mod.VexConfig;
import net.vexclient.mod.data.Json;
import net.vexclient.mod.gui.HudEditorScreen;
import net.vexclient.mod.module.Setting;

import java.util.*;

/**
 * Draws the HUD elements and stores their layout in config/vex-hud.json. There are three layout slots;
 * the current one is saved automatically, switching slots loads that slot's positions and options.
 */
public final class Hud {
    private Hud() {}

    public static final List<HudElement> ELEMENTS = List.of(
            new Elements.Fps(), new Elements.Coords(), new Elements.Position(), new Elements.Ping(),
            new Elements.Effects(), new Elements.Armor(), new Elements.WaypointList(), new Elements.FriendsNearby());
    public static final int SLOTS = 3;
    private static int active = 1;
    private static Map<String, Map<String, Map<String, Object>>> layouts = new LinkedHashMap<>();
    private static boolean loaded;

    public static int activeSlot() { return active; }

    public static void render(GuiGraphics g) {
        Minecraft mc = Minecraft.getInstance();
        if (!loaded) load();
        if (mc.player == null || mc.options.hideGui || mc.screen instanceof HudEditorScreen) return;
        List<int[]> placed = new ArrayList<>();
        for (HudElement e : ELEMENTS) if (e.enabled) { int[] r = drawElement(g, mc, e, false, placed); if (r != null) placed.add(r); }
    }

    public static int[] drawElement(GuiGraphics g, Minecraft mc, HudElement e, boolean editing) { return drawElement(g, mc, e, editing, null); }

    /**
     * Draws one element at its saved place; returns its on-screen box {x, y, w, h} or null.
     * When it would overlap an element already drawn this frame, it slides down below it, so elements never cover each other.
     */
    public static int[] drawElement(GuiGraphics g, Minecraft mc, HudElement e, boolean editing, List<int[]> placed) {
        int sw = g.guiWidth(), sh = g.guiHeight();
        int bw = Math.round(e.lastW * e.scale), bh = Math.round(e.lastH * e.scale);
        int px = Math.max(2, Math.min(sw - bw, Math.round(e.x * sw)));
        int py = Math.max(2, Math.min(sh - bh, Math.round(e.y * sh)));
        if (placed != null) {
            for (int guard = 0; guard < 12; guard++) {
                int[] hit = null;
                for (int[] r : placed) if (px < r[0] + r[2] && px + bw > r[0] && py < r[1] + r[3] && py + bh > r[1]) { hit = r; break; }
                if (hit == null) break;
                py = hit[1] + hit[3] + 2;
            }
        }
        var pose = g.pose();
        pose.pushMatrix();
        pose.translate(px + 3 * e.scale, py + 3 * e.scale);
        pose.scale(e.scale, e.scale);
        int[] wh;
        try { wh = e.draw(g, mc, editing); } finally { pose.popMatrix(); }
        if (wh == null) return null;
        e.lastW = wh[0]; e.lastH = wh[1];
        return new int[]{px, py, Math.round(wh[0] * e.scale), Math.round(wh[1] * e.scale)};
    }

    // ---------- persistence ----------
    private static Map<String, Map<String, Object>> snapshot() {
        Map<String, Map<String, Object>> m = new LinkedHashMap<>();
        for (HudElement e : ELEMENTS) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("enabled", e.enabled); d.put("x", e.x); d.put("y", e.y); d.put("scale", e.scale);
            d.put("color", String.format("#%08X", e.color)); d.put("background", e.background);
            Map<String, Object> s = new LinkedHashMap<>();
            for (Setting<?> st : e.settings) s.put(st.id, st.toJson());
            d.put("settings", s);
            m.put(e.id, d);
        }
        return m;
    }

    @SuppressWarnings("unchecked")
    private static void apply(Map<String, Map<String, Object>> m) {
        if (m == null) return;
        for (HudElement e : ELEMENTS) {
            Map<String, Object> d = m.get(e.id);
            if (d == null) continue;
            if (d.get("enabled") instanceof Boolean b) e.enabled = b;
            if (d.get("x") instanceof Number n) e.x = clamp(n.floatValue(), 0, 1);
            if (d.get("y") instanceof Number n) e.y = clamp(n.floatValue(), 0, 1);
            if (d.get("scale") instanceof Number n) e.scale = clamp(n.floatValue(), 0.5f, 3f);
            if (d.get("color") instanceof String c && c.matches("#[0-9A-Fa-f]{8}")) e.color = (int) Long.parseLong(c.substring(1), 16);
            if (d.get("background") instanceof Boolean b) e.background = b;
            if (d.get("settings") instanceof Map<?, ?> s)
                for (Setting<?> st : e.settings) if (s.containsKey(st.id)) st.fromJson(((Map<String, Object>) s).get(st.id));
        }
    }

    private static float clamp(float v, float a, float b) { return Float.isNaN(v) ? a : Math.max(a, Math.min(b, v)); }

    @SuppressWarnings("unchecked")
    public static void load() {
        loaded = true;
        Map<String, Object> f = Json.read("vex-hud.json", new TypeToken<Map<String, Object>>() {}.getType());
        if (f == null) {
            // first run: carry over the old Vex Client settings (vex-client.json)
            VexConfig c = VexConfig.get();
            for (HudElement e : ELEMENTS) {
                if (e.id.equals("fps")) e.enabled = c.showFps;
                if (e.id.equals("coords")) e.enabled = c.showCoords;
                if (e.id.equals("position")) e.enabled = c.showDirection;
                e.background = c.hudBackground;
            }
            save();
            return;
        }
        if (f.get("active") instanceof Number n) active = Math.max(1, Math.min(SLOTS, n.intValue()));
        if (f.get("layouts") instanceof Map<?, ?> l) {
            layouts = new LinkedHashMap<>();
            for (var en : l.entrySet()) if (en.getValue() instanceof Map<?, ?> v) layouts.put(String.valueOf(en.getKey()), (Map<String, Map<String, Object>>) v);
        }
        apply(layouts.get(String.valueOf(active)));
    }

    public static void save() {
        layouts.put(String.valueOf(active), snapshot());
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("active", active);
        f.put("layouts", layouts);
        Json.write("vex-hud.json", f);
    }

    /** Switches layout slot. An empty slot starts as a copy of the current layout. */
    public static void selectSlot(int slot) {
        if (slot == active || slot < 1 || slot > SLOTS) return;
        save();
        active = slot;
        Map<String, Map<String, Object>> m = layouts.get(String.valueOf(slot));
        if (m != null) apply(m);
        save();
    }

    public static boolean slotUsed(int slot) { return layouts.containsKey(String.valueOf(slot)); }

    /** Puts every element back to its default place and look (keeps which ones are on). */
    public static void resetPositions() {
        List<HudElement> fresh = List.of(new Elements.Fps(), new Elements.Coords(), new Elements.Position(), new Elements.Ping(),
                new Elements.Effects(), new Elements.Armor(), new Elements.WaypointList(), new Elements.FriendsNearby());
        for (int i = 0; i < ELEMENTS.size(); i++) {
            HudElement e = ELEMENTS.get(i), d = fresh.get(i);
            e.x = d.x; e.y = d.y; e.scale = d.scale; e.color = d.color; e.background = d.background;
        }
        save();
    }
}
