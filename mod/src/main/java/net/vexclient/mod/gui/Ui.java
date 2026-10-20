package net.vexclient.mod.gui;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Shared VEX look, drawn by hand (no vanilla buttons). The colours come from the theme picked in
 * GUI Settings (Sakura by default, like the launcher). The field names are historic: ORANGE is the theme's accent.
 */
public final class Ui {
    private Ui() {}

    /** name -> {accent, accentHi, accentDark, panel, side, card, cardHover, edge, purple, text, dim, off, onAccent} */
    public static final Map<String, int[]> THEMES = new LinkedHashMap<>();
    static {
        THEMES.put("Sakura", new int[]{0xFFFF6FB5, 0xFFFF9ACB, 0xFF9C2E66, 0xF21A0B19, 0xF2120713, 0xFF2B1229, 0xFF3D1A3A, 0xFF5E2A58, 0xFFB77DFF, 0xFFFBEAF4, 0xFFC99BBB, 0xFF4A2445, 0xFF2A0618});
        THEMES.put("Vex", new int[]{0xFFFF8A1F, 0xFFFFA64D, 0xFF9C4A06, 0xF2150C26, 0xF20E0819, 0xFF1E1236, 0xFF2A1A4B, 0xFF3A2463, 0xFFB46CFF, 0xFFF3EEFF, 0xFF9D8DC0, 0xFF3B2D58, 0xFF1A0C00});
        THEMES.put("Aurora", new int[]{0xFF4FE3B0, 0xFF8AF5D0, 0xFF1C7A5C, 0xF2061418, 0xF2040D10, 0xFF0E2328, 0xFF153239, 0xFF1F4A50, 0xFF7FB8FF, 0xFFE8FFF8, 0xFF8FBFB4, 0xFF1E3A3A, 0xFF02150F});
        THEMES.put("Midnight", new int[]{0xFF6F9BFF, 0xFF9DBBFF, 0xFF2C4C9C, 0xF20A0E1E, 0xF2060914, 0xFF141B33, 0xFF1D2747, 0xFF2D3A66, 0xFFB46CFF, 0xFFEEF2FF, 0xFF8D99C0, 0xFF262F52, 0xFF050B1F});
        THEMES.put("Mono", new int[]{0xFFC8C8D0, 0xFFE6E6EC, 0xFF6E6E78, 0xF2121214, 0xF20B0B0D, 0xFF1D1D21, 0xFF29292F, 0xFF3A3A42, 0xFF9F9FA8, 0xFFF2F2F5, 0xFF9A9AA3, 0xFF34343B, 0xFF111114});
    }

    public static int SHADE = 0xB0080412;
    public static int PANEL, SIDE, CARD, CARD_HOVER, EDGE, EDGE_SOFT, ORANGE, ORANGE_HI, ORANGE_DARK, PURPLE, TEXT, DIM, OFF, ON_ACCENT;
    public static final int GOOD = 0xFF5BFF7A;
    public static final int WARN = 0xFFFFC14F;
    public static final int BAD = 0xFFFF5B6E;
    /** The grey of the VEX logo (also used for the V badge). */
    public static final int LOGO = 0xFF8F8F96;
    private static String current = "";

    static { apply("Sakura"); }

    public static String theme() { return current; }

    public static void apply(String name) {
        int[] t = THEMES.getOrDefault(name, THEMES.get("Sakura"));
        current = THEMES.containsKey(name) ? name : "Sakura";
        ORANGE = t[0]; ORANGE_HI = t[1]; ORANGE_DARK = t[2]; PANEL = t[3]; SIDE = t[4]; CARD = t[5]; CARD_HOVER = t[6];
        EDGE = t[7]; EDGE_SOFT = (EDGE & 0x00FFFFFF) | 0x55000000; PURPLE = t[8]; TEXT = t[9]; DIM = t[10]; OFF = t[11]; ON_ACCENT = t[12];
    }

    /** Rectangle with 2px rounded corners. */
    public static void round(GuiGraphics g, int x0, int y0, int x1, int y1, int c) {
        if (x1 - x0 < 4 || y1 - y0 < 4) { g.fill(x0, y0, x1, y1, c); return; }
        g.fill(x0 + 2, y0, x1 - 2, y1, c);
        g.fill(x0 + 1, y0 + 1, x0 + 2, y1 - 1, c);
        g.fill(x1 - 2, y0 + 1, x1 - 1, y1 - 1, c);
        g.fill(x0, y0 + 2, x0 + 1, y1 - 2, c);
        g.fill(x1 - 1, y0 + 2, x1, y1 - 2, c);
    }

