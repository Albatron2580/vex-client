package net.vexclient.mod.gui;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.vexclient.mod.VexConfig;
import net.vexclient.mod.hud.Hud;
import net.vexclient.mod.hud.HudElement;
import net.vexclient.mod.module.Module;
import net.vexclient.mod.module.Modules;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The Right Shift menu: five see-through circles around your face (Client, Settings, Misc, Mod Menu, Combat).
 * Click your face for every module; typing searches every module and setting straight away.
 */
public final class VexRadialScreen extends VexScreen {
    private record Petal(String name, String icon, String tip, VexMenuScreen.Page page) {}
    private static final Petal[] PETALS = {
            new Petal("Client", "✦", "HUD, waypoints, friends, controls and performance", VexMenuScreen.Page.CLIENT),
            new Petal("Settings", "⚙", "GUI Settings: particles, dim, tooltips, themes, GUI scale", VexMenuScreen.Page.GUI),
            new Petal("Misc", "✿", "Zoom, fullbright and shaders", VexMenuScreen.Page.MISC),
            new Petal("Mod Menu", "☰", "Every mod in this game (opens Mod Menu if you have it)", VexMenuScreen.Page.MODS),
            new Petal("Combat", "⚔", "CPS, reach, combo, armor and the low health warning. Addons only, no hacks.", VexMenuScreen.Page.COMBAT),
    };
    private static final String VERSION = FabricLoader.getInstance().getModContainer("vexclient").map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("?");

    /** For the screenshot test: start with this text in the search bar. */
    public static String presetSearch = null;
    private float open; // opening animation 0..1

    public VexRadialScreen(Screen root) { super("VEX CLIENT", root); }

    @Override
    protected void init() {
        super.init();
        if (presetSearch != null) { input.setValue(presetSearch); presetSearch = null; }
        focusInput(true); // typing searches straight away
    }

    private record Hit(String label, String where, Runnable action, Boolean state) {}

    private List<Hit> search(String q) {
        String s = q.toLowerCase(Locale.ROOT).trim();
        List<Hit> out = new ArrayList<>();
        if (s.isEmpty()) return out;
        for (Module m : Modules.all()) {
            boolean hit = m.name.toLowerCase(Locale.ROOT).contains(s) || m.description.toLowerCase(Locale.ROOT).contains(s);
            if (hit) out.add(new Hit(m.name, m.category.label, () -> { m.toggle(); Modules.save(); }, m.isEnabled()));
            for (var st : m.settings) if (st.name.toLowerCase(Locale.ROOT).contains(s))
                out.add(new Hit(m.name + " › " + st.name, m.category.label, () -> open(pageOf(m.category), 0), null));
        }
        for (HudElement e : Hud.ELEMENTS) if (e.name.toLowerCase(Locale.ROOT).contains(s))
            out.add(new Hit(e.name, e.combat ? "Combat HUD" : "HUD", () -> { e.enabled = !e.enabled; Hud.save(); }, e.enabled));
        for (String[] gs : VexMenuScreen.GUI_SETTINGS) if (gs[0].toLowerCase(Locale.ROOT).contains(s) || gs[1].toLowerCase(Locale.ROOT).contains(s))
            out.add(new Hit(gs[0], "GUI Settings", () -> open(VexMenuScreen.Page.GUI, 0), null));
        for (VexMenuScreen.Page p : VexMenuScreen.Page.values()) {
            if (p.title.toLowerCase(Locale.ROOT).contains(s)) out.add(new Hit(p.title, "Page", () -> open(p, 0), null));
            for (int i = 0; i < p.sections.length; i++) if (p.sections.length > 1 && p.sections[i].toLowerCase(Locale.ROOT).contains(s)) {
                int idx = i;
                out.add(new Hit(p.sections[i], p.title, () -> open(p, idx), null));
            }
        }
        return out.size() > 8 ? out.subList(0, 8) : out;
    }

    private static VexMenuScreen.Page pageOf(Module.Category c) {
        return switch (c) { case CLIENT -> VexMenuScreen.Page.CLIENT; case COMBAT -> VexMenuScreen.Page.COMBAT; case MISC -> VexMenuScreen.Page.MISC; };
    }

    private void open(VexMenuScreen.Page page, int section) {
        sound();
        mc.setScreen(new VexMenuScreen(this, root, page, section));
    }

