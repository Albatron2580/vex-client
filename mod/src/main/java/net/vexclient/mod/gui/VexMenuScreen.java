package net.vexclient.mod.gui;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import java.util.function.DoubleSupplier;
import java.util.function.IntConsumer;

/**
 * The Right Shift menu: "VEX CLIENT" with three tabs (Settings, Display, Shaders).
 * Everything is drawn by hand in the Vex style (switches, sliders, colour swatches, cards) and reacts to the
 * mouse by polling it each frame, so the menu does not depend on Minecraft's widget classes. Every change
 * is saved straight away.
 */
public final class VexMenuScreen extends Screen {
    private enum Tab { SETTINGS("Settings"), DISPLAY("Display"), SHADERS("Shaders"); final String label; Tab(String l) { label = l; } }
    private static final String[] SETTINGS_SECTIONS = {"General", "Waypoints", "Friends", "Controls", "Performance", "Mods", "Cheats"};

    // remembered while the game runs, so the menu reopens where you left it
    private static Tab tab = Tab.SETTINGS;
    private static final int[] side = new int[3];

    private final Screen parent;
    private final Minecraft mc = Minecraft.getInstance();

    // layout of this frame
    private int px0, py0, px1, py1, vx0, vy0, vx1, vy1;
    // mouse state of this frame (polled)
    private int mx, my;
    private boolean down, rdown, pressed, rpressed, released;
    private boolean wasDown = true, wasR = true; // ignore the click that opened the menu
    private boolean wasRShift = true;
    // content
    private int cursor;
    private double scroll, maxScroll;
    private boolean draggingBar;
    private String dragSlider;
    private final Map<String, Float> anim = new HashMap<>();
    private long lastFrame;
    private float dt;
    private EditBox input;
    private boolean inputUsed;
    private Module binding;
    private String status;
    private int statusColor = Ui.TEXT;
    private long statusUntil;

    /** Opens on this tab (0 Settings, 1 Display, 2 Shaders) and sidebar entry next time (used by the screenshot test). */
    public static void select(int tabIndex, int sideIndex) {
        tab = Tab.values()[Math.max(0, Math.min(2, tabIndex))];
        side[tab.ordinal()] = Math.max(0, sideIndex);
    }

    public VexMenuScreen(Screen parent) {
        super(Component.literal("Vex Client"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        String keep = input != null ? input.getValue() : "";
        input = addRenderableWidget(new EditBox(this.font, 0, 0, 100, 16, Component.literal("Name")));
        input.setMaxLength(24);
        input.setValue(keep);
        input.visible = false;
    }

    @Override public boolean isPauseScreen() { return true; }

    // ---------- input ----------
    private void pollMouse(int mouseX, int mouseY) {
        mx = mouseX; my = mouseY;
        long win = GLFW.glfwGetCurrentContext();
        boolean d = win != 0 && GLFW.glfwGetMouseButton(win, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean r = win != 0 && GLFW.glfwGetMouseButton(win, GLFW.GLFW_MOUSE_BUTTON_RIGHT) == GLFW.GLFW_PRESS;
        pressed = d && !wasDown;
        released = !d && wasDown;
        rpressed = r && !wasR;
        down = d; rdown = r;
        wasDown = d; wasR = r;
        if (released) { if (dragSlider != null) { save(); mc.options.save(); } dragSlider = null; draggingBar = false; }
    }

    private boolean over(int x0, int y0, int x1, int y1) { return mx >= x0 && mx < x1 && my >= y0 && my < y1; }
    private boolean inView() { return over(vx0, vy0, vx1, vy1); }
    private boolean hot(int x0, int y0, int x1, int y1) { return inView() && over(x0, y0, x1, y1) && dragSlider == null && !draggingBar; }
    private boolean click(int x0, int y0, int x1, int y1) { return pressed && hot(x0, y0, x1, y1); }

    private void sound() {
        mc.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F));
    }

    private void say(String msg, int color) { status = msg; statusColor = color; statusUntil = System.currentTimeMillis() + 5000; }

    private float animate(String id, boolean on) {
        float t = anim.getOrDefault(id, on ? 1f : 0f);
        float target = on ? 1f : 0f;
        t += (target - t) * Math.min(1f, dt * 14f);
        if (Math.abs(target - t) < 0.01f) t = target;
        anim.put(id, t);
        return t;
    }

    private static void save() { Modules.save(); Hud.save(); }

    @Override
    public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
        scroll = Math.max(0, Math.min(maxScroll, scroll - scrollY * 24));
        return true;
    }

