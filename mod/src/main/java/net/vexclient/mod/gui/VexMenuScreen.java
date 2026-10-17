package net.vexclient.mod.gui;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.vexclient.mod.VexConfig;
import net.vexclient.mod.data.Friends;
import net.vexclient.mod.data.Waypoints;
import net.vexclient.mod.hud.Hud;
import net.vexclient.mod.hud.HudElement;
import net.vexclient.mod.module.Module;
import net.vexclient.mod.module.Modules;
import net.vexclient.mod.module.Setting;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;

/**
 * The Right Shift menu: "VEX CLIENT" with three tabs (Settings, Display, Shaders). Every button changes a real
 * setting and saves it straight away. Long lists are split into pages instead of scrolling.
 */
public final class VexMenuScreen extends Screen {
    enum Tab { SETTINGS("Settings"), DISPLAY("Display"), SHADERS("Shaders"); final String label; Tab(String l) { label = l; } }
    enum Section {
        GENERAL("General"), WAYPOINTS("Waypoints"), FRIENDS("Friends"), CONTROLS("Controls"),
        PERFORMANCE("Performance"), MODS("Mods"), CHEATS("Cheats");
        final String label; Section(String l) { label = l; }
    }

    // remembered while the game runs, so the menu opens where you left it
    private static Tab tab = Tab.SETTINGS;
    private static Section section = Section.GENERAL;
    private static int page;

    private static final int ROW = 22;
    private final Screen parent;
    private int px0, py0, px1, py1, cx0, cy0, cx1, cy1;
    private final List<Label> labels = new ArrayList<>();
    private String status;
    private int statusColor = Ui.TEXT;
    private long statusUntil;
    private Module binding;
    private String draft = "";
    private int pages = 1;

    private record Label(int x, int y, String text, int color) {}

    /** One line of content: lays itself out at (x, y) with width w. */
    private interface Row { void build(int x, int y, int w); }