    @Override
    protected void draw() {
        open = Math.min(1f, open + dt * 5f);
        float ease = 1f - (1f - open) * (1f - open);

        // layout: five see-through circles around a smaller one with your face, a slim search pill below
        int pillH = 16, pillY = H - pillH - 8;
        float avail = pillY - 10 - 6;
        float D = Math.max(46, Math.min(150, Math.min(avail / 2.75f, (W - 20) / 2.86f)));  // centre → circle centre
        float r = D * 0.47f, r0 = D * 0.37f;
        int cx = W / 2, cy = Math.round(6 + D + r);
        float k = 0.82f + 0.18f * ease;

        // small brand in the corner
        Ui.title(g, this.font, 8, 8, 1f);
        g.drawString(this.font, "v" + VERSION, 8, 19, Ui.alpha(0xFFFFFFFF, 0.55f), true);

        int hovered = -1;
        for (int i = 0; i < PETALS.length; i++) {
            double a = Math.toRadians(-90 + i * 72);
            float px = cx + (float) Math.cos(a) * D * k, py = cy + (float) Math.sin(a) * D * k;
            boolean hv = (mx - px) * (mx - px) + (my - py) * (my - py) <= r * r;
            if (hv) hovered = i;
            float t = animate("petal" + i, hv);
            float rr = r * k * (1f + 0.05f * t);
            Ui.glassCircle(g, px, py, rr, t);
            Petal p = PETALS[i];
            var pose = g.pose();
            pose.pushMatrix();
            pose.translate(px, py - rr * 0.22f);
            pose.scale(1.8f, 1.8f);
            g.drawString(this.font, p.icon, -this.font.width(p.icon) / 2, -4, Ui.mix(0xFFFFFFFF, Ui.ORANGE_HI, t), true);
            pose.popMatrix();
            g.drawString(this.font, p.name, Math.round(px) - this.font.width(p.name) / 2, Math.round(py + rr * 0.18f), 0xFFFFFFFF, true);
            if (hv) tip(p.tip);
            if (hv && pressed) { open(p.page, 0); return; }
        }

        // centre: your face, name and the VEX tag; click it for every module
        boolean ch = (mx - cx) * (mx - cx) + (my - cy) * (my - cy) <= r0 * r0;
        float ct = animate("centre", ch);
        float cr = r0 * k * (1f + 0.05f * ct);
        Ui.glassCircle(g, cx, cy, cr, ct);
        int head = Math.max(12, Math.round(cr * 0.62f));
        int hy = Math.round(cy - (head + 25) / 2f);
        try {
            if (mc.player != null) PlayerFaceRenderer.draw(g, mc.player.getSkin(), cx - head / 2, hy, head);
            else PlayerFaceRenderer.draw(g, DefaultPlayerSkin.get(mc.getUser().getProfileId()), cx - head / 2, hy, head);
        } catch (Throwable ignored) { Ui.logo(g, cx - head / 2, hy, head, Ui.LOGO); }
        String name = mc.getUser().getName();
        int ny = hy + head + 3;
        g.drawString(this.font, name, cx - this.font.width(name) / 2, ny, 0xFFFFFFFF, true);
        String tag = "VEX";
        int tw = this.font.width(tag) + 12, ty = ny + 11;
        Ui.card(g, cx - tw / 2, ty, cx + tw / 2, ty + 11, Ui.alpha(Ui.ORANGE, 0.35f), Ui.alpha(Ui.ORANGE_HI, 0.9f));
        g.drawString(this.font, tag, cx - this.font.width(tag) / 2, ty + 2, 0xFFFFFFFF, false);
        if (ch) tip("Every module and HUD element on one page");
        if (ch && pressed) { open(VexMenuScreen.Page.ALL, 0); return; }

        // search pill (typing searches straight away)
        int bw = Math.min(W - 40, 330), bx0 = cx - bw / 2, bx1 = cx + bw / 2;
        boolean typing = !input.getValue().isBlank();
        Ui.round(g, bx0, pillY, bx1, pillY + pillH, Ui.alpha(0xFF000000, typing ? 0.45f : 0.25f));
        g.fill(bx0 + 2, pillY + pillH - 1, bx1 - 2, pillY + pillH, Ui.alpha(typing ? Ui.ORANGE : 0xFFFFFFFF, typing ? 0.9f : 0.25f));
        String esc = "Esc to close";
        g.drawString(this.font, esc, bx1 - 6 - this.font.width(esc), pillY + 4, Ui.alpha(0xFFFFFFFF, 0.45f), false);
        g.drawString(this.font, "⌕", bx0 + 6, pillY + 4, Ui.alpha(0xFFFFFFFF, 0.6f), false);
        drawInput(bx0 + 17, pillY + 4, bw - 30 - this.font.width(esc), "Type to search · click a section · click your face for every module");

        // results above the pill
        if (typing) {
            List<Hit> hits = search(input.getValue());
            int rh = 16, n = Math.max(1, hits.size());
            int ry1 = pillY - 4, ry0 = ry1 - n * rh - 6;
            Ui.card(g, bx0, ry0, bx1, ry1, Ui.alpha(0xFF0C0810, 0.88f), Ui.alpha(0xFFFFFFFF, 0.35f));
            if (hits.isEmpty()) g.drawString(this.font, "Nothing found for “" + input.getValue() + "”", bx0 + 10, ry0 + 7, Ui.DIM, false);
            for (int i = 0; i < hits.size(); i++) {
                Hit h = hits.get(i);
                int y0 = ry0 + 3 + i * rh;
                boolean hv = over(bx0 + 3, y0, bx1 - 3, y0 + rh);
                if (hv) Ui.round(g, bx0 + 3, y0, bx1 - 3, y0 + rh, Ui.alpha(Ui.ORANGE, 0.22f));
                g.drawString(this.font, this.font.plainSubstrByWidth(h.label, bw - 120), bx0 + 10, y0 + 4, 0xFFFFFFFF, false);
                int ww = this.font.width(h.where), right = bx1 - 10;
                if (h.state != null) { Ui.toggle(g, right - 22, y0 + 2, animate("hit" + h.label, h.state), hv); right -= 28; }
                else { g.drawString(this.font, "›", right - 4, y0 + 4, Ui.ORANGE_HI, false); right -= 10; }
                g.drawString(this.font, h.where, right - ww, y0 + 4, Ui.alpha(0xFFFFFFFF, 0.55f), false);
                if (hv && pressed) { sound(); h.action.run(); return; }
            }
        }
    }

    @Override public void onClose() { closeAll(); }

    /** Keeps the keyboard on the search bar even after clicking elsewhere. */
    @Override public void tick() { super.tick(); if (!input.isFocused()) focusInput(true); }

    @Override protected boolean rightShiftCloses() { return input.getValue().isEmpty(); }

    static boolean configTooltips() { return VexConfig.get().tooltips; }
}