    @Override
    public void tick() {
        super.tick();
        if (binding != null) {
            if (Modules.keyDown(GLFW.GLFW_KEY_ESCAPE)) { binding.key = -1; finishBind(); return; }
            int k = Modules.pollPressedKey();
            if (k >= 0 && k != GLFW.GLFW_KEY_ESCAPE) { binding.key = k; finishBind(); }
            return;
        }
        boolean rs = Modules.keyDown(GLFW.GLFW_KEY_RIGHT_SHIFT);
        if (rs && !wasRShift && (input == null || !input.isFocused())) onClose();
        wasRShift = rs;
    }

    private void finishBind() {
        say(binding.name + " key: " + Modules.keyName(binding.key), Ui.GOOD);
        binding = null;
        wasRShift = true;
        Modules.save();
    }

    @Override public boolean shouldCloseOnEsc() { return binding == null; }

    // ---------- frame ----------
    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float pt) {
        super.renderBackground(g, mouseX, mouseY, pt);
        frame = g;
        long now = System.nanoTime();
        dt = lastFrame == 0 ? 0.016f : Math.min(0.1f, (now - lastFrame) / 1e9f);
        lastFrame = now;
        pollMouse(mouseX, mouseY);

        g.fill(0, 0, this.width, this.height, 0x70060310);
        int w = Math.min(this.width - 24, 500), h = Math.min(this.height - 24, 300);
        px0 = (this.width - w) / 2; py0 = (this.height - h) / 2; px1 = px0 + w; py1 = py0 + h;
        Ui.panel(g, px0, py0, px1, py1);

        // header: logo + tabs
        Ui.title(g, this.font, px0 + 12, py0 + 11, 1.5f);
        int tw = 62, tx = px1 - 10 - tw * 3 - 4;
        Ui.round(g, tx - 2, py0 + 7, px1 - 8, py0 + 27, 0xFF100A1E);
        for (Tab t : Tab.values()) {
            boolean sel = t == tab;
            boolean hv = over(tx, py0 + 9, tx + tw, py0 + 25);
            if (sel) Ui.round(g, tx, py0 + 9, tx + tw, py0 + 25, Ui.ORANGE);
            else if (hv) Ui.round(g, tx, py0 + 9, tx + tw, py0 + 25, 0xFF2A1A4B);
            g.drawString(this.font, t.label, tx + tw / 2 - this.font.width(t.label) / 2, py0 + 13, sel ? 0xFF1A0C00 : hv ? Ui.TEXT : Ui.DIM, false);
            if (pressed && hv && !sel) { tab = t; scroll = 0; binding = null; sound(); }
            tx += tw + 2;
        }
        g.fill(px0 + 1, py0 + 33, px1 - 1, py0 + 34, Ui.EDGE);

        // sidebar
        String[] items = sideItems();
        int sx1 = px0;
        if (items.length > 0) {
            sx1 = px0 + 108;
            g.fill(px0 + 1, py0 + 34, sx1, py1 - 1, Ui.SIDE);
            g.fill(sx1, py0 + 34, sx1 + 1, py1 - 1, Ui.EDGE);
            int y = py0 + 40;
            int step = Math.max(14, Math.min(20, (py1 - 8 - y) / items.length));
            int ih = step - 2;
            int cur = Math.min(side[tab.ordinal()], items.length - 1);
            for (int i = 0; i < items.length; i++) {
                boolean sel = i == cur;
                boolean hv = over(px0 + 4, y, sx1 - 4, y + ih);
                if (sel) { Ui.round(g, px0 + 4, y, sx1 - 4, y + ih, 0xFF2A1A4B); g.fill(px0 + 4, y + 3, px0 + 6, y + ih - 3, Ui.ORANGE); }
                else if (hv) Ui.round(g, px0 + 4, y, sx1 - 4, y + ih, 0xFF1D1333);
                String label = this.font.plainSubstrByWidth(items[i], sx1 - px0 - 20);
                g.drawString(this.font, label, px0 + 12, y + ih / 2 - 4, sel ? Ui.TEXT : hv ? Ui.TEXT : Ui.DIM, false);
                if (pressed && hv && !sel) { side[tab.ordinal()] = i; scroll = 0; binding = null; input.setValue(""); sound(); }
                y += step;
            }
        }

        // content viewport
        vx0 = sx1 + 10; vy0 = py0 + 40; vx1 = px1 - 14; vy1 = py1 - 26;
        inputUsed = false;
        g.enableScissor(vx0 - 2, vy0 - 2, vx1 + 2, vy1);
        cursor = 0;
        switch (tab) {
            case SETTINGS -> settingsContent(SETTINGS_SECTIONS[Math.min(side[0], SETTINGS_SECTIONS.length - 1)]);
            case DISPLAY -> displayContent(Math.min(side[1], items.length - 1));
            case SHADERS -> shaderContent();
        }
        g.disableScissor();
        maxScroll = Math.max(0, cursor - (vy1 - vy0));
        scroll = Math.max(0, Math.min(maxScroll, scroll));
        if (!inputUsed) input.visible = false;

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
        else g.drawString(this.font, "Right Shift or Esc to close", sx1 + 10, py1 - 15, 0xFF6E5F92, false);
        boolean hv = over(px1 - 62, py1 - 19, px1 - 8, py1 - 5);
        Ui.chip(g, this.font, px1 - 62, py1 - 19, px1 - 8, py1 - 5, "Done", 1, hv, true);
        if (pressed && hv) { sound(); onClose(); }
    }

    private String[] sideItems() {
        return switch (tab) {
            case SETTINGS -> SETTINGS_SECTIONS;
            case DISPLAY -> {
                String[] s = new String[Hud.ELEMENTS.size() + 1];
                s[0] = "Layout";
                for (int i = 0; i < Hud.ELEMENTS.size(); i++) s[i + 1] = Hud.ELEMENTS.get(i).name;
                yield s;
            }
            case SHADERS -> new String[0];
        };
    }

    // ---------- row builders (immediate mode: each call draws one row and handles its clicks) ----------
    private int rowY() { return vy0 + cursor - (int) scroll; }
    private boolean visible(int y, int h) { return y + h > vy0 - 4 && y < vy1 + 4; }

    private void heading(String title, String sub) {
        List<FormattedCharSequence> lines = sub == null ? List.of() : this.font.split(Component.literal(sub), vx1 - vx0 - 4);
        int y = rowY(), h = 18 + lines.size() * 10;
        if (visible(y, h)) {
            g().drawString(this.font, title, vx0, y + 2, Ui.TEXT, true);
            g().fill(vx0, y + 12, vx0 + this.font.width(title), y + 13, Ui.ORANGE);
            for (int i = 0; i < lines.size(); i++) g().drawString(this.font, lines.get(i), vx0, y + 18 + i * 10, Ui.DIM, false);
        }
        cursor += h + 4;
    }

    private void text(String s, int color) {
        List<FormattedCharSequence> lines = this.font.split(Component.literal(s), vx1 - vx0 - 4);
        int y = rowY();
        for (int i = 0; i < lines.size(); i++) if (visible(y + i * 10, 10)) g().drawString(this.font, lines.get(i), vx0 + 2, y + i * 10, color, false);
        cursor += lines.size() * 10 + 6;
    }

    /** A card row; returns {y} and draws the background with hover. */
    private int cardStart(int h, boolean hoverable) {
        int y = rowY();
        if (visible(y, h)) Ui.card(g(), vx0, y, vx1, y + h, hoverable && hot(vx0, y, vx1, y + h) ? Ui.CARD_HOVER : Ui.CARD, Ui.EDGE_SOFT);
        return y;
    }

    private void cardEnd(int h) { cursor += h + 4; }

    private void titleAndDesc(int y, int h, String title, String desc, int rightSpace) {
        int maxW = vx1 - vx0 - 16 - rightSpace;
        if (desc == null) g().drawString(this.font, this.font.plainSubstrByWidth(title, maxW), vx0 + 8, y + h / 2 - 4, Ui.TEXT, false);
        else {
            g().drawString(this.font, this.font.plainSubstrByWidth(title, maxW), vx0 + 8, y + 6, Ui.TEXT, false);
            List<FormattedCharSequence> lines = descLines(desc, maxW);
            for (int i = 0; i < lines.size(); i++) g().drawString(this.font, lines.get(i), vx0 + 8, y + 17 + i * 10, Ui.DIM, false);
        }
    }

    /** Description wrapped to at most two lines. */
    private List<FormattedCharSequence> descLines(String desc, int maxW) {
        List<FormattedCharSequence> l = this.font.split(Component.literal(desc), Math.max(40, maxW));
        return l.size() > 2 ? l.subList(0, 2) : l;
    }

    /** Card height for a title plus a (wrapped) description. */
    private int cardH(String desc, int rightSpace) {
        if (desc == null) return 22;
        return 20 + descLines(desc, vx1 - vx0 - 16 - rightSpace).size() * 10;
    }

    private boolean toggleRow(String id, String title, String desc, boolean on) {
        int h = cardH(desc, 30);
        int y = cardStart(h, true);
        boolean clicked = false;
        if (visible(y, h)) {
            titleAndDesc(y, h, title, desc, 30);
            Ui.toggle(g(), vx1 - 30, y + h / 2 - 5, animate(id, on), hot(vx0, y, vx1, y + h));
            clicked = click(vx0, y, vx1, y + h);
            if (clicked) sound();
        }
        cardEnd(h);
        return clicked;
    }

    private void sliderRow(String id, String title, double min, double max, double step, DoubleSupplier get, DoubleConsumer set, DoubleFunction<String> fmt) {
        int h = 30;
        int y = cardStart(h, false);
        if (visible(y, h)) {
            double v = get.getAsDouble();
            String val = fmt.apply(v);
            g().drawString(this.font, title, vx0 + 8, y + 5, Ui.TEXT, false);
            g().drawString(this.font, val, vx1 - 8 - this.font.width(val), y + 5, Ui.ORANGE, false);
            int sx0 = vx0 + 10, sx1 = vx1 - 10, sy = y + 16;
            boolean hv = inView() && over(sx0 - 4, sy - 2, sx1 + 4, sy + 13);
            if (pressed && hv && dragSlider == null) { dragSlider = id; sound(); }
            boolean active = id.equals(dragSlider);
            if (active && down) {
                double f = Math.max(0, Math.min(1, (mx - sx0) / (double) (sx1 - sx0)));
                double nv = Math.round((min + f * (max - min)) / step) * step;
                nv = Math.max(min, Math.min(max, nv));
                if (nv != v) { set.accept(nv); v = nv; }
            }
            Ui.slider(g(), sx0, sy, sx1, (float) ((v - min) / (max - min)), active || hv);
        }
        cardEnd(h);
    }

    /** Value chip on the right: left click = next, right click = previous. Returns -1, 0 or +1. */
    private int cycleRow(String title, String desc, String value) {
        int h = cardH(desc, Math.max(60, this.font.width(value) + 24) + 4);
        int y = cardStart(h, true);
        int r = 0;
        if (visible(y, h)) {
            int cw = Math.max(60, this.font.width(value) + 24);
            titleAndDesc(y, h, title, desc, cw + 4);
            boolean hv = hot(vx0, y, vx1, y + h);
            Ui.chip(g(), this.font, vx1 - 6 - cw, y + h / 2 - 7, vx1 - 6, y + h / 2 + 7, "‹ " + value + " ›", 0, hv, true);
            if (click(vx0, y, vx1, y + h)) { r = 1; sound(); }
            else if (rpressed && hot(vx0, y, vx1, y + h)) { r = -1; sound(); }
        }
        cardEnd(h);
        return r;
    }

    private void colorRow(String title, int current, IntConsumer set) {
        int h = 22;
        int y = cardStart(h, false);
        if (visible(y, h)) {
            int n = Setting.Color.PALETTE.length, sw = 12, gap = 3;
            int x = vx1 - 6 - n * (sw + gap) + gap;
            titleAndDesc(y, h, title, null, n * (sw + gap) + 4);
            for (int i = 0; i < n; i++) {
                int c = Setting.Color.PALETTE[i];
                int x0 = x + i * (sw + gap), y0 = y + 5;
                boolean sel = c == current, hv = hot(x0, y0, x0 + sw, y0 + sw);
                if (sel || hv) Ui.round(g(), x0 - 2, y0 - 2, x0 + sw + 2, y0 + sw + 2, sel ? Ui.ORANGE : 0xFFFFFFFF);
                Ui.round(g(), x0, y0, x0 + sw, y0 + sw, c);
                if (click(x0, y0, x0 + sw, y0 + sw)) { set.accept(c); sound(); }
            }
        }
        cardEnd(h);
    }

    /** A row of chips; returns the index clicked or -1. style per chip: 0 normal, 1 orange, 2 danger. */
    private int buttons(String[] labels, int[] styles) {
        int h = 18, y = rowY(), r = -1;
        if (visible(y, h)) {
            int gap = 4, w = (vx1 - vx0 - gap * (labels.length - 1)) / labels.length;
            for (int i = 0; i < labels.length; i++) {
                int x0 = vx0 + i * (w + gap), x1 = i == labels.length - 1 ? vx1 : x0 + w;
                boolean hv = hot(x0, y, x1, y + h);
                Ui.chip(g(), this.font, x0, y, x1, y + h, this.font.plainSubstrByWidth(labels[i], x1 - x0 - 8), styles[i], hv, true);
                if (click(x0, y, x1, y + h)) { r = i; sound(); }
            }
        }
        cursor += h + 6;
        return r;
    }

    /** Card with a title, a line under it and one chip on the right; true when the chip was clicked. */
    private boolean itemRow(String title, String desc, int titleColor, String action, int style, boolean enabled) {
        int cw = Math.max(48, this.font.width(action) + 16);
        int h = cardH(desc, cw + 4);
        int y = cardStart(h, false);
        boolean clicked = false;
        if (visible(y, h)) {
            int maxW = vx1 - vx0 - cw - 20;
            g().drawString(this.font, this.font.plainSubstrByWidth(title, maxW), vx0 + 8, desc == null ? y + 7 : y + 6, titleColor, false);
            if (desc != null) { List<FormattedCharSequence> dl = descLines(desc, maxW); for (int i = 0; i < dl.size(); i++) g().drawString(this.font, dl.get(i), vx0 + 8, y + 17 + i * 10, Ui.DIM, false); }
            int x0 = vx1 - 6 - cw, y0 = y + h / 2 - 7;
            boolean hv = enabled && hot(x0, y0, vx1 - 6, y0 + 14);
            Ui.chip(g(), this.font, x0, y0, vx1 - 6, y0 + 14, action, style, hv, enabled);
            if (enabled && click(x0, y0, vx1 - 6, y0 + 14)) { clicked = true; sound(); }
        }
        cardEnd(h);
        return clicked;
    }

    /** Text field + button; returns true when the button was clicked (read input.getValue()). */
    private boolean inputRow(String hint, String action) {
        int h = 26;
        int y = cardStart(h, false);
        boolean clicked = false;
        int bw = Math.max(64, this.font.width(action) + 18);
        boolean vis = y >= vy0 - 1 && y + h <= vy1 + 1;
        inputUsed = true;
        input.visible = vis;
        input.setX(vx0 + 6); input.setY(y + 5); input.setWidth(vx1 - vx0 - bw - 18);
        input.setHint(Component.literal(hint));
        if (visible(y, h)) {
            boolean hv = hot(vx1 - 6 - bw, y + 5, vx1 - 6, y + 21);
            Ui.chip(g(), this.font, vx1 - 6 - bw, y + 5, vx1 - 6, y + 21, action, 1, hv, true);
            if (click(vx1 - 6 - bw, y + 5, vx1 - 6, y + 21)) { clicked = true; sound(); }
        }
        cardEnd(h);
        return clicked;
    }

    private void moduleRow(Module m) {
        String tag = m.singleplayerOnly ? (Module.allowedHere() ? "Singleplayer only · active here" : "Singleplayer only · off on servers") : m.description;
        String keyLabel = binding == m ? "Press a key…" : Modules.keyName(m.key);
        int h = cardH(tag, Math.max(36, this.font.width(keyLabel) + 12) + 40);
        int y = cardStart(h, true);
        if (visible(y, h)) {
            String key = binding == m ? "Press a key…" : Modules.keyName(m.key);
            int kw = Math.max(36, this.font.width(key) + 12);
            titleAndDesc(y, h, m.name, tag, kw + 40);
            int kx0 = vx1 - 36 - kw, ky0 = y + h / 2 - 7;
            boolean khv = hot(kx0, ky0, kx0 + kw, ky0 + 14);
            Ui.chip(g(), this.font, kx0, ky0, kx0 + kw, ky0 + 14, key, binding == m ? 1 : 0, khv, true);
            Ui.toggle(g(), vx1 - 30, y + h / 2 - 5, animate("m." + m.id, m.isEnabled()), hot(vx0, y, vx1, y + h) && !khv);
            if (click(kx0, ky0, kx0 + kw, ky0 + 14)) { binding = m; say("Press a key for " + m.name + " (Esc = no key)", Ui.WARN); sound(); }
            else if (click(vx0, y, vx1, y + h)) { m.toggle(); Modules.save(); sound(); }
        }
        cardEnd(h);
        if (m.isEnabled()) for (Setting<?> s : m.settings) settingRow(m.id + "." + s.id, s, Modules::save, 14);
    }

    @SuppressWarnings("unchecked")
    private void settingRow(String id, Setting<?> s, Runnable save, int indent) {
        int oldX = vx0;
        vx0 += indent;
        if (s instanceof Setting.Bool b) { if (toggleRow(id, b.name, null, b.get())) { b.cycle(true); save.run(); } }
        else if (s instanceof Setting.Num n) sliderRow(id, n.name, n.min, n.max, n.step, n::get, v -> n.set(v), v -> (n.step >= 1 ? String.valueOf((long) Math.round(v)) : String.format("%.2f", v)) + n.unit);
        else if (s instanceof Setting.Color c) colorRow(c.name, c.get(), v -> { c.set(v); save.run(); });
        else if (s instanceof Setting.Choice c) { int r = cycleRow(c.name, null, c.get()); if (r != 0) { c.cycle(r > 0); save.run(); } }
        vx0 = oldX;
    }

    private GuiGraphics frame;
    private GuiGraphics g() { return frame; }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float pt) {
        super.render(g, mouseX, mouseY, pt); // the text field
    }

    // ---------- Settings tab ----------
    private void settingsContent(String section) {
        switch (section) {
            case "General" -> {
                heading("General", "Everyday features. Click a card to switch it, click the key to rebind.");
                for (Module m : Modules.in(Module.Category.GENERAL)) moduleRow(m);
                VexConfig c = VexConfig.get();
                if (toggleRow("menuLeaves", "Falling leaves in menus", "Theme leaves behind the title screen", c.menuLeaves)) { c.menuLeaves = !c.menuLeaves; VexConfig.save(); }
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
                heading("Friends", "Friends near you show on the HUD (Display tab).");
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
                    if (itemRow(m.name, m.category == Module.Category.CHEATS ? "Cheat · singleplayer only" : null, Ui.TEXT, key, binding == m ? 1 : 0, true)) {
                        binding = m;
                        say("Press a key for " + m.name + " (Esc = no key)", Ui.WARN);
                    }
                }
                text("This menu opens with Right Shift; change that in Options › Controls › Key Binds.", Ui.DIM);
            }
            case "Performance" -> performanceContent();
            case "Mods" -> {
                List<ModContainer> mods = new ArrayList<>();
                for (ModContainer m : FabricLoader.getInstance().getAllMods()) {
                    String id = m.getMetadata().getId();
                    if (id.equals("java") || id.equals("minecraft") || id.startsWith("fabric-") || id.equals("mixinextras") || m.getContainingMod().isPresent()) continue;
                    mods.add(m);
                }
                mods.sort((a, b) -> a.getMetadata().getName().compareToIgnoreCase(b.getMetadata().getName()));
                heading("Mods", mods.size() + " loaded. Add or remove mods on the launcher's Mods page.");
                for (ModContainer m : mods) {
                    String d = m.getMetadata().getDescription();
                    itemRow(m.getMetadata().getName(), d == null || d.isBlank() ? m.getMetadata().getId() : d.replace('\n', ' '), Ui.TEXT, m.getMetadata().getVersion().getFriendlyString(), 0, false);
                }
            }
            case "Cheats" -> {
                boolean here = Module.allowedHere();
                heading("Cheats", here ? "Singleplayer: cheats work in this world." : "Only in singleplayer or a LAN world you host.");
                if (!here && mc.level != null) text("You're on a server, so cheats stay off here (server rules apply).", Ui.WARN);
                for (Module m : Modules.in(Module.Category.CHEATS)) moduleRow(m);
            }
            default -> {}
        }
    }

    private void performanceContent() {
        var o = mc.options;
        heading("Performance", "Changes apply instantly and are saved to Minecraft's options.");
        sliderRow("rd", "Render distance", 2, 32, 1, () -> o.renderDistance().get(), v -> o.renderDistance().set((int) v), v -> (int) v + " chunks");
        sliderRow("sd", "Simulation distance", 5, 32, 1, () -> o.simulationDistance().get(), v -> o.simulationDistance().set((int) v), v -> (int) v + " chunks");
        sliderRow("fps", "Max FPS", 10, 260, 10, () -> o.framerateLimit().get(), v -> o.framerateLimit().set((int) v), v -> v >= 260 ? "Unlimited" : (int) v + " FPS");
        if (toggleRow("vsync", "VSync", "Stops tearing; caps FPS at your screen's refresh rate", o.enableVsync().get())) { o.enableVsync().set(!o.enableVsync().get()); o.save(); }
        if (toggleRow("shadows", "Entity shadows", "Turning this off gives a few FPS in crowded places", o.entityShadows().get())) { o.entityShadows().set(!o.entityShadows().get()); o.save(); }
        heading("Performance mods", "Installed by the launcher's performance presets.");
        String[][] mods = {{"sodium", "Sodium", "Much faster rendering"}, {"lithium", "Lithium", "Faster game logic"}, {"ferritecore", "FerriteCore", "Less memory"},
                {"entityculling", "EntityCulling", "Skips hidden mobs and chests"}, {"immediatelyfast", "ImmediatelyFast", "Faster HUD and text"}};
        for (String[] m : mods) {
            boolean on = FabricLoader.getInstance().isModLoaded(m[0]);
            itemRow(m[1], m[2], on ? Ui.TEXT : Ui.DIM, on ? "Loaded" : "Missing", on ? 0 : 2, false);
        }
        text("Missing ones: launcher › Profiles › Performance › pick a preset. FPS chart: press F3 + 2.", Ui.DIM);
    }

    // ---------- Display tab ----------
    private void displayContent(int idx) {
        if (idx <= 0) {
            heading("HUD layout", "Drag elements around and keep up to three layouts (a dot = empty, starts as a copy).");
            int b = buttons(new String[]{"Edit layout (drag)", "Reset positions"}, new int[]{1, 0});
            if (b == 0) { this.minecraft.setScreen(new HudEditorScreen(this)); return; }
            if (b == 1) { Hud.resetPositions(); say("Positions and colours reset", Ui.GOOD); }
            String[] slots = new String[Hud.SLOTS];
            int[] st = new int[Hud.SLOTS];
            for (int s = 1; s <= Hud.SLOTS; s++) { slots[s - 1] = "Layout " + s + (Hud.slotUsed(s) || Hud.activeSlot() == s ? "" : " ·"); st[s - 1] = Hud.activeSlot() == s ? 1 : 0; }
            int pick = buttons(slots, st);
            if (pick >= 0) { Hud.selectSlot(pick + 1); say("Layout " + (pick + 1) + " loaded", Ui.GOOD); }
            heading("Elements", null);
            for (HudElement e : Hud.ELEMENTS) if (toggleRow("hud." + e.id, e.name, null, e.enabled)) { e.enabled = !e.enabled; Hud.save(); }
            return;
        }
        HudElement e = Hud.ELEMENTS.get(idx - 1);
        heading(e.name, "Shown on your screen while playing.");
        if (toggleRow("hud." + e.id, "Show", null, e.enabled)) { e.enabled = !e.enabled; Hud.save(); }
        colorRow("Colour", e.color, c -> { e.color = c; Hud.save(); });
        sliderRow("scale." + e.id, "Size", 0.5, 2.5, 0.05, () -> e.scale, v -> e.scale = (float) v, v -> Math.round(v * 100) + "%");
        if (toggleRow("bg." + e.id, "Background box", null, e.background)) { e.background = !e.background; Hud.save(); }
        for (Setting<?> s : e.settings) settingRow("hud." + e.id + "." + s.id, s, Hud::save, 0);
        if (buttons(new String[]{"Move it on screen…"}, new int[]{1}) == 0) this.minecraft.setScreen(new HudEditorScreen(this));
    }

    // ---------- Shaders tab ----------
    private List<Shaders.Pack> packsCache;
    private String selectedCache;
    private long packsAt;

    private void shaderContent() {
        boolean iris = Shaders.irisLoaded();
        if (packsCache == null || System.currentTimeMillis() - packsAt > 3000) { packsCache = Shaders.packs(); selectedCache = Shaders.selected(); packsAt = System.currentTimeMillis(); }
        if (!iris) {
            heading("Shaders", "Iris isn't installed, so shaders can't run.");
            text("Install it from the launcher: Shaders page (adds Iris and Sodium), then start the game again.", Ui.WARN);
        } else {
            heading("Shaders", "Iris " + Shaders.irisVersion() + (Shaders.sodiumLoaded() ? " with Sodium" : " · Sodium missing (Iris needs it)"));
            Boolean on = Shaders.enabled();
            if (toggleRow("shaders", "Shaders", on == null ? "Iris didn't report its state" : "Turning them on costs FPS; Potato PCs should leave this off", on != null && on)) {
                String err = Shaders.setEnabled(on == null || !on);
                if (err != null) say(err, Ui.BAD); else say("Shaders " + (on == null || !on ? "on" : "off"), Ui.GOOD);
            }
        }
        int b = buttons(iris ? new String[]{"Iris shader settings", "Open shaderpacks folder"} : new String[]{"Open shaderpacks folder"}, iris ? new int[]{1, 0} : new int[]{0});
        if (iris && b == 0) {
            Screen s = Shaders.irisScreen(this);
            if (s != null) { this.minecraft.setScreen(s); return; }
            say("Couldn't open Iris's screen; use Options › Video › Shader Packs", Ui.BAD);
        } else if (b >= 0) Shaders.openFolder();
        heading("Packs", packsCache.isEmpty() ? "No shader packs yet: get some on the launcher's Shaders page." : packsCache.size() + " in your shaderpacks folder");
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

    @Override
    public void onClose() {
        save();
        this.minecraft.setScreen(parent);
    }

}