    public VexMenuScreen(Screen parent) {
        super(Component.literal("Vex Client"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        labels.clear();
        int w = Math.min(this.width - 16, 440), h = Math.min(this.height - 16, 270);
        px0 = (this.width - w) / 2; py0 = (this.height - h) / 2; px1 = px0 + w; py1 = py0 + h;

        // tabs
        int tw = 90, tx = this.width / 2 - (tw * 3 + 8) / 2;
        for (Tab t : Tab.values()) {
            Button b = addRenderableWidget(Button.builder(Component.literal(t == tab ? "» " + t.label + " «" : t.label), x -> { tab = t; page = 0; binding = null; rebuildWidgets(); })
                    .bounds(tx, py0 + 26, tw, 20).build());
            b.active = t != tab;
            tx += tw + 4;
        }

        cy0 = py0 + 54; cy1 = py1 - 30; cx1 = px1 - 10;
        cx0 = px0 + 10;
        if (tab == Tab.SETTINGS) {
            int sy = cy0;
            for (Section s : Section.values()) {
                Button b = addRenderableWidget(Button.builder(Component.literal(s.label), x -> { section = s; page = 0; binding = null; rebuildWidgets(); })
                        .bounds(px0 + 8, sy, 84, 18).build());
                b.active = s != section;
                sy += 20;
            }
            cx0 = px0 + 100;
        }

        List<Row> rows = switch (tab) {
            case SETTINGS -> settingsRows();
            case DISPLAY -> displayRows();
            case SHADERS -> shaderRows();
        };
        int perPage = Math.max(1, (cy1 - cy0) / ROW);
        pages = Math.max(1, (rows.size() + perPage - 1) / perPage);
        page = Math.max(0, Math.min(page, pages - 1));
        int y = cy0;
        for (int i = page * perPage; i < Math.min(rows.size(), (page + 1) * perPage); i++) {
            rows.get(i).build(cx0, y, cx1 - cx0);
            y += ROW;
        }

        // footer: pages and Done
        int fy = py1 - 25;
        if (pages > 1) {
            Button prev = addRenderableWidget(Button.builder(Component.literal("<"), b -> { page--; rebuildWidgets(); }).bounds(cx0, fy, 20, 20).build());
            prev.active = page > 0;
            labels.add(new Label(cx0 + 26, fy + 6, "Page " + (page + 1) + " / " + pages, Ui.DIM));
            Button next = addRenderableWidget(Button.builder(Component.literal(">"), b -> { page++; rebuildWidgets(); }).bounds(cx0 + 90, fy, 20, 20).build());
            next.active = page < pages - 1;
        }
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(px1 - 90, fy, 80, 20).build());
    }

    // ---------- helpers ----------
    private Button button(int x, int y, int w, String text, Button.OnPress press) {
        return addRenderableWidget(Button.builder(Component.literal(text), press).bounds(x, y, w, 20).build());
    }

    private static String onOff(boolean on) { return on ? "§aON" : "§cOFF"; }

    private void say(String msg, int color) { status = msg; statusColor = color; statusUntil = System.currentTimeMillis() + 5000; }

    private Row text(String s, int color) { return (x, y, w) -> labels.add(new Label(x + 2, y + 6, s, color)); }

    private Row header(String s) { return (x, y, w) -> labels.add(new Label(x + 2, y + 8, "§l" + s, Ui.ORANGE)); }

    /** A module's on/off button, with its keybind on the right. */
    private Row moduleRow(Module m) {
        return (x, y, w) -> {
            String tag = m.singleplayerOnly && m.isEnabled() && !Module.allowedHere() ? " §7(not here)" : "";
            Button b = button(x, y, w - 74, m.name + ": " + onOff(m.isEnabled()) + tag, x2 -> { m.toggle(); Modules.save(); rebuildWidgets(); });
            b.setTooltip(Tooltip.create(Component.literal(m.description)));
            button(x + w - 70, y, 70, binding == m ? "§e> ? <" : "Key: " + Modules.keyName(m.key), x2 -> { binding = m; say("Press a key for " + m.name + " (Esc = no key)", Ui.WARN); rebuildWidgets(); });
        };
    }

    private Row settingRow(Setting<?> s, Runnable save) {
        return (x, y, w) -> button(x + 16, y, w - 16, "  " + s.display(), b -> { s.cycle(true); save.run(); b.setMessage(Component.literal("  " + s.display())); });
    }

    private List<Row> moduleRows(Module.Category c) {
        List<Row> rows = new ArrayList<>();
        for (Module m : Modules.in(c)) {
            rows.add(moduleRow(m));
            for (Setting<?> s : m.settings) rows.add(settingRow(s, Modules::save));
        }
        return rows;
    }

    // ---------- Settings tab ----------
    private List<Row> settingsRows() {
        Minecraft mc = Minecraft.getInstance();
        List<Row> rows = new ArrayList<>();
        switch (section) {
            case GENERAL -> {
                rows.addAll(moduleRows(Module.Category.GENERAL));
                VexConfig c = VexConfig.get();
                rows.add((x, y, w) -> button(x, y, w, "Falling leaves in menus: " + onOff(c.menuLeaves), b -> { c.menuLeaves = !c.menuLeaves; VexConfig.save(); rebuildWidgets(); }));
            }
            case WAYPOINTS -> {
                if (mc.level == null) { rows.add(text("Join a world or server to add waypoints.", Ui.DIM)); break; }
                rows.add((x, y, w) -> {
                    EditBox box = addRenderableWidget(new EditBox(this.font, x, y, w - 104, 20, Component.literal("Name")));
                    box.setMaxLength(24);
                    box.setValue(draft);
                    box.setHint(Component.literal("Waypoint name"));
                    box.setResponder(s -> draft = s);
                    button(x + w - 100, y, 100, "Add where I am", b -> {
                        Waypoints.Waypoint wp = Waypoints.add(mc, draft);
                        if (wp != null) { say("Added " + wp.name + " at " + wp.x + " " + wp.y + " " + wp.z, Ui.GOOD); draft = ""; }
                        rebuildWidgets();
                    });
                });
                List<Waypoints.Waypoint> list = Waypoints.here(mc);
                if (list.isEmpty()) rows.add(text("No waypoints in this world yet. They show on the HUD (Display tab).", Ui.DIM));
                for (Waypoints.Waypoint wp : list) rows.add((x, y, w) -> {
                    labels.add(new Label(x + 2, y + 6, wp.name + " §7" + wp.x + " " + wp.y + " " + wp.z, Ui.TEXT));
                    button(x + w - 60, y, 60, "§cDelete", b -> { Waypoints.remove(mc, wp); rebuildWidgets(); });
                });
            }
            case FRIENDS -> {
                rows.add((x, y, w) -> {
                    EditBox box = addRenderableWidget(new EditBox(this.font, x, y, w - 74, 20, Component.literal("Player name")));
                    box.setMaxLength(16);
                    box.setValue(draft);
                    box.setHint(Component.literal("Player name"));
                    box.setResponder(s -> draft = s);
                    button(x + w - 70, y, 70, "Add friend", b -> {
                        String err = Friends.add(draft);
                        if (err != null) say(err, Ui.BAD); else { say("Added " + draft.trim(), Ui.GOOD); draft = ""; }
                        rebuildWidgets();
                    });
                });
                if (Friends.all().isEmpty()) rows.add(text("No friends yet. Friends near you show on the HUD (Display tab).", Ui.DIM));
                for (String f : Friends.all()) rows.add((x, y, w) -> {
                    boolean online = mc.getConnection() != null && mc.getConnection().getPlayerInfo(f) != null;
                    labels.add(new Label(x + 2, y + 6, f + (online ? " §a● online here" : ""), Ui.TEXT));
                    button(x + w - 60, y, 60, "§cRemove", b -> { Friends.remove(f); rebuildWidgets(); });
                });
            }
            case CONTROLS -> {
                rows.add(text("Click a key button, then press the new key. Esc clears it.", Ui.DIM));
                for (Module m : Modules.all()) rows.add((x, y, w) -> {
                    labels.add(new Label(x + 2, y + 6, m.name, Ui.TEXT));
                    button(x + w - 90, y, 90, binding == m ? "§e> ? <" : Modules.keyName(m.key), b -> { binding = m; say("Press a key for " + m.name + " (Esc = no key)", Ui.WARN); rebuildWidgets(); });
                });
                rows.add(text("Open this menu: Right Shift (change it in Options > Controls > Key Binds).", Ui.DIM));
                rows.add((x, y, w) -> button(x, y, w, "Minecraft Options…", b -> mc.setScreen(new net.minecraft.client.gui.screens.options.OptionsScreen(this, mc.options))));
            }
            case PERFORMANCE -> {
                var o = mc.options;
                rows.add((x, y, w) -> button(x, y, w, "Render distance: " + o.renderDistance().get() + " chunks", b -> { int v = o.renderDistance().get(); o.renderDistance().set(v >= 32 ? 2 : v + 2); o.save(); rebuildWidgets(); }));
                rows.add((x, y, w) -> button(x, y, w, "Simulation distance: " + o.simulationDistance().get() + " chunks", b -> { int v = o.simulationDistance().get(); o.simulationDistance().set(v >= 32 ? 5 : v + 1); o.save(); rebuildWidgets(); }));
                rows.add((x, y, w) -> button(x, y, w, "Max FPS: " + (o.framerateLimit().get() >= 260 ? "Unlimited" : o.framerateLimit().get()), b -> { int v = o.framerateLimit().get(); o.framerateLimit().set(v >= 260 ? 30 : Math.min(260, v + 30)); o.save(); rebuildWidgets(); }));
                rows.add((x, y, w) -> button(x, y, w, "VSync: " + onOff(o.enableVsync().get()), b -> { o.enableVsync().set(!o.enableVsync().get()); o.save(); rebuildWidgets(); }));
                rows.add((x, y, w) -> button(x, y, w, "Entity shadows: " + onOff(o.entityShadows().get()), b -> { o.entityShadows().set(!o.entityShadows().get()); o.save(); rebuildWidgets(); }));
                StringBuilder sb = new StringBuilder();
                for (String[] m : new String[][]{{"sodium", "Sodium"}, {"lithium", "Lithium"}, {"ferritecore", "FerriteCore"}, {"entityculling", "EntityCulling"}, {"immediatelyfast", "ImmediatelyFast"}})
                    sb.append(FabricLoader.getInstance().isModLoaded(m[0]) ? "§a✔ " : "§c✘ ").append("§f").append(m[1]).append("  ");
                rows.add(text(sb.toString().trim(), Ui.TEXT));
                rows.add(text("Presets (Potato, Balanced, Performance, Visual) are in the launcher:", Ui.DIM));
                rows.add(text("Profiles > Performance. They also install the missing mods.", Ui.DIM));
                rows.add(text("FPS pie chart: press F3 + 1 in game (Minecraft's own profiler).", Ui.DIM));
            }
            case MODS -> {
                List<ModContainer> mods = new ArrayList<>();
                for (ModContainer m : FabricLoader.getInstance().getAllMods()) {
                    String id = m.getMetadata().getId();
                    if (id.equals("java") || id.equals("minecraft") || id.startsWith("fabric-") || id.equals("mixinextras") || m.getContainingMod().isPresent()) continue;
                    mods.add(m);
                }
                mods.sort((a, b) -> a.getMetadata().getName().compareToIgnoreCase(b.getMetadata().getName()));
                rows.add(text(mods.size() + " mods loaded. Add or remove mods in the launcher (Mods page).", Ui.DIM));
                for (ModContainer m : mods) rows.add(text(m.getMetadata().getName() + " §7" + m.getMetadata().getVersion().getFriendlyString(), Ui.TEXT));
            }
            case CHEATS -> {
                boolean here = Module.allowedHere();
                rows.add(text(here ? "§aSingleplayer: cheats work in this world." : mc.level == null ? "Cheats only work in singleplayer or a LAN world you host." : "§6On a server: cheats stay off here (respects server rules).", Ui.DIM));
                rows.addAll(moduleRows(Module.Category.CHEATS));
            }
        }
        return rows;
    }

    // ---------- Display tab ----------
    private List<Row> displayRows() {
        List<Row> rows = new ArrayList<>();
        rows.add((x, y, w) -> {
            button(x, y, w - 196, "§6Edit HUD layout (drag)", b -> this.minecraft.setScreen(new HudEditorScreen(this)));
            for (int s = 1; s <= Hud.SLOTS; s++) {
                final int slot = s;
                Button b = button(x + w - 192 + (s - 1) * 44, y, 42, (Hud.activeSlot() == s ? "§6" : Hud.slotUsed(s) ? "" : "§7") + "Slot " + s, x2 -> { Hud.selectSlot(slot); say("Layout " + slot + " loaded", Ui.GOOD); rebuildWidgets(); });
                b.setTooltip(Tooltip.create(Component.literal(Hud.slotUsed(s) ? "Switch to layout " + s : "Empty: starts as a copy of the current layout")));
            }
            button(x + w - 58, y, 58, "Reset", b -> { Hud.resetPositions(); say("Positions and colours reset", Ui.GOOD); rebuildWidgets(); });
        });
        for (HudElement e : Hud.ELEMENTS) {
            rows.add((x, y, w) -> {
                int bw = (w - 6) / 4;
                button(x, y, w - bw * 3 - 6, e.name + ": " + onOff(e.enabled), b -> { e.enabled = !e.enabled; Hud.save(); rebuildWidgets(); });
                int x2 = x + w - bw * 3 - 4;
                button(x2, y, bw, colorLabel(e.color), b -> { e.color = next(e.color); Hud.save(); b.setMessage(Component.literal(colorLabel(e.color))); });
                button(x2 + bw + 2, y, bw, "Size " + Math.round(e.scale * 100) + "%", b -> {
                    e.scale = e.scale >= 2f ? 0.5f : Math.round((e.scale + 0.25f) * 100) / 100f; Hud.save();
                    b.setMessage(Component.literal("Size " + Math.round(e.scale * 100) + "%"));
                });
                button(x2 + bw * 2 + 4, y, bw, "Box: " + onOff(e.background), b -> { e.background = !e.background; Hud.save(); b.setMessage(Component.literal("Box: " + onOff(e.background))); });
            });
            for (Setting<?> s : e.settings) rows.add(settingRow(s, Hud::save));
        }
        return rows;
    }

    private static int next(int c) {
        int[] p = Setting.Color.PALETTE;
        for (int i = 0; i < p.length; i++) if (p[i] == c) return p[(i + 1) % p.length];
        return p[0];
    }

    private static String colorLabel(int c) {
        int[] p = Setting.Color.PALETTE;
        for (int i = 0; i < p.length; i++) if (p[i] == c) return Setting.Color.NAMES[i];
        return "Custom";
    }

    // ---------- Shaders tab ----------
    private List<Row> shaderRows() {
        List<Row> rows = new ArrayList<>();
        boolean iris = Shaders.irisLoaded();
        if (!iris) {
            rows.add(text("§cIris isn't installed, so shaders can't run.", Ui.TEXT));
            rows.add(text("Install it in the launcher: Shaders page (adds Iris + Sodium).", Ui.DIM));
        } else {
            rows.add(text("Iris " + Shaders.irisVersion() + (Shaders.sodiumLoaded() ? " §a+ Sodium" : " §6without Sodium (Iris needs it)"), Ui.TEXT));
            Boolean on = Shaders.enabled();
            rows.add((x, y, w) -> {
                button(x, y, w / 2 - 2, "Shaders: " + (on == null ? "§7unknown" : onOff(on)), b -> {
                    String err = Shaders.setEnabled(on == null || !on);
                    if (err != null) say(err, Ui.BAD); else say("Shaders " + (on == null || !on ? "on" : "off"), Ui.GOOD);
                    rebuildWidgets();
                });
                button(x + w / 2 + 2, y, w / 2 - 2, "Iris shader settings…", b -> {
                    Screen s = Shaders.irisScreen(this);
                    if (s != null) this.minecraft.setScreen(s); else say("Couldn't open Iris's screen; use Options > Video > Shader Packs", Ui.BAD);
                });
            });
        }
        rows.add((x, y, w) -> button(x, y, w, "Open shaderpacks folder", b -> Shaders.openFolder()));
        List<Shaders.Pack> packs = Shaders.packs();
        String sel = Shaders.selected();
        if (packs.isEmpty()) rows.add(text("No shader packs yet. Get some in the launcher (Shaders page) or drop .zip files in the folder.", Ui.DIM));
        for (Shaders.Pack p : packs) rows.add((x, y, w) -> {
            boolean current = p.name().equals(sel);
            String name = p.name().length() > 38 ? p.name().substring(0, 36) + "…" : p.name();
            labels.add(new Label(x + 2, y + 2, (current ? "§6★ " : "") + name, Ui.TEXT));
            labels.add(new Label(x + 2, y + 12, p.warning() != null ? "§6⚠ " + p.warning() : "§7" + (p.folder() ? "folder" : "zip") + " · works with Iris", Ui.DIM));
            Button b = button(x + w - 70, y, 70, current ? "In use" : "Use", x2 -> {
                String err = Shaders.select(p.name());
                if (err != null) say(err, Ui.BAD); else say("Loading " + p.name() + "… (can take a few seconds)", Ui.GOOD);
                rebuildWidgets();
            });
            b.active = iris && !current;
        });
        return rows;
    }

    // ---------- events ----------
    @Override
    public void tick() {
        super.tick();
        if (binding != null) {
            if (Modules.keyDown(GLFW.GLFW_KEY_ESCAPE)) { binding.key = -1; finishBind(); return; }
            int k = Modules.pollPressedKey();
            if (k >= 0) { binding.key = k; finishBind(); }
        }
    }

    private void finishBind() {
        say(binding.name + " key: " + Modules.keyName(binding.key), Ui.GOOD);
        binding = null;
        Modules.save();
        rebuildWidgets();
    }

    @Override
    public boolean shouldCloseOnEsc() { return binding == null; }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float pt) {
        super.renderBackground(g, mouseX, mouseY, pt);
        Ui.panel(g, px0, py0, px1, py1, true);
        Ui.title(g, this.font, this.width / 2, py0 + 7, 1.6f);
        Ui.box(g, cx0 - 4, cy0 - 4, cx1 + 4, cy1 + 2);
        if (tab == Tab.SETTINGS) g.fill(px0 + 96, cy0 - 4, px0 + 97, cy1 + 2, Ui.EDGE);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float pt) {
        super.render(g, mouseX, mouseY, pt);
        for (Label l : labels) g.drawString(this.font, l.text(), l.x(), l.y(), l.color(), true);
        if (status != null && System.currentTimeMillis() < statusUntil) {
            int sw = this.font.width(status);
            int x = Math.max(px0 + 8, Math.min(px1 - 98 - sw, this.width / 2 - sw / 2));
            g.drawString(this.font, status, x, py1 - 19, statusColor, true);
        }
        g.drawString(this.font, "§7" + tab.label + (tab == Tab.SETTINGS ? " › " + section.label : ""), px0 + 8, py0 + 8, Ui.DIM, false);
    }

    @Override
    public void onClose() {
        Modules.save();
        Hud.save();
        this.minecraft.setScreen(parent);
    }
}