    /** Rounded rectangle with a 1px border. */
    public static void card(GuiGraphics g, int x0, int y0, int x1, int y1, int fill, int border) {
        round(g, x0, y0, x1, y1, border);
        round(g, x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill);
    }

    /** Filled ellipse centred on (cx, cy), drawn as 1px rows. */
    public static void ellipse(GuiGraphics g, float cx, float cy, float rx, float ry, int c) {
        if (rx < 1 || ry < 1) return;
        int r = (int) Math.ceil(ry);
        for (int dy = -r; dy < r; dy++) {
            double yy = (dy + 0.5) / ry;
            if (Math.abs(yy) > 1) continue;
            int w = (int) Math.round(rx * Math.sqrt(1 - yy * yy));
            if (w > 0) g.fill(Math.round(cx) - w, Math.round(cy) + dy, Math.round(cx) + w, Math.round(cy) + dy + 1, c);
        }
    }

    /** A circle outline of the given thickness (only the ring is drawn, so see-through fills stay clean). */
    public static void ring(GuiGraphics g, float cx, float cy, float r, float thick, int c) {
        float ri = r - thick;
        int n = (int) Math.ceil(r);
        for (int dy = -n; dy < n; dy++) {
            double yy = dy + 0.5;
            if (Math.abs(yy) > r) continue;
            int wo = (int) Math.round(Math.sqrt(r * r - yy * yy));
            int x = Math.round(cx), y = Math.round(cy) + dy;
            if (Math.abs(yy) >= ri) { g.fill(x - wo, y, x + wo, y + 1, c); continue; }
            int wi = (int) Math.round(Math.sqrt(ri * ri - yy * yy));
            if (wo > wi) { g.fill(x - wo, y, x - wi, y + 1, c); g.fill(x + wi, y, x + wo, y + 1, c); }
        }
    }

    /** See-through glass disc with a light outline (the Right Shift menu). */
    public static void glassCircle(GuiGraphics g, float cx, float cy, float r, float hover) {
        ellipse(g, cx, cy, r, r, alpha(mix(0xFFFFFFFF, ORANGE, 0.25f + 0.25f * hover), 0.08f + 0.10f * hover));
        ellipse(g, cx - r * 0.18f, cy - r * 0.30f, r * 0.62f, r * 0.42f, alpha(0xFFFFFFFF, 0.03f + 0.03f * hover)); // soft shine
        ring(g, cx, cy, r, 1f + hover, alpha(mix(0xFFFFFFFF, ORANGE_HI, hover), 0.70f + 0.25f * hover));
    }

    /** The big window: border, body, and an accent line along the top. */
    public static void panel(GuiGraphics g, int x0, int y0, int x1, int y1) {
        g.fill(x0 + 3, y0 + 3, x1 + 3, y1 + 3, 0x60000000); // drop shadow
        card(g, x0, y0, x1, y1, PANEL, EDGE);
        g.fill(x0 + 2, y0 + 1, x1 - 2, y0 + 2, ORANGE);
        g.fillGradient(x0 + 1, y0 + 2, x1 - 1, y0 + 30, (ORANGE & 0x00FFFFFF) | 0x30000000, ORANGE & 0x00FFFFFF);
    }

    /** The grey V logo, h pixels high (drawn with fills so it needs no texture). */
    public static void logo(GuiGraphics g, int x, int y, int h, int color) {
        int w = Math.max(1, h / 4);
        for (int i = 0; i < h; i++) {
            float t = i / (float) h;
            int off = Math.round(t * (h * 0.5f - w * 0.5f));
            g.fill(x + off, y + i, x + off + w, y + i + 1, color);
            g.fill(x + h - off - w, y + i, x + h - off, y + i + 1, color);
        }
    }

