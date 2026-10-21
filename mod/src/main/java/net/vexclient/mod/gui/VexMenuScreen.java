package net.vexclient.mod.gui;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
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
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import java.util.function.DoubleSupplier;
import java.util.function.IntConsumer;

/**
 * One page of the VEX menu (opened from a petal of the Right Shift menu): Client, Combat, Misc, Mod Menu
 * or GUI Settings. Everything is drawn by hand in the VEX style and saved straight away.
 * Esc or "‹ Menu" goes back to the petals; Right Shift closes everything.
 */
public final class VexMenuScreen extends VexScreen {
    public enum Page {
        // the five circles of the Right Shift menu
        HUD("HUD", "HUD"),
        UTILITY("Utility", "Modules", "Combat", "Waypoints", "Friends", "Controls", "Performance", "Mod Menu"),
        VISUALS("Visuals", "Visuals", "Shaders"),
        GUI("Settings", "GUI Settings"),
        DESIGN("Design", "Design"),
        // older pages, still reachable from search
        CLIENT("Client", "Modules", "HUD", "Waypoints", "Friends", "Controls", "Performance"),
        COMBAT("Combat", "Combat"),
        MISC("Misc", "Modules", "Shaders"),
        MODS("Mod Menu", "Mods"),
        ALL("Every module", "All");
        public final String title;
        public final String[] sections;
        Page(String title, String... sections) { this.title = title; this.sections = sections; }
    }

    /** {name, description} of every GUI setting (also used by the search). */
    public static final String[][] GUI_SETTINGS = {
            {"Show Particles", "Petals drifting behind the VEX menus"},
            {"Background Dim", "Darken the game behind the VEX menus"},
            {"Tooltips", "Help text when you hover things in the VEX menus"},
            {"Always Show Advanced", "Show every module's options, even while it's off"},
            {"Edit HUD Layout", "Drag your HUD elements around"},
            {"Notification Sound", "A click when a keybind switches a module on or off"},
            {"Themes", "Colours of the VEX menus"},
            {"GUI Scale", "Size of the VEX menus"},
            {"Auto Switch Profiles", "Each server or world remembers its own HUD layout"},
            {"VEX badges", "Grey V in front of VEX players in the tab list and above their heads"},
    };

    private static final String VERSION = FabricLoader.getInstance().getModContainer("vexclient").map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("?");
    private final Screen back;
    private final Page page;
    private int section;

    // layout of this frame
    private int px0, py0, px1, py1, vx0, vy0, vx1, vy1;
    private int cursor;
    private double scroll, maxScroll;
    private boolean draggingBar;
    private String dragSlider;
    private Module binding;
    private String status;
    private int statusColor;
    private long statusUntil;

    public VexMenuScreen(Screen back, Screen root, Page page, int section) {
        super("VEX CLIENT · " + page.title, root);
        this.back = back;
        this.page = page;
        this.section = Math.max(0, Math.min(page.sections.length - 1, section));
    }

    private void say(String msg, int color) { status = msg; statusColor = color; statusUntil = System.currentTimeMillis() + 5000; }
    private static void save() { Modules.save(); Hud.save(); }

    private boolean inView() { return over(vx0, vy0, vx1, vy1); }
    private boolean hot(int x0, int y0, int x1, int y1) { return inView() && over(x0, y0, x1, y1) && dragSlider == null && !draggingBar; }
    private boolean click(int x0, int y0, int x1, int y1) { return pressed && hot(x0, y0, x1, y1); }

