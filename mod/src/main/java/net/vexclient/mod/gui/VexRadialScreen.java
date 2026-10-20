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
 * The Right Shift menu: five petals around your player head (Client, Settings, Misc, Mod Menu, Combat)
 * and a search bar for every module and setting at the bottom. Typing searches straight away.
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
        int cx = W / 2, cy = H / 2 - 16;
        float R = Math.max(62, Math.min(112, Math.min(W, H) * 0.27f)) * (0.85f + 0.15f * ease);

        // header
        int tw = Ui.titleWidth(this.font, 1.5f);
        Ui.title(g, this.font, cx - tw / 2, 10, 1.5f);
        String sub = "v" + VERSION + " · Right Shift or Esc to close";
        g.drawString(this.font, sub, cx - this.font.width(sub) / 2, 26, Ui.DIM, false);

        // petals
        int hovered = -1;
        for (int i = 0; i < PETALS.length; i++) {
            double a = Math.toRadians(-90 + i * 72);
            float px = cx + (float) Math.cos(a) * R * 0.98f, py = cy + (float) Math.sin(a) * R * 0.98f;
            float rx = R * 0.50f, ry = R * 0.38f; // radial / sideways half sizes
            // mouse in petal space
            double dx = mx - px, dy = my - py;
            double lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
            boolean hv = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1.0;
            if (hv) hovered = i;
            float t = animate("petal" + i, hv);
            float grow = 1f + 0.08f * t;
            var pose = g.pose();
            pose.pushMatrix();
            pose.translate(px, py);
            pose.rotate((float) a);
            Ui.ellipse(g, 0, 0, rx * grow + 1.5f, ry * grow + 1.5f, Ui.mix(Ui.EDGE, Ui.ORANGE, t));
            Ui.ellipse(g, 0, 0, rx * grow, ry * grow, Ui.alpha(Ui.mix(Ui.PANEL, Ui.CARD_HOVER, t), 0.96f));
            Ui.ellipse(g, -rx * 0.18f * grow, -ry * 0.25f * grow, rx * 0.55f * grow, ry * 0.35f * grow, Ui.alpha(Ui.ORANGE_HI, 0.06f + 0.08f * t));
            pose.popMatrix();
            // icon + label (upright)
            Petal p = PETALS[i];
            pose.pushMatrix();
            pose.translate(px, py - 6);
            pose.scale(1.6f, 1.6f);
            g.drawString(this.font, p.icon, -this.font.width(p.icon) / 2, -4, Ui.mix(Ui.ORANGE, Ui.ORANGE_HI, t), false);
            pose.popMatrix();
            g.drawString(this.font, p.name, Math.round(px) - this.font.width(p.name) / 2, Math.round(py) + 6, Ui.mix(Ui.TEXT, 0xFFFFFFFF, t), false);
            if (hv) tip(p.tip);
            if (hv && pressed) { open(p.page, 0); return; }
        }

        // centre: your head and name
        float cr = R * 0.40f;
        Ui.ellipse(g, cx, cy, cr + 2, cr + 2, Ui.ORANGE_DARK);
        Ui.ellipse(g, cx, cy, cr + 1, cr + 1, Ui.ORANGE);
        Ui.ellipse(g, cx, cy, cr, cr, Ui.PANEL);
        int head = Math.max(16, Math.round(cr * 0.9f));
        try {
            if (mc.player != null) PlayerFaceRenderer.draw(g, mc.player.getSkin(), cx - head / 2, cy - head / 2 - 5, head);
            else PlayerFaceRenderer.draw(g, DefaultPlayerSkin.get(mc.getUser().getProfileId()), cx - head / 2, cy - head / 2 - 5, head);
        } catch (Throwable ignored) { Ui.logo(g, cx - head / 2, cy - head / 2 - 5, head, Ui.LOGO); }
        String name = mc.getUser().getName();
        g.drawString(this.font, name, cx - this.font.width(name) / 2, cy + head / 2 - 1, Ui.TEXT, true);

        // bottom bar: search + buttons
        int bw = Math.min(W - 24, 380), bx0 = cx - bw / 2, bx1 = cx + bw / 2, by0 = H - 32, by1 = H - 10;
        Ui.card(g, bx0, by0, bx1, by1, Ui.PANEL, input.isFocused() ? Ui.ORANGE : Ui.EDGE);
        String[] labels = {"Edit HUD", "Close"};
        int x = bx1 - 4;
        int[] bxs = new int[labels.length];
        for (int i = labels.length - 1; i >= 0; i--) { int w = this.font.width(labels[i]) + 16; x -= w; bxs[i] = x; x -= 4; }
        g.drawString(this.font, "⌕", bx0 + 7, by0 + 7, Ui.DIM, false);
        drawInput(bx0 + 19, by0 + 7, x - bx0 - 22, "Search modules and settings");
        for (int i = 0; i < labels.length; i++) {
            int w = this.font.width(labels[i]) + 16, x0 = bxs[i];
            boolean hv = over(x0, by0 + 4, x0 + w, by1 - 4);
            Ui.chip(g, this.font, x0, by0 + 4, x0 + w, by1 - 4, labels[i], i == 0 ? 1 : 0, hv, true);
            if (hv && pressed) {
                sound();
                if (i == 0) { mc.setScreen(new HudEditorScreen(this)); return; }
                closeAll(); return;
            }
        }

        // search results, just above the bar
        List<Hit> hits = search(input.getValue());
        if (!input.getValue().isBlank()) {
            int rh = 18, n = Math.max(1, hits.size());
            int ry1 = by0 - 4, ry0 = ry1 - n * rh - 8;
            Ui.card(g, bx0, ry0, bx1, ry1, Ui.alpha(Ui.PANEL, 0.98f), Ui.EDGE);
            if (hits.isEmpty()) g.drawString(this.font, "Nothing found for “" + input.getValue() + "”", bx0 + 10, ry0 + 9, Ui.DIM, false);
            for (int i = 0; i < hits.size(); i++) {
                Hit h = hits.get(i);
                int y0 = ry0 + 4 + i * rh;
                boolean hv = over(bx0 + 3, y0, bx1 - 3, y0 + rh);
                if (hv) Ui.round(g, bx0 + 3, y0, bx1 - 3, y0 + rh, Ui.CARD_HOVER);
                g.drawString(this.font, this.font.plainSubstrByWidth(h.label, bw - 120), bx0 + 10, y0 + 5, Ui.TEXT, false);
                int ww = this.font.width(h.where);
                int right = bx1 - 10;
                if (h.state != null) { Ui.toggle(g, right - 22, y0 + 3, animate("hit" + h.label, h.state), hv); right -= 28; }
                else { g.drawString(this.font, "›", right - 4, y0 + 5, Ui.ORANGE, false); right -= 10; }
                g.drawString(this.font, h.where, right - ww, y0 + 5, Ui.DIM, false);
                if (hv && pressed) { sound(); h.action.run(); return; }
            }
        } else if (hovered < 0) {
            String hint = "Click a petal, or just start typing to search";
            g.drawString(this.font, hint, cx - this.font.width(hint) / 2, by0 - 14, Ui.alpha(Ui.DIM, 0.8f), false);
        }
    }

    @Override public void onClose() { closeAll(); }

    /** Keeps the keyboard on the search bar even after clicking elsewhere. */
    @Override public void tick() { super.tick(); if (!input.isFocused()) focusInput(true); }

    @Override protected boolean rightShiftCloses() { return input.getValue().isEmpty(); }

    static boolean configTooltips() { return VexConfig.get().tooltips; }
}