    /** "VEX CLIENT" with the grey V logo in front: VEX in the accent colour, CLIENT in white. */
    public static void title(GuiGraphics g, Font font, int x, int y, float scale) {
        String a = "VEX ", b = "CLIENT";
        var pose = g.pose();
        pose.pushMatrix();
        pose.translate(x, y);
        pose.scale(scale, scale);
        logo(g, 0, 0, 8, LOGO);
        int tx = 11;
        g.drawString(font, a, tx + 1, 1, ORANGE_DARK, false);
        g.drawString(font, a, tx, 0, ORANGE, false);
        g.drawString(font, b, tx + font.width(a) + 1, 1, 0xFF1A1020, false);
        g.drawString(font, b, tx + font.width(a), 0, TEXT, false);
        pose.popMatrix();
    }

    public static int titleWidth(Font font, float scale) { return Math.round((font.width("VEX CLIENT") + 11) * scale); }

    /** On/off switch, 22x11. t = 0 (off) .. 1 (on), animated by the caller. */
    public static void toggle(GuiGraphics g, int x, int y, float t, boolean hover) {
        int track = mix(OFF, ORANGE, t);
        if (hover) track = mix(track, 0xFFFFFFFF, 0.12f);
        round(g, x, y, x + 22, y + 11, track);
        int kx = x + 1 + Math.round(t * 11);
        round(g, kx, y + 1, kx + 10, y + 10, 0xFFFFFFFF);
        g.fill(kx + 1, y + 9, kx + 9, y + 10, 0x40000000);
    }

    /** Slider track with the filled part in the accent colour and a knob. f = 0..1. */
    public static void slider(GuiGraphics g, int x0, int y, int x1, float f, boolean hot) {
        g.fill(x0, y + 4, x1, y + 7, OFF);
        int k = x0 + Math.round(f * (x1 - x0));
        g.fill(x0, y + 4, k, y + 7, ORANGE);
        round(g, k - 3, y, k + 4, y + 11, hot ? ORANGE_HI : 0xFFFFFFFF);
    }

    /** Small pill button. style 0 = normal, 1 = accent, 2 = danger. */
    public static void chip(GuiGraphics g, Font font, int x0, int y0, int x1, int y1, String text, int style, boolean hover, boolean enabled) {
        int fill = switch (style) {
            case 1 -> hover ? ORANGE_HI : ORANGE;
            case 2 -> hover ? 0xFF5A1F2E : 0xFF3E1724;
            default -> hover ? mix(CARD_HOVER, 0xFFFFFFFF, 0.06f) : CARD_HOVER;
        };
        int border = style == 1 ? ORANGE_DARK : style == 2 ? 0xFF7A2A3C : EDGE;
        if (!enabled) { fill = CARD; border = EDGE_SOFT; }
        card(g, x0, y0, x1, y1, fill, border);
        int tc = !enabled ? DIM : style == 1 ? ON_ACCENT : style == 2 ? 0xFFFFB3BF : TEXT;
        g.drawString(font, text, (x0 + x1) / 2 - font.width(text) / 2, (y0 + y1) / 2 - 4, tc, false);
    }

    /** A dark tooltip box near (x, y), kept on screen. */
    public static void tooltip(GuiGraphics g, Font font, String text, int x, int y, int screenW, int screenH) {
        var lines = font.split(net.minecraft.network.chat.Component.literal(text), 180);
        int w = 0;
        for (var l : lines) w = Math.max(w, font.width(l));
        int h = lines.size() * 10;
        int tx = Math.min(x + 10, screenW - w - 8), ty = Math.max(4, Math.min(y + 10, screenH - h - 8));
        card(g, tx - 4, ty - 4, tx + w + 4, ty + h + 2, 0xF0100810, ORANGE_DARK);
        for (int i = 0; i < lines.size(); i++) g.drawString(font, lines.get(i), tx, ty + i * 10, TEXT, false);
    }

    public static int mix(int a, int b, float t) {
        t = Math.max(0, Math.min(1, t));
        int aa = a >>> 24, ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
        int ba = b >>> 24, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
        return Math.round(aa + (ba - aa) * t) << 24 | Math.round(ar + (br - ar) * t) << 16 | Math.round(ag + (bg - ag) * t) << 8 | Math.round(ab + (bb - ab) * t);
    }

    public static int alpha(int c, float a) { return (Math.round(Math.max(0, Math.min(1, a)) * (c >>> 24)) << 24) | (c & 0x00FFFFFF); }
}