    @Override
    public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
        scroll = Math.max(0, Math.min(maxScroll, scroll - scrollY * 24));
        return true;
    }

    @Override
    public void tick() {
        if (binding != null) {
            if (Modules.keyDown(GLFW.GLFW_KEY_ESCAPE)) { binding.key = -1; finishBind(); return; }
            int k = Modules.pollPressedKey();
            if (k >= 0 && k != GLFW.GLFW_KEY_ESCAPE) { binding.key = k; finishBind(); }
            return;
        }
        super.tick();
    }

    private void finishBind() {
        say(binding.name + " key: " + Modules.keyName(binding.key), Ui.GOOD);
        binding = null;
        Modules.save();
    }

    @Override public boolean shouldCloseOnEsc() { return binding == null; }

    @Override
    public void onClose() {
        save();
        mc.setScreen(back);
    }

    // ---------- frame ----------
    @Override
    protected void draw() {
        if (released) { if (dragSlider != null) { save(); mc.options.save(); } dragSlider = null; draggingBar = false; }
        int w = Math.min(W - 24, 520), h = Math.min(H - 24, 310);
        px0 = (W - w) / 2; py0 = (H - h) / 2; px1 = px0 + w; py1 = py0 + h;
        Ui.panel(g, px0, py0, px1, py1);

        // header: logo, page name, back
        Ui.title(g, this.font, px0 + 12, py0 + 11, 1.3f);
        int tx = px0 + 18 + Ui.titleWidth(this.font, 1.3f);
        g.drawString(this.font, "›  " + page.title, tx, py0 + 14, Ui.DIM, false);
        String backLabel = "‹ Menu";
        int bw = this.font.width(backLabel) + 18;
        boolean bh = over(px1 - 10 - bw, py0 + 8, px1 - 10, py0 + 25);
        Ui.chip(g, this.font, px1 - 10 - bw, py0 + 8, px1 - 10, py0 + 25, backLabel, 0, bh, true);
        if (bh && pressed) { sound(); onClose(); return; }
        g.fill(px0 + 1, py0 + 33, px1 - 1, py0 + 34, Ui.EDGE);

        // sidebar (pages with more than one section)
        int sx1 = px0;
        if (page.sections.length > 1) {
            sx1 = px0 + 104;
            g.fill(px0 + 1, py0 + 34, sx1, py1 - 1, Ui.SIDE);
            g.fill(sx1, py0 + 34, sx1 + 1, py1 - 1, Ui.EDGE);
            int y = py0 + 40, step = Math.max(14, Math.min(20, (py1 - 8 - y) / page.sections.length)), ih = step - 2;
            for (int i = 0; i < page.sections.length; i++) {
                boolean sel = i == section, hv = over(px0 + 4, y, sx1 - 4, y + ih);
                if (sel) { Ui.round(g, px0 + 4, y, sx1 - 4, y + ih, Ui.CARD_HOVER); g.fill(px0 + 4, y + 3, px0 + 6, y + ih - 3, Ui.ORANGE); }
                else if (hv) Ui.round(g, px0 + 4, y, sx1 - 4, y + ih, Ui.CARD);
                g.drawString(this.font, page.sections[i], px0 + 12, y + ih / 2 - 4, sel || hv ? Ui.TEXT : Ui.DIM, false);
                if (pressed && hv && !sel) { section = i; scroll = 0; binding = null; input.setValue(""); sound(); }
                y += step;
            }
        }

        // content
        vx0 = sx1 + 10; vy0 = py0 + 40; vx1 = px1 - 14; vy1 = py1 - 26;
        g.enableScissor(vx0 - 2, vy0 - 2, vx1 + 2, vy1);
        cursor = 0;
        try {
            switch (page) {
                case CLIENT -> clientContent(page.sections[section]);
                case COMBAT -> combatContent();
                case MISC -> { if (section == 0) moduleList(Module.Category.MISC, "Misc", "Handy extras. Click a card to switch it, click the key to rebind."); else shaderContent(); }
                case MODS -> modsContent();
                case GUI -> guiContent();
                case HUD -> { clientContent("HUD"); heading("Combat HUD", null); for (HudElement e : Hud.ELEMENTS) if (e.combat) hudRow(e); }
                case UTILITY -> {
                    String sec = page.sections[section];
                    if (sec.equals("Combat")) combatContent(); else if (sec.equals("Mod Menu")) modsContent(); else clientContent(sec);
                }
                case VISUALS -> { if (section == 0) moduleList(Module.Category.MISC, "Visuals", "Zoom, fullbright and more. Click a card to switch it, click the key to rebind."); else shaderContent(); }
                case DESIGN -> designContent();
                case ALL -> allContent();
            }
        } finally { g.disableScissor(); }
        maxScroll = Math.max(0, cursor - (vy1 - vy0));
        scroll = Math.max(0, Math.min(maxScroll, scroll));

        // scrollbar
        if (maxScroll > 0) {
            int bx = px1 - 9, trackH = vy1 - vy0;
            int barH = Math.max(18, (int) (trackH * (trackH / (double) (trackH + maxScroll))));
            int by = vy0 + (int) ((trackH - barH) * (scroll / maxScroll));
            boolean hv = over(bx - 2, vy0, bx + 5, vy1);
            g.fill(bx, vy0, bx + 3, vy1, 0x40FFFFFF);
            Ui.round(g, bx - 1, by, bx + 4, by + barH, hv || draggingBar ? Ui.ORANGE_HI : Ui.ORANGE);
            if (pressed && hv) draggingBar = true;
            if (draggingBar && down) scroll = Math.max(0, Math.min(maxScroll, (my - vy0 - barH / 2.0) / (trackH - barH) * maxScroll));
        }

        // footer
        g.fill(sx1 + 1, py1 - 22, px1 - 1, py1 - 21, Ui.EDGE_SOFT);
        if (status != null && System.currentTimeMillis() < statusUntil) g.drawString(this.font, this.font.plainSubstrByWidth(status, px1 - sx1 - 90), sx1 + 10, py1 - 15, statusColor, false);
        else g.drawString(this.font, "v" + VERSION + " · Esc = back · Right Shift = close", sx1 + 10, py1 - 15, Ui.alpha(Ui.DIM, 0.75f), false);
        boolean hv = over(px1 - 62, py1 - 19, px1 - 8, py1 - 5);
        Ui.chip(g, this.font, px1 - 62, py1 - 19, px1 - 8, py1 - 5, "Done", 1, hv, true);
        if (pressed && hv) { sound(); save(); closeAll(); }
    }

    // ---------- row builders (immediate mode: each call draws one row and handles its clicks) ----------
    private int rowY() { return vy0 + cursor - (int) scroll; }
    private boolean visible(int y, int h) { return y + h > vy0 - 4 && y < vy1 + 4; }

    private void heading(String title, String sub) {
        List<FormattedCharSequence> lines = sub == null ? List.of() : this.font.split(Component.literal(sub), vx1 - vx0 - 4);
        int y = rowY(), h = 16 + lines.size() * 10;
        if (visible(y, h)) {
            g.drawString(this.font, title, vx0, y + 2, Ui.TEXT, true);
            g.fill(vx0, y + 12, vx0 + this.font.width(title), y + 13, Ui.ORANGE);
            for (int i = 0; i < lines.size(); i++) g.drawString(this.font, lines.get(i), vx0, y + 17 + i * 10, Ui.DIM, false);
        }
        cursor += h + (lines.isEmpty() ? 2 : 6);
    }

    private void text(String s, int color) {
        List<FormattedCharSequence> lines = this.font.split(Component.literal(s), vx1 - vx0 - 4);
        int y = rowY();
        for (int i = 0; i < lines.size(); i++) if (visible(y + i * 10, 10)) g.drawString(this.font, lines.get(i), vx0 + 2, y + i * 10, color, false);
        cursor += lines.size() * 10 + 6;
    }

    private int cardStart(int h, boolean hoverable) {
        int y = rowY();
        if (visible(y, h)) Ui.card(g, vx0, y, vx1, y + h, hoverable && hot(vx0, y, vx1, y + h) ? Ui.CARD_HOVER : Ui.CARD, Ui.EDGE_SOFT);
        return y;
    }
    private void cardEnd(int h) { cursor += h + 4; }

    private List<FormattedCharSequence> descLines(String desc, int maxW) {
        List<FormattedCharSequence> l = this.font.split(Component.literal(desc), Math.max(40, maxW));
        return l.size() > 2 ? l.subList(0, 2) : l;
    }
    private int cardH(String desc, int rightSpace) { return desc == null ? 22 : 20 + descLines(desc, vx1 - vx0 - 16 - rightSpace).size() * 10; }

    private void titleAndDesc(int y, int h, String title, String desc, int rightSpace) {
        int maxW = vx1 - vx0 - 16 - rightSpace;
        if (desc == null) g.drawString(this.font, this.font.plainSubstrByWidth(title, maxW), vx0 + 8, y + h / 2 - 4, Ui.TEXT, false);
        else {
            g.drawString(this.font, this.font.plainSubstrByWidth(title, maxW), vx0 + 8, y + 6, Ui.TEXT, false);
            List<FormattedCharSequence> lines = descLines(desc, maxW);
            for (int i = 0; i < lines.size(); i++) g.drawString(this.font, lines.get(i), vx0 + 8, y + 17 + i * 10, Ui.DIM, false);
        }
    }

    private boolean toggleRow(String id, String title, String desc, boolean on) {
        int h = cardH(desc, 30), y = cardStart(h, true);
        boolean clicked = false;
        if (visible(y, h)) {
            titleAndDesc(y, h, title, desc, 30);
            Ui.toggle(g, vx1 - 30, y + h / 2 - 5, animate(id, on), hot(vx0, y, vx1, y + h));
            clicked = click(vx0, y, vx1, y + h);
            if (clicked) sound();
        }
        cardEnd(h);
        return clicked;
    }

    private void sliderRow(String id, String title, double min, double max, double step, DoubleSupplier get, DoubleConsumer set, DoubleFunction<String> fmt) {
        int h = 30, y = cardStart(h, false);
        if (visible(y, h)) {
            double v = get.getAsDouble();
            String val = fmt.apply(v);
            g.drawString(this.font, title, vx0 + 8, y + 5, Ui.TEXT, false);
            g.drawString(this.font, val, vx1 - 8 - this.font.width(val), y + 5, Ui.ORANGE, false);
            int sx0 = vx0 + 10, sx1 = vx1 - 10, sy = y + 16;
            boolean hv = inView() && over(sx0 - 4, sy - 2, sx1 + 4, sy + 13);
            if (pressed && hv && dragSlider == null) { dragSlider = id; sound(); }
            boolean active = id.equals(dragSlider);
            if (active && down) {
                double f = Math.max(0, Math.min(1, (mx - sx0) / (double) (sx1 - sx0)));
                double nv = Math.max(min, Math.min(max, Math.round((min + f * (max - min)) / step) * step));
                if (nv != v) { set.accept(nv); v = nv; }
            }
            Ui.slider(g, sx0, sy, sx1, (float) ((v - min) / (max - min)), active || hv);
        }
        cardEnd(h);
    }

    /** Value chip on the right: left click = next, right click = previous. Returns -1, 0 or +1. */
    private int cycleRow(String title, String desc, String value) {
        int cw = Math.max(60, this.font.width(value) + 24);
        int h = cardH(desc, cw + 4), y = cardStart(h, true), r = 0;
        if (visible(y, h)) {
            titleAndDesc(y, h, title, desc, cw + 4);
            boolean hv = hot(vx0, y, vx1, y + h);
            Ui.chip(g, this.font, vx1 - 6 - cw, y + h / 2 - 7, vx1 - 6, y + h / 2 + 7, "‹ " + value + " ›", 0, hv, true);
            if (click(vx0, y, vx1, y + h)) { r = 1; sound(); }
            else if (rpressed && hot(vx0, y, vx1, y + h)) { r = -1; sound(); }
        }
        cardEnd(h);
        return r;
    }

    /** Title on the left, a row of options on the right (like 1x / 2x / 3x). Returns the option clicked or -1. */
    private int segmentRow(String title, String desc, String[] options, int selected) {
        int ow = 0;
        for (String o : options) ow = Math.max(ow, this.font.width(o) + 14);
        int total = ow * options.length + 2 * (options.length - 1) + 4;
        int h = cardH(desc, total + 6), y = cardStart(h, false), r = -1;
        if (visible(y, h)) {
            titleAndDesc(y, h, title, desc, total + 6);
            int x = vx1 - 6 - total;
            Ui.round(g, x, y + h / 2 - 8, x + total, y + h / 2 + 8, Ui.SIDE);
            for (int i = 0; i < options.length; i++) {
                int x0 = x + 2 + i * (ow + 2), y0 = y + h / 2 - 6;
                boolean sel = i == selected, hv = hot(x0, y0, x0 + ow, y0 + 12);
                if (sel) Ui.round(g, x0, y0, x0 + ow, y0 + 12, Ui.ORANGE); else if (hv) Ui.round(g, x0, y0, x0 + ow, y0 + 12, Ui.CARD_HOVER);
                g.drawString(this.font, options[i], x0 + ow / 2 - this.font.width(options[i]) / 2, y0 + 2, sel ? Ui.ON_ACCENT : hv ? Ui.TEXT : Ui.DIM, false);
                if (click(x0, y0, x0 + ow, y0 + 12) && !sel) { r = i; sound(); }
            }
        }
        cardEnd(h);
        return r;
    }

    private void colorRow(String title, int current, IntConsumer set) {
        int h = 22, y = cardStart(h, false);
        if (visible(y, h)) {
            int n = Setting.Color.PALETTE.length, sw = 12, gap = 3, x = vx1 - 6 - n * (sw + gap) + gap;
            titleAndDesc(y, h, title, null, n * (sw + gap) + 4);
            for (int i = 0; i < n; i++) {
                int c = Setting.Color.PALETTE[i], x0 = x + i * (sw + gap), y0 = y + 5;
                boolean sel = c == current, hv = hot(x0, y0, x0 + sw, y0 + sw);
                if (sel || hv) Ui.round(g, x0 - 2, y0 - 2, x0 + sw + 2, y0 + sw + 2, sel ? Ui.ORANGE : 0xFFFFFFFF);
                Ui.round(g, x0, y0, x0 + sw, y0 + sw, c);
                if (click(x0, y0, x0 + sw, y0 + sw)) { set.accept(c); sound(); }
            }
        }
        cardEnd(h);
    }

    /** A row of chips; returns the index clicked or -1. style per chip: 0 normal, 1 accent, 2 danger. */
    private int buttons(String[] labels, int[] styles) {
        int h = 18, y = rowY(), r = -1;
        if (visible(y, h)) {
            int gap = 4, w = (vx1 - vx0 - gap * (labels.length - 1)) / labels.length;
            for (int i = 0; i < labels.length; i++) {
                int x0 = vx0 + i * (w + gap), x1 = i == labels.length - 1 ? vx1 : x0 + w;
                boolean hv = hot(x0, y, x1, y + h);
                Ui.chip(g, this.font, x0, y, x1, y + h, this.font.plainSubstrByWidth(labels[i], x1 - x0 - 8), styles[i], hv, true);
                if (click(x0, y, x1, y + h)) { r = i; sound(); }
            }
        }
        cursor += h + 6;
        return r;
    }

    private boolean itemRow(String title, String desc, int titleColor, String action, int style, boolean enabled) {
        int cw = Math.max(48, this.font.width(action) + 16), h = cardH(desc, cw + 4), y = cardStart(h, false);
        boolean clicked = false;
        if (visible(y, h)) {
            int maxW = vx1 - vx0 - cw - 20;
            g.drawString(this.font, this.font.plainSubstrByWidth(title, maxW), vx0 + 8, desc == null ? y + 7 : y + 6, titleColor, false);
            if (desc != null) { List<FormattedCharSequence> dl = descLines(desc, maxW); for (int i = 0; i < dl.size(); i++) g.drawString(this.font, dl.get(i), vx0 + 8, y + 17 + i * 10, Ui.DIM, false); }
            int x0 = vx1 - 6 - cw, y0 = y + h / 2 - 7;
            boolean hv = enabled && hot(x0, y0, vx1 - 6, y0 + 14);
            Ui.chip(g, this.font, x0, y0, vx1 - 6, y0 + 14, action, style, hv, enabled);
            if (enabled && click(x0, y0, vx1 - 6, y0 + 14)) { clicked = true; sound(); }
        }
        cardEnd(h);
        return clicked;
    }

    /** Text field + button; true when the button was clicked (read input.getValue()). */
    private boolean inputRow(String hint, String action) {
        int h = 26, y = cardStart(h, false), bw = Math.max(64, this.font.width(action) + 18);
        boolean clicked = false;
        Ui.round(g, vx0 + 4, y + 4, vx1 - bw - 10, y + 22, Ui.SIDE);
        drawInput(vx0 + 9, y + 9, vx1 - vx0 - bw - 22, hint);
        if (visible(y, h)) {
            boolean hv = hot(vx1 - 6 - bw, y + 5, vx1 - 6, y + 21);
            Ui.chip(g, this.font, vx1 - 6 - bw, y + 5, vx1 - 6, y + 21, action, 1, hv, true);
            if (click(vx1 - 6 - bw, y + 5, vx1 - 6, y + 21)) { clicked = true; sound(); }
        }
        cardEnd(h);
        return clicked;
    }

    private void moduleRow(Module m) {
        String keyLabel = binding == m ? "Press a key…" : Modules.keyName(m.key);
        int kw = Math.max(36, this.font.width(keyLabel) + 12);
        int h = cardH(m.description, kw + 40), y = cardStart(h, true);
        if (visible(y, h)) {
            titleAndDesc(y, h, m.name, m.description, kw + 40);
            int kx0 = vx1 - 36 - kw, ky0 = y + h / 2 - 7;
            boolean khv = hot(kx0, ky0, kx0 + kw, ky0 + 14);
            Ui.chip(g, this.font, kx0, ky0, kx0 + kw, ky0 + 14, keyLabel, binding == m ? 1 : 0, khv, true);
            Ui.toggle(g, vx1 - 30, y + h / 2 - 5, animate("m." + m.id, m.isEnabled()), hot(vx0, y, vx1, y + h) && !khv);
            if (khv) tip("Click, then press a key. Esc = no key.");
            if (click(kx0, ky0, kx0 + kw, ky0 + 14)) { binding = m; say("Press a key for " + m.name + " (Esc = no key)", Ui.WARN); sound(); }
            else if (click(vx0, y, vx1, y + h)) { m.toggle(); Modules.save(); sound(); }
        }
        cardEnd(h);
        if (m.isEnabled() || VexConfig.get().alwaysShowAdvanced) for (Setting<?> s : m.settings) settingRow(m.id + "." + s.id, s, Modules::save, 14);
    }

    private void settingRow(String id, Setting<?> s, Runnable save, int indent) {
        int oldX = vx0;
        vx0 += indent;
        if (s instanceof Setting.Bool b) { if (toggleRow(id, b.name, null, b.get())) { b.cycle(true); save.run(); } }
        else if (s instanceof Setting.Num n) sliderRow(id, n.name, n.min, n.max, n.step, n::get, v -> n.set(v), v -> (n.step >= 1 ? String.valueOf((long) Math.round(v)) : String.format("%.2f", v)) + n.unit);
        else if (s instanceof Setting.Color c) colorRow(c.name, c.get(), v -> { c.set(v); save.run(); });
        else if (s instanceof Setting.Choice c) { int r = cycleRow(c.name, null, c.get()); if (r != 0) { c.cycle(r > 0); save.run(); } }
        vx0 = oldX;
    }

    /** A HUD element: switch, and (when on, or Always Show Advanced) colour, size, background and its own options. */
    private void hudRow(HudElement e) {
        if (toggleRow("hud." + e.id, e.name, null, e.enabled)) { e.enabled = !e.enabled; Hud.save(); }
        if (!e.enabled && !VexConfig.get().alwaysShowAdvanced) return;
        int oldX = vx0;
        vx0 += 14;
        colorRow("Colour", e.color, c -> { e.color = c; Hud.save(); });
        sliderRow("scale." + e.id, "Size", 0.5, 2.5, 0.05, () -> e.scale, v -> e.scale = (float) v, v -> Math.round(v * 100) + "%");
        if (toggleRow("bg." + e.id, "Background box", null, e.background)) { e.background = !e.background; Hud.save(); }
        vx0 = oldX;
        for (Setting<?> s : e.settings) settingRow("hud." + e.id + "." + s.id, s, Hud::save, 14);
    }

    private void moduleList(Module.Category c, String title, String sub) {
        heading(title, sub);
        for (Module m : Modules.in(c)) moduleRow(m);
    }

    // ---------- Client ----------
    private void clientContent(String s) {
        switch (s) {
            case "Modules" -> {
                moduleList(Module.Category.CLIENT, "Client", "Everyday features. Click a card to switch it, click the key to rebind.");
                VexConfig c = VexConfig.get();
                if (toggleRow("menuLeaves", "Falling leaves in menus", "Leaves behind the title screen", c.menuLeaves)) { c.menuLeaves = !c.menuLeaves; VexConfig.save(); }
            }
            case "HUD" -> {
                heading("HUD", "Drag elements around and keep up to three layouts (a dot = empty, starts as a copy).");
                int b = buttons(new String[]{"Edit layout (drag)", "Reset positions"}, new int[]{1, 0});
                if (b == 0) { mc.setScreen(new HudEditorScreen(this)); return; }
                if (b == 1) { Hud.resetPositions(); say("Positions and colours reset", Ui.GOOD); }
                layoutButtons();
                heading("Elements", null);
                for (HudElement e : Hud.ELEMENTS) if (!e.combat) hudRow(e);
            }
            case "Waypoints" -> {
                heading("Waypoints", "Saved per server or world. They show on the HUD with distance and direction.");
                if (mc.level == null) { text("Join a world or server to add waypoints.", Ui.DIM); return; }
                if (inputRow("Waypoint name", "Add here")) {
                    Waypoints.Waypoint wp = Waypoints.add(mc, input.getValue());
                    if (wp != null) { say("Added " + wp.name + " at " + wp.x + " " + wp.y + " " + wp.z, Ui.GOOD); input.setValue(""); }
                }
                List<Waypoints.Waypoint> list = new ArrayList<>(Waypoints.here(mc));
                if (list.isEmpty()) text("No waypoints in this world yet.", Ui.DIM);
                for (Waypoints.Waypoint wp : list) {
                    int dist = mc.player == null ? 0 : (int) Math.sqrt(Math.pow(wp.x - mc.player.getX(), 2) + Math.pow(wp.z - mc.player.getZ(), 2));
                    if (itemRow(wp.name, wp.x + " " + wp.y + " " + wp.z + " · " + dist + " m away", Ui.TEXT, "Delete", 2, true)) Waypoints.remove(mc, wp);
                }
            }
            case "Friends" -> {
                heading("Friends", "Friends near you show on the HUD (Friends nearby).");
                if (inputRow("Player name", "Add friend")) {
                    String name = input.getValue().trim();
                    String err = Friends.add(name);
                    if (err != null) say(err, Ui.BAD); else { say("Added " + name, Ui.GOOD); input.setValue(""); }
                }
                List<String> list = new ArrayList<>(Friends.all());
                if (list.isEmpty()) text("No friends yet.", Ui.DIM);
                for (String f : list) {
                    boolean online = mc.getConnection() != null && mc.getConnection().getPlayerInfo(f) != null;
                    if (itemRow(f, online ? "Online on this server" : "Not here right now", online ? Ui.GOOD : Ui.TEXT, "Remove", 2, true)) Friends.remove(f);
                }
            }
            case "Controls" -> {
                heading("Controls", "Click a key, then press the new one. Esc clears it.");
                for (Module m : Modules.all()) {
                    String key = binding == m ? "Press a key…" : Modules.keyName(m.key);
                    if (itemRow(m.name, m.category.label, Ui.TEXT, key, binding == m ? 1 : 0, true)) { binding = m; say("Press a key for " + m.name + " (Esc = no key)", Ui.WARN); }
                }
                text("The VEX menu opens with Right Shift; change that in Options › Controls › Key Binds.", Ui.DIM);
            }
            case "Performance" -> performanceContent();
            default -> {}
        }
    }

    private void layoutButtons() {
        String[] slots = new String[Hud.SLOTS];
        int[] st = new int[Hud.SLOTS];
        for (int s = 1; s <= Hud.SLOTS; s++) { slots[s - 1] = "Layout " + s + (Hud.slotUsed(s) || Hud.activeSlot() == s ? "" : " ·"); st[s - 1] = Hud.activeSlot() == s ? 1 : 0; }
        int pick = buttons(slots, st);
        if (pick >= 0) { Hud.selectSlot(pick + 1); Hud.rememberForHere(mc); say("Layout " + (pick + 1) + " loaded", Ui.GOOD); }
    }

    private void performanceContent() {
        var o = mc.options;
        heading("Performance", "Changes apply instantly and are saved to Minecraft's options.");
        sliderRow("rd", "Render distance", 2, 32, 1, () -> o.renderDistance().get(), v -> o.renderDistance().set((int) v), v -> (int) v + " chunks");
        sliderRow("sd", "Simulation distance", 5, 32, 1, () -> o.simulationDistance().get(), v -> o.simulationDistance().set((int) v), v -> (int) v + " chunks");
        sliderRow("fps", "Max FPS", 10, 260, 10, () -> o.framerateLimit().get(), v -> o.framerateLimit().set((int) v), v -> v >= 260 ? "Unlimited" : (int) v + " FPS");
        if (toggleRow("vsync", "VSync", "Stops tearing; caps FPS at your screen's refresh rate", o.enableVsync().get())) { o.enableVsync().set(!o.enableVsync().get()); o.save(); }
        if (toggleRow("shadows", "Entity shadows", "Turning this off gives a few FPS in crowded places", o.entityShadows().get())) { o.entityShadows().set(!o.entityShadows().get()); o.save(); }
        heading("Performance mods", "Add them to this instance in the VEX launcher (MODS).");
        String[][] mods = {{"sodium", "Sodium", "Much faster rendering"}, {"lithium", "Lithium", "Faster game logic"}, {"ferritecore", "FerriteCore", "Less memory"},
                {"entityculling", "EntityCulling", "Skips hidden mobs and chests"}, {"immediatelyfast", "ImmediatelyFast", "Faster HUD and text"}};
        for (String[] m : mods) {
            boolean on = FabricLoader.getInstance().isModLoaded(m[0]);
            itemRow(m[1], m[2], on ? Ui.TEXT : Ui.DIM, on ? "Loaded" : "Missing", on ? 0 : 2, false);
        }
    }

    // ---------- Combat ----------
    private void combatContent() {
        heading("Combat", "Information for fights, from your own screen only. Addons, no hacks: nothing here aims, clicks or moves for you.");
        for (Module m : Modules.in(Module.Category.COMBAT)) moduleRow(m);
        heading("Combat HUD", "Shown on your screen while playing. Move them with Edit HUD.");
        for (HudElement e : Hud.ELEMENTS) if (e.combat) hudRow(e);
        if (buttons(new String[]{"Edit HUD layout…"}, new int[]{1}) == 0) mc.setScreen(new HudEditorScreen(this));
    }

    // ---------- Design ----------
    private void designContent() {
        VexConfig c = VexConfig.get();
        heading("Design", "How VEX looks in game.");
        int r = cycleRow(GUI_SETTINGS[6][0], GUI_SETTINGS[6][1], Ui.theme());
        if (r != 0) {
            List<String> names = new ArrayList<>(Ui.THEMES.keySet());
            int i = Math.max(0, names.indexOf(Ui.theme()));
            c.theme = names.get((i + (r > 0 ? 1 : names.size() - 1)) % names.size());
            Ui.apply(c.theme);
            input.setTextColor(Ui.TEXT);
            VexConfig.save();
        }
        int pick = segmentRow(GUI_SETTINGS[7][0], GUI_SETTINGS[7][1], new String[]{"Auto", "1x", "2x", "3x"}, c.guiScale);
        if (pick >= 0) { c.guiScale = pick; VexConfig.save(); }
        if (toggleRow("d.particles", GUI_SETTINGS[0][0], GUI_SETTINGS[0][1], c.showParticles)) { c.showParticles = !c.showParticles; VexConfig.save(); }
        if (toggleRow("d.dim", GUI_SETTINGS[1][0], GUI_SETTINGS[1][1], c.backgroundDim)) { c.backgroundDim = !c.backgroundDim; VexConfig.save(); }
        if (toggleRow("d.badges", GUI_SETTINGS[9][0], GUI_SETTINGS[9][1], c.vexBadges)) { c.vexBadges = !c.vexBadges; VexConfig.save(); }
        if (toggleRow("d.leaves", "Falling leaves in menus", "Leaves behind the title screen", c.menuLeaves)) { c.menuLeaves = !c.menuLeaves; VexConfig.save(); }
    }

    // ---------- Every module (click your face in the Right Shift menu) ----------
    private void allContent() {
        for (Module.Category c : Module.Category.values()) {
            heading(c.label, null);
            for (Module m : Modules.in(c)) moduleRow(m);
        }
        heading("HUD", "Shown on your screen while playing. Move them with Edit HUD.");
        for (HudElement e : Hud.ELEMENTS) hudRow(e);
    }

    // ---------- Mod Menu ----------
    private static Screen modMenuScreen(Screen parent) {
        try {
            Class<?> c = Class.forName("com.terraformersmc.modmenu.gui.ModsScreen");
            return (Screen) c.getConstructor(Screen.class).newInstance(parent);
        } catch (Throwable t) { return null; }
    }

    private void modsContent() {
        List<ModContainer> mods = new ArrayList<>();
        for (ModContainer m : FabricLoader.getInstance().getAllMods()) {
            String id = m.getMetadata().getId();
            if (id.equals("java") || id.equals("minecraft") || id.startsWith("fabric-") || id.equals("mixinextras") || m.getContainingMod().isPresent()) continue;
            mods.add(m);
        }
        mods.sort((a, b) -> a.getMetadata().getName().compareToIgnoreCase(b.getMetadata().getName()));
        boolean hasModMenu = FabricLoader.getInstance().isModLoaded("modmenu");
        heading("Mod Menu", mods.size() + " mods loaded. Add or remove mods in the VEX launcher (Instances › MODS).");
        if (hasModMenu) {
            if (buttons(new String[]{"Open Mod Menu (mod settings)"}, new int[]{1}) == 0) {
                Screen s = modMenuScreen(this);
                if (s != null) { mc.setScreen(s); return; }
                say("Couldn't open Mod Menu", Ui.BAD);
            }
        } else text("Tip: add Mod Menu in the launcher to change other mods' settings from here.", Ui.DIM);
        for (ModContainer m : mods) {
            String d = m.getMetadata().getDescription();
            itemRow(m.getMetadata().getName(), d == null || d.isBlank() ? m.getMetadata().getId() : d.replace('\n', ' '), m.getMetadata().getId().equals("vexclient") ? Ui.ORANGE : Ui.TEXT, m.getMetadata().getVersion().getFriendlyString(), 0, false);
        }
    }

    // ---------- GUI Settings ----------
    private void guiContent() {
        VexConfig c = VexConfig.get();
        heading("Interface", null);
        if (toggleRow("g.particles", GUI_SETTINGS[0][0], GUI_SETTINGS[0][1], c.showParticles)) { c.showParticles = !c.showParticles; VexConfig.save(); }
        if (toggleRow("g.dim", GUI_SETTINGS[1][0], GUI_SETTINGS[1][1], c.backgroundDim)) { c.backgroundDim = !c.backgroundDim; VexConfig.save(); }
        if (toggleRow("g.tips", GUI_SETTINGS[2][0], GUI_SETTINGS[2][1], c.tooltips)) { c.tooltips = !c.tooltips; VexConfig.save(); }
        if (toggleRow("g.adv", GUI_SETTINGS[3][0], GUI_SETTINGS[3][1], c.alwaysShowAdvanced)) { c.alwaysShowAdvanced = !c.alwaysShowAdvanced; VexConfig.save(); }

        heading("HUD & Alerts", null);
        if (itemRow(GUI_SETTINGS[4][0], GUI_SETTINGS[4][1], Ui.TEXT, "Edit", 1, true)) { mc.setScreen(new HudEditorScreen(this)); return; }
        if (toggleRow("g.sound", GUI_SETTINGS[5][0], GUI_SETTINGS[5][1], c.notificationSound)) { c.notificationSound = !c.notificationSound; VexConfig.save(); }

        heading("Appearance", null);
        int r = cycleRow(GUI_SETTINGS[6][0], GUI_SETTINGS[6][1], Ui.theme());
        if (r != 0) {
            List<String> names = new ArrayList<>(Ui.THEMES.keySet());
            int i = Math.max(0, names.indexOf(Ui.theme()));
            c.theme = names.get((i + (r > 0 ? 1 : names.size() - 1)) % names.size());
            Ui.apply(c.theme);
            input.setTextColor(Ui.TEXT);
            VexConfig.save();
        }
        int pick = segmentRow(GUI_SETTINGS[7][0], GUI_SETTINGS[7][1], new String[]{"Auto", "1x", "2x", "3x"}, c.guiScale);
        if (pick >= 0) { c.guiScale = pick; VexConfig.save(); }
        if (toggleRow("g.badges", GUI_SETTINGS[9][0], GUI_SETTINGS[9][1], c.vexBadges)) { c.vexBadges = !c.vexBadges; VexConfig.save(); }

        heading("Configs", null);
        if (toggleRow("g.auto", GUI_SETTINGS[8][0], GUI_SETTINGS[8][1], c.autoSwitchProfiles)) {
            c.autoSwitchProfiles = !c.autoSwitchProfiles;
            VexConfig.save();
            if (c.autoSwitchProfiles) { Hud.rememberForHere(mc); say(mc.level != null ? "This place now uses Layout " + Hud.activeSlot() : "Join a server and pick a layout: it's remembered there", Ui.GOOD); }
        }
        if (c.autoSwitchProfiles) layoutButtons();
    }

    // ---------- Shaders ----------
    private List<Shaders.Pack> packsCache;
    private String selectedCache;
    private long packsAt;

    private void shaderContent() {
        boolean iris = Shaders.irisLoaded();
        if (packsCache == null || System.currentTimeMillis() - packsAt > 3000) { packsCache = Shaders.packs(); selectedCache = Shaders.selected(); packsAt = System.currentTimeMillis(); }
        if (!iris) {
            heading("Shaders", "Iris isn't installed, so shaders can't run.");
            text("Add Iris and Sodium to this instance in the VEX launcher (MODS), then start the game again.", Ui.WARN);
        } else {
            heading("Shaders", "Iris " + Shaders.irisVersion() + (Shaders.sodiumLoaded() ? " with Sodium" : " · Sodium missing (Iris needs it)"));
            Boolean on = Shaders.enabled();
            if (toggleRow("shaders", "Shaders", on == null ? "Iris didn't report its state" : "Turning them on costs FPS", on != null && on)) {
                String err = Shaders.setEnabled(on == null || !on);
                if (err != null) say(err, Ui.BAD); else say("Shaders " + (on == null || !on ? "on" : "off"), Ui.GOOD);
            }
        }
        int b = buttons(iris ? new String[]{"Iris shader settings", "Open shaderpacks folder"} : new String[]{"Open shaderpacks folder"}, iris ? new int[]{1, 0} : new int[]{0});
        if (iris && b == 0) {
            Screen s = Shaders.irisScreen(this);
            if (s != null) { mc.setScreen(s); return; }
            say("Couldn't open Iris's screen; use Options › Video › Shader Packs", Ui.BAD);
        } else if (b >= 0) Shaders.openFolder();
        heading("Packs", packsCache.isEmpty() ? "No shader packs yet: put .zip packs in the shaderpacks folder." : packsCache.size() + " in your shaderpacks folder");
        for (Shaders.Pack p : packsCache) {
            boolean current = p.name().equals(selectedCache);
            String sub = p.warning() != null ? "⚠ " + p.warning() : (p.folder() ? "Folder" : "Zip") + " · works with Iris";
            if (itemRow((current ? "★ " : "") + p.name(), sub, current ? Ui.ORANGE : p.warning() != null ? Ui.WARN : Ui.TEXT, current ? "In use" : "Use", current ? 0 : 1, iris && !current)) {
                String err = Shaders.select(p.name());
                if (err != null) say(err, Ui.BAD); else say("Loading " + p.name() + "… (can take a few seconds)", Ui.GOOD);
                packsAt = 0;
            }
        }
    }
}
